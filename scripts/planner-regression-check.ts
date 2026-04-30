import assert from "node:assert/strict";

import { hasBlockingErrors, validateDaySetupDraft } from "@/app/_lib/intake-flow";
import { mockPlannerState } from "@/app/_lib/mock-day-plan";
import {
  buildDraftPayloadFromParsedTasks,
  buildPlannerAiDraftLocalScaffold,
  buildPlannerAiReplanLocalScaffold,
  buildPlannerAiParseContext,
  buildPlannerAiReplanPayload,
  isPlannerAiParseHighConfidence,
} from "@/app/_lib/planner/ai/context";
import {
  createPlannerExportBundle,
  createPlannerExportSourceFromDraftScheduleResponse,
  selectPlannerExportSource,
} from "@/app/_lib/planner/export";
import { parsePlannerCsvImport } from "@/app/_lib/planner/csv-intake";
import {
  buildPlannerAiProviderOptions,
  DEFAULT_PLANNER_AI_TIMEOUT_POLICY,
  didPlannerAiHitOutputCap,
  getPlannerAiModelCapabilities,
  PLANNER_AI_PROMPT_CACHE_VERSION,
  shouldUseHighTierReplanModel,
} from "@/app/_lib/planner/ai/runtime";
import {
  evaluateDraftAiRefinement,
  evaluateReplanAiRefinement,
} from "@/app/_lib/planner/ai-refinement";
import {
  getPlannerAiResponseJsonSchema,
  plannerAiDraftResponseSchema,
  plannerAiParseResponseSchema,
  plannerAiReplanResponseSchema,
} from "@/app/_lib/planner/ai/schemas";
import { buildPlannerAiSystemPrompt } from "@/app/_lib/planner/ai/prompts";
import {
  translateAiDraftResponse,
  translateAiParseResponse,
  translateAiReplanResponse,
} from "@/app/_lib/planner/ai/translate";
import { parseFlexibleLocalDateTimeInput } from "@/app/_lib/planner/date-time";
import { interpretDaySetup } from "@/app/_lib/planner/interpret";
import {
  buildCountdownLabels,
  createBlockCountdownSnapshot,
} from "@/app/_lib/planner/timer";
import {
  getCarryForwardItemsForIntake,
  updateCarryForwardItemStatus,
} from "@/app/_lib/planner/carry-forward";
import type { PlannerDevScenario } from "@/app/_lib/planner/dev-scenarios";
import { plannerDevScenarios } from "@/app/_lib/planner/dev-scenarios";
import {
  analyzeRouteFlowSequence,
  inferTaskRouteFlowContext,
} from "@/app/_lib/planner/route-flow";
import {
  acceptDetectedTaskDueDate,
  addCarryForwardItemToIntake,
  applyPlannerCsvImport,
  buildDraftRoute,
  buildPlannerView,
  createPlannerStoreState,
  delayBlock,
  getPlannerStoreContext,
  interpretPlannerDraft,
  lockTaskToDetectedTime,
  loadPlannerDevScenario,
  loadPlannerStoreState,
  markBlockComplete,
  persistPlannerStoreState,
  applyDraftScheduleResult,
  returnToDaySetup,
  setBreakCadence,
  setRawText,
  setPlanningWindowField,
  setTaskEstimatedMinutes,
  setPlannerCurrentTime,
  skipBlock,
  togglePastBlockComplete,
} from "@/app/_lib/planner/store";
import {
  deriveDayPlanExecutionSnapshot,
  deriveTaskMinuteLedger,
  generateDraftSchedule,
  replanRemainingDay,
  synchronizeDayPlanToCurrentTime,
} from "@/app/_lib/planner/scheduler";
import {
  validateGeneratedDayPlan,
  validateReplannedDayPlan,
} from "@/app/_lib/planner/validation";
import type {
  CarryForwardItem,
  DraftScheduleResponse,
  DueWarning,
  HardEvent,
  MockPlannerState,
  PlanningWindow,
  ReplanPreview,
  Task,
} from "@/app/_lib/planner-types";

const BASE_OFFSET = "-08:00";

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
};

function buildScenarioIsoDateTime(date: string, time: string) {
  return `${date}T${time}:00${BASE_OFFSET}`;
}

function replaceIsoDate(isoDateTime: string, date: string) {
  return isoDateTime.replace(/^\d{4}-\d{2}-\d{2}/, date);
}

function assertOpenAiStrictObjectSchema(
  schema: JsonSchema,
  path: string[] = []
) {
  if (schema.properties) {
    const propertyKeys = Object.keys(schema.properties);

    assert.deepEqual(
      [...(schema.required ?? [])].sort(),
      [...propertyKeys].sort(),
      `OpenAI response schema at ${path.join(".") || "<root>"} must require every property key`
    );

    for (const [key, value] of Object.entries(schema.properties)) {
      assertOpenAiStrictObjectSchema(value, [...path, key]);
    }
  }

  if (schema.items) {
    assertOpenAiStrictObjectSchema(schema.items, [...path, "items"]);
  }

  for (const [index, value] of (schema.anyOf ?? []).entries()) {
    assertOpenAiStrictObjectSchema(value, [...path, `anyOf[${index}]`]);
  }

  for (const [index, value] of (schema.oneOf ?? []).entries()) {
    assertOpenAiStrictObjectSchema(value, [...path, `oneOf[${index}]`]);
  }

  for (const [index, value] of (schema.allOf ?? []).entries()) {
    assertOpenAiStrictObjectSchema(value, [...path, `allOf[${index}]`]);
  }
}

function buildScenarioState(scenario: PlannerDevScenario) {
  const scenarioDate = scenario.date ?? mockPlannerState.dayPlan.date;
  const currentTime = scenario.currentTime
    ? buildScenarioIsoDateTime(scenarioDate, scenario.currentTime)
    : replaceIsoDate(mockPlannerState.currentTime, scenarioDate);
  const planner = {
    ...mockPlannerState,
    currentTime,
    dayPlan: {
      ...mockPlannerState.dayPlan,
      date: scenarioDate,
      planningWindow: {
        startTime: replaceIsoDate(
          mockPlannerState.dayPlan.planningWindow.startTime,
          scenarioDate
        ),
        endTime: replaceIsoDate(
          mockPlannerState.dayPlan.planningWindow.endTime,
          scenarioDate
        ),
      },
      rawInput: {
        ...mockPlannerState.dayPlan.rawInput,
        createdAt: replaceIsoDate(
          mockPlannerState.dayPlan.rawInput.createdAt,
          scenarioDate
        ),
      },
    },
  };
  const context = getPlannerStoreContext(planner);
  let state = createPlannerStoreState(planner);

  state = loadPlannerDevScenario(state, context, scenario);
  state = interpretPlannerDraft(state, context);
  state = buildDraftRoute(state, planner, context);

  return {
    context,
    planner,
    state,
  };
}

function getComparableBlocks(dayPlan: ReturnType<typeof buildPlannerView>["dayPlan"]) {
  return dayPlan.blocks.map((block) => ({
    endTime: block.endTime,
    id: block.id,
    locked: block.locked,
    startTime: block.startTime,
    status: block.status,
    title: block.title,
  }));
}

function getTaskIdsWithRemainingMinutes(
  dayPlan: ReturnType<typeof buildPlannerView>["dayPlan"]
) {
  const scheduledMinutesByTaskId = new Map<string, number>();

  dayPlan.blocks.forEach((block) => {
    if (!block.taskId) {
      return;
    }

    scheduledMinutesByTaskId.set(
      block.taskId,
      (scheduledMinutesByTaskId.get(block.taskId) ?? 0) +
        Math.round(
          (new Date(block.endTime).getTime() - new Date(block.startTime).getTime()) /
            60000
        )
    );
  });

  return dayPlan.tasks
    .filter(
      (task) =>
        !dayPlan.completedTaskIds?.includes(task.id) &&
        task.estimatedMinutes > (scheduledMinutesByTaskId.get(task.id) ?? 0)
    )
    .map((task) => task.id);
}

function getScenarioById(id: string) {
  const scenario = plannerDevScenarios.find((item) => item.id === id);

  assert.ok(scenario, `Missing dev scenario: ${id}`);
  return scenario;
}

function getDraftScheduleResponse(state: ReturnType<typeof buildScenarioState>["state"]) {
  assert.ok(state.draftScheduleResponse, "expected a built draft route");
  return state.draftScheduleResponse;
}

function buildDirectDraftRoute({
  breakCadence = "focus_50",
  breakMode = "restful",
  currentTime,
  date = "2026-03-25",
  hardEvents = [],
  paceMode = "finish_sooner",
  planningWindow,
  rawText = "synthetic",
  tasks,
}: {
  breakCadence?: "focus_25" | "focus_45" | "focus_50" | "focus_90";
  breakMode?: "productive" | "restful";
  currentTime: string;
  date?: string;
  hardEvents?: HardEvent[];
  paceMode?: "finish_sooner" | "spread_out";
  planningWindow: PlanningWindow;
  rawText?: string;
  tasks: Task[];
}): DraftScheduleResponse {
  const planner = {
    ...mockPlannerState,
    currentTime,
    dayPlan: {
      ...mockPlannerState.dayPlan,
      date,
      planningWindow,
      rawInput: {
        ...mockPlannerState.dayPlan.rawInput,
        createdAt: replaceIsoDate(mockPlannerState.dayPlan.rawInput.createdAt, date),
        rawText,
      },
      tasks,
      hardEvents,
      paceMode,
      completedTaskIds: [],
    },
  };

  return generateDraftSchedule({
    breakCadence,
    breakMode,
    paceMode,
    currentTime,
    hardEvents,
    planner,
    planningWindow,
    rawText,
    tasks,
  });
}

function buildDraftSeedDayPlan(
  planner: MockPlannerState,
  state: ReturnType<typeof buildScenarioState>["state"]
) {
  const parsedTaskResponse = state.parsedTaskResponse;

  assert.ok(parsedTaskResponse, "expected parsed tasks before building an AI draft seed");

  const completedTaskIds =
    state.stage === "draft_route" && state.draftScheduleResponse
      ? state.draftScheduleResponse.dayPlan.completedTaskIds ??
        planner.dayPlan.completedTaskIds ??
        []
      : planner.dayPlan.completedTaskIds ?? [];

  return {
    ...planner.dayPlan,
    planningWindow: {
      startTime: replaceIsoDate(
        planner.dayPlan.planningWindow.startTime,
        planner.dayPlan.date
      ),
      endTime: replaceIsoDate(
        planner.dayPlan.planningWindow.endTime,
        planner.dayPlan.date
      ),
    },
    rawInput: {
      ...planner.dayPlan.rawInput,
      rawText: state.intakeDraft.rawText,
    },
    tasks: parsedTaskResponse.tasks,
    hardEvents: parsedTaskResponse.hardEvents,
    blocks: [],
    breakMode: state.intakeDraft.breakMode,
    breakCadence: state.intakeDraft.breakCadence,
    completedTaskIds,
    updatedAt: planner.currentTime,
  };
}

function toPlannerAiTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    rawText: task.rawText,
    type: task.type,
    estimatedMinutes: task.estimatedMinutes,
    priority: task.priority,
    mustDoToday: task.mustDoToday,
    breakEligible: task.breakEligible,
    splittable: task.splittable,
    deferrable: task.deferrable,
    deferCount: task.deferCount,
    delayedCount: task.delayedCount,
    energyLevel: task.energyLevel,
    dueAt: task.dueAt,
    hardStartTime: task.hardStartTime,
    hardEndTime: task.hardEndTime,
    carryForward: task.carryForward,
    carriedFromDate: task.carriedFromDate,
    carryForwardReason: task.carryForwardReason,
    carryForwardStatus: task.carryForwardStatus,
    notes: task.notes,
    source: task.source,
  };
}

function createRegressionTask({
  id,
  title,
  overrides = {},
}: {
  id: string;
  title: string;
  overrides?: Partial<Task>;
}): Task {
  return {
    id,
    title,
    rawText: title,
    type: "other",
    estimatedMinutes: 30,
    priority: "medium",
    mustDoToday: false,
    breakEligible: false,
    splittable: false,
    deferrable: true,
    energyLevel: "medium",
    source: "user",
    ...overrides,
  };
}

function toPlannerAiBlock(
  block: DraftScheduleResponse["dayPlan"]["blocks"][number]
) {
  return {
    id: block.id,
    taskId: block.taskId,
    title: block.title,
    blockType: block.blockType,
    startTime: block.startTime,
    endTime: block.endTime,
    status: block.status,
    locked: block.locked,
    source: block.source,
    isBreakEligibleTaskPlacement: block.isBreakEligibleTaskPlacement,
    notes: block.notes,
  };
}

function assertGeneratedRouteIsValid(
  label: string,
  currentTime: string,
  dayPlan: ReturnType<typeof buildPlannerView>["dayPlan"],
  unplacedTasks: ReturnType<typeof getDraftScheduleResponse>["unplacedTasks"],
  options?: {
    allowProductiveBreaks?: boolean;
    carryForwardItems?: CarryForwardItem[];
    dueWarnings?: DueWarning[];
    strictSplittableAccounting?: boolean;
  }
) {
  const validation = validateGeneratedDayPlan(dayPlan, {
    currentTime,
    allowProductiveBreaks: options?.allowProductiveBreaks,
    carryForwardItems: options?.carryForwardItems,
    dueWarnings: options?.dueWarnings,
    unplacedTasks,
  });

  assert.equal(
    validation.isValid,
    true,
    `${label}: ${validation.warnings.join(" | ")}`
  );

  assertTaskMinuteAccounting(label, dayPlan, currentTime, {
    carryForwardItems: options?.carryForwardItems,
    strictSplittableAccounting: options?.strictSplittableAccounting ?? true,
  });
}

function assertTaskMinuteAccounting(
  label: string,
  dayPlan: ReturnType<typeof buildPlannerView>["dayPlan"],
  currentTime: string,
  options?: {
    carryForwardItems?: CarryForwardItem[];
    strictSplittableAccounting?: boolean;
  }
) {
  deriveTaskMinuteLedger(
    dayPlan,
    currentTime,
    options?.carryForwardItems ?? []
  )
    .filter((entry) => !entry.isCompleted)
    .forEach((entry) => {
      const accountedMinutes =
        entry.historyMinutes +
        entry.futurePlacedMinutes +
        entry.remainingUnplacedMinutes +
        entry.remainingCarriedForwardMinutes;
      const hasPlacedFutureMinutes = entry.futurePlacedMinutes > 0;
      const hasUnplacedMinutes = entry.remainingUnplacedMinutes > 0;
      const hasCarryForwardMinutes = entry.remainingCarriedForwardMinutes > 0;

      assert.equal(
        hasPlacedFutureMinutes && hasUnplacedMinutes && hasCarryForwardMinutes,
        false,
        `${label}: "${entry.task.title}" cannot be scheduled today, unplaced today, and carried forward at the same time`
      );

      if (!entry.task.splittable) {
        assert.equal(
          hasPlacedFutureMinutes && (hasUnplacedMinutes || hasCarryForwardMinutes),
          false,
          `${label}: "${entry.task.title}" is non-splittable but its remaining work was split across today and carry forward`
        );
      }

      assert.ok(
        accountedMinutes >= entry.task.estimatedMinutes - 1,
        `${label}: "${entry.task.title}" lost minutes across history, future placement, and remaining work`
      );

      if (
        options?.strictSplittableAccounting !== false &&
        entry.task.splittable
      ) {
        assert.ok(
          Math.abs(accountedMinutes - entry.task.estimatedMinutes) <= 1,
          `${label}: "${entry.task.title}" minute accounting drifted (${accountedMinutes} vs ${entry.task.estimatedMinutes})`
        );
      }
    });
}

function assertCurrentTimeState(
  label: string,
  dayPlan: ReturnType<typeof buildPlannerView>["dayPlan"],
  currentTime: string,
  expectedState: ReturnType<typeof deriveDayPlanExecutionSnapshot>["currentTimeState"]
) {
  const execution = deriveDayPlanExecutionSnapshot(dayPlan, currentTime);

  assert.equal(
    execution.currentTimeState,
    expectedState,
    `${label}: expected current-time state ${expectedState}, received ${execution.currentTimeState}`
  );

  if (
    expectedState === "before_first_block" ||
    expectedState === "between_blocks" ||
    expectedState === "after_last_block" ||
    expectedState === "terminal_history_overlap"
  ) {
    assert.ok(
      execution.currentDisplayBlock?.blockType === "buffer",
      `${label}: expected a visible open-time buffer block`
    );
  }

  if (
    expectedState === "before_first_block" ||
    expectedState === "between_blocks"
  ) {
    assert.ok(execution.nextBlock, `${label}: expected a next block in open time`);
  }

  if (expectedState === "after_last_block") {
    assert.equal(
      execution.nextBlock,
      null,
      `${label}: should not expose a next block after the route ends`
    );
  }
}

function assertReplanIsValid(
  label: string,
  currentTime: string,
  dayPlan: ReturnType<typeof buildPlannerView>["dayPlan"],
  replanMode: Parameters<typeof replanRemainingDay>[0]["replanMode"] = "replan_from_now"
) {
  const preview = replanRemainingDay({
    currentTime,
    dayPlan,
    replanMode,
  });
  const validation = validateReplannedDayPlan({
    currentTime,
    nextDayPlan: preview.dayPlan,
    previousDayPlan: dayPlan,
    allowProductiveBreaks:
      dayPlan.breakMode === "productive" ||
      replanMode === "use_productive_breaks",
    carryForwardItems: preview.carryForwardItems,
    dueWarnings: preview.dueWarnings,
    unplacedTasks: preview.unplacedTasks,
  });

  assert.equal(
    validation.isValid,
    true,
    `${label}: ${validation.warnings.join(" | ")}`
  );

  assertTaskMinuteAccounting(label, preview.dayPlan, currentTime, {
    carryForwardItems: preview.carryForwardItems,
  });
}

{
  for (const [flow, policy] of Object.entries(DEFAULT_PLANNER_AI_TIMEOUT_POLICY)) {
    assert.equal(
      policy.upstreamMs > policy.hardMs,
      true,
      `${flow} AI timeout policy should keep upstream timeout above the client hard stop`
    );
    assert.equal(
      policy.softMs < policy.hardMs,
      true,
      `${flow} AI timeout policy should keep the slow prompt below the client hard stop`
    );
  }
}

{
  const scenario = getScenarioById("late-day-replan-stress-test");
  const { planner, state, context } = buildScenarioState(scenario);
  const view = buildPlannerView(planner, state, context);
  const preview = replanRemainingDay({
    currentTime: planner.currentTime,
    dayPlan: view.dayPlan,
    replanMode: "use_productive_breaks",
  });

  assert.equal(
    preview.summary.stayedOutTaskCount,
    preview.carryForwardItems.length,
    "late-day-replan-stress-test: stayed-out count should match the revised carry-forward list"
  );
  assert.equal(
    preview.summary.stayedOutTaskCount,
    preview.summary.deferredOptionalTaskCount +
      preview.summary.forcedUnplacedTaskCount,
    "late-day-replan-stress-test: split replan counts should add up to the total stayed-out count"
  );
  assert.equal(
    preview.summary.deferredOptionalTaskCount,
    preview.carryForwardItems.filter(
      (task) => task.unplacedReason === "lower_priority_deferred"
    ).length,
    "late-day-replan-stress-test: deferred optional count should match lower-priority carry-forward tasks"
  );
  assert.equal(
    preview.summary.forcedUnplacedTaskCount,
    preview.carryForwardItems.filter(
      (task) => task.unplacedReason !== "lower_priority_deferred"
    ).length,
    "late-day-replan-stress-test: forced carry-forward count should match non-deferred tasks"
  );
}

{
  const scenario = getScenarioById("overloaded-liar-detector-day");
  const { planner, state, context } = buildScenarioState(scenario);
  const view = buildPlannerView(planner, state, context);
  const preview = replanRemainingDay({
    currentTime: planner.currentTime,
    dayPlan: view.dayPlan,
    replanMode: "use_productive_breaks",
  });
  const remainingTaskIds = getTaskIdsWithRemainingMinutes(preview.dayPlan);
  const remainderTaskIds = new Set([
    ...preview.unplacedTasks.map((task) => task.taskId),
    ...preview.carryForwardItems.map((item) => item.taskId),
  ]);

  remainingTaskIds.forEach((taskId) => {
    assert.ok(
      remainderTaskIds.has(taskId),
      `overloaded-liar-detector-day: task ${taskId} still has unscheduled minutes and must stay visible in today's overflow accounting`
    );
  });
}

{
  const currentTime = buildScenarioIsoDateTime("2026-03-25", "09:50");
  const response = buildDirectDraftRoute({
    currentTime,
    planningWindow: {
      startTime: buildScenarioIsoDateTime("2026-03-25", "09:00"),
      endTime: buildScenarioIsoDateTime("2026-03-25", "12:00"),
    },
    rawText: "replan-from-now-should-recapture-missed-past-work",
    tasks: [
      {
        id: "task-missed-past-block",
        title: "Missed earlier task",
        type: "other",
        estimatedMinutes: 30,
        priority: "high",
        mustDoToday: true,
        breakEligible: false,
        splittable: false,
        deferrable: false,
        deferCount: 0,
        energyLevel: "medium",
        source: "user",
      },
      {
        id: "task-current-block",
        title: "Current task",
        type: "deep_work",
        estimatedMinutes: 45,
        priority: "medium",
        mustDoToday: false,
        breakEligible: false,
        splittable: true,
        deferrable: true,
        deferCount: 0,
        energyLevel: "high",
        source: "user",
      },
      {
        id: "task-later-block",
        title: "Later task",
        type: "admin",
        estimatedMinutes: 30,
        priority: "medium",
        mustDoToday: false,
        breakEligible: false,
        splittable: false,
        deferrable: true,
        deferCount: 0,
        energyLevel: "low",
        source: "user",
      },
    ],
  });
  const preview = replanRemainingDay({
    currentTime,
    dayPlan: response.dayPlan,
    replanMode: "replan_from_now",
  });
  const futureOrOverflowTaskIds = new Set([
    ...preview.dayPlan.blocks
      .filter((block) => new Date(block.endTime).getTime() > new Date(currentTime).getTime())
      .map((block) => block.taskId)
      .filter(Boolean),
    ...preview.unplacedTasks.map((task) => task.taskId),
    ...preview.carryForwardItems.map((item) => item.taskId),
  ]);

  assert.equal(
    futureOrOverflowTaskIds.has("task-missed-past-block"),
    true,
    "replan from now should move unfinished past work back into the remaining route instead of dropping it into preserved history"
  );
  assert.equal(
    preview.dayPlan.blocks.some(
      (block) =>
        block.taskId === "task-missed-past-block" &&
        new Date(block.endTime).getTime() <= new Date(currentTime).getTime()
    ),
    false,
    "replan from now should not preserve an unfinished past task block as if it were completed history"
  );
}

{
  const interpreted = interpretDaySetup({
    context: getPlannerStoreContext(mockPlannerState),
    draft: {
      csvText: "",
      inputMode: "brain_dump",
      rawText: "by 12:30 finish slides",
      profileName: "",
      profileJourney: "building",
      profilePriorities: ["focus", "learning"],
      profileRhythm: "",
      profilePreference: "",
      planningStart: "08:00",
      planningEnd: "18:00",
      breakMode: "restful",
      breakCadence: "focus_50",
      paceMode: "finish_sooner",
      fixedEvents: [],
    },
  });
  const dueSuggestionTask = interpreted.tasks[0];

  assert.equal(
    dueSuggestionTask?.dueDatePreference?.displayLabel,
    "12:30 PM",
    'phrases like "by 12:30" should produce a suggested due time'
  );
  assert.equal(
    dueSuggestionTask?.timingPreference?.kind,
    undefined,
    'phrases like "by 12:30" should not be treated as lock-to-time suggestions'
  );
}

{
  const planningWindow = {
    startTime: "2026-03-25T08:00:00-08:00",
    endTime: "2026-03-25T16:00:00-08:00",
  };
  const tasks: Task[] = [
    {
      id: "task-spread-review",
      title: "Review notes",
      rawText: "review notes 60m",
      type: "deep_work",
      estimatedMinutes: 60,
      priority: "high",
      mustDoToday: true,
      breakEligible: false,
      splittable: true,
      deferrable: false,
      energyLevel: "high",
      source: "user",
    },
    {
      id: "task-spread-email",
      title: "Reply to email",
      rawText: "reply to email 20m",
      type: "admin",
      estimatedMinutes: 20,
      priority: "medium",
      mustDoToday: true,
      breakEligible: true,
      splittable: false,
      deferrable: false,
      energyLevel: "low",
      source: "user",
    },
    {
      id: "task-spread-study",
      title: "Study cardiology",
      rawText: "study cardiology 90m",
      type: "deep_work",
      estimatedMinutes: 90,
      priority: "high",
      mustDoToday: true,
      breakEligible: false,
      splittable: true,
      deferrable: false,
      energyLevel: "high",
      source: "user",
    },
    {
      id: "task-spread-laundry",
      title: "Fold laundry",
      rawText: "fold laundry 20m",
      type: "chore",
      estimatedMinutes: 20,
      priority: "low",
      mustDoToday: false,
      breakEligible: true,
      splittable: false,
      deferrable: true,
      energyLevel: "low",
      source: "user",
    },
  ];

  const finishSoonerRoute = buildDirectDraftRoute({
    currentTime: "2026-03-25T08:00:00-08:00",
    planningWindow,
    tasks,
    paceMode: "finish_sooner",
  });
  const spreadOutRoute = buildDirectDraftRoute({
    currentTime: "2026-03-25T08:00:00-08:00",
    planningWindow,
    tasks,
    paceMode: "spread_out",
  });
  const finishSoonerTaskOrder = finishSoonerRoute.dayPlan.blocks
    .filter((block) => Boolean(block.taskId))
    .map((block) => block.taskId);
  const spreadOutTaskOrder = spreadOutRoute.dayPlan.blocks
    .filter((block) => Boolean(block.taskId))
    .map((block) => block.taskId);
  const finishSoonerLastTaskEndMs = Math.max(
    ...finishSoonerRoute.dayPlan.blocks
      .filter((block) => block.blockType !== "buffer")
      .map((block) => new Date(block.endTime).getTime())
  );
  const spreadOutLastTaskEndMs = Math.max(
    ...spreadOutRoute.dayPlan.blocks
      .filter((block) => block.blockType !== "buffer")
      .map((block) => new Date(block.endTime).getTime())
  );

  assert.deepEqual(
    spreadOutTaskOrder,
    finishSoonerTaskOrder,
    "spread-out pacing should preserve the base task order"
  );
  assert.equal(
    finishSoonerRoute.dayPlan.blocks.some((block) => block.blockType === "buffer"),
    false,
    "finish-sooner pacing should preserve the existing front-loaded behavior"
  );
  assert.equal(
    spreadOutRoute.dayPlan.blocks.some((block) => block.blockType === "buffer"),
    true,
    "spread-out pacing should insert visible open-time buffers when the day has slack"
  );
  assert.ok(
    spreadOutLastTaskEndMs > finishSoonerLastTaskEndMs,
    "spread-out pacing should push the final planned task later in the day when slack exists"
  );
}

{
  const planningWindow = {
    startTime: "2026-03-25T08:00:00-08:00",
    endTime: "2026-03-25T17:00:00-08:00",
  };
  const tasks: Task[] = [
    {
      id: "task-replan-spread-1",
      title: "Review flashcards",
      rawText: "review flashcards 30m",
      type: "deep_work",
      estimatedMinutes: 30,
      priority: "high",
      mustDoToday: true,
      breakEligible: false,
      splittable: false,
      deferrable: false,
      energyLevel: "high",
      source: "user",
    },
    {
      id: "task-replan-spread-2",
      title: "Study cardiology",
      rawText: "study cardiology 90m",
      type: "deep_work",
      estimatedMinutes: 90,
      priority: "high",
      mustDoToday: true,
      breakEligible: false,
      splittable: true,
      deferrable: false,
      energyLevel: "high",
      source: "user",
    },
    {
      id: "task-replan-spread-3",
      title: "Reply to email",
      rawText: "reply to email 15m",
      type: "admin",
      estimatedMinutes: 15,
      priority: "medium",
      mustDoToday: true,
      breakEligible: true,
      splittable: false,
      deferrable: false,
      energyLevel: "low",
      source: "user",
    },
  ];
  const anchoredRoute = buildDirectDraftRoute({
    currentTime: "2026-03-25T08:00:00-08:00",
    hardEvents: [
      {
        id: "hard-event-lunch",
        title: "Lunch",
        startTime: "2026-03-25T12:00:00-08:00",
        endTime: "2026-03-25T12:30:00-08:00",
        locked: true,
        source: "user",
      },
    ],
    planningWindow,
    tasks,
    paceMode: "spread_out",
  });
  const replannedRoute = replanRemainingDay({
    currentTime: "2026-03-25T10:15:00-08:00",
    dayPlan: synchronizeDayPlanToCurrentTime(
      anchoredRoute.dayPlan,
      "2026-03-25T10:15:00-08:00"
    ),
    replanMode: "replan_from_now",
  });

  assert.equal(
    replannedRoute.dayPlan.paceMode,
    "spread_out",
    "replanning should preserve the selected spread-out pace mode"
  );
  assert.equal(
    replannedRoute.dayPlan.blocks.some(
      (block) =>
        block.blockType === "buffer" &&
        new Date(block.endTime).getTime() >
          new Date("2026-03-25T10:15:00-08:00").getTime()
    ),
    true,
    "spread-out replans should keep visible open-time buffers when the remainder still has slack"
  );
}

{
  assert.equal(
    parseFlexibleLocalDateTimeInput("320263p"),
    "2026-03-20T15:00",
    "compact due shorthand should parse month/day/year/time input"
  );
  assert.equal(
    parseFlexibleLocalDateTimeInput("3/20/26 3:15p"),
    "2026-03-20T15:15",
    "slash-style due shorthand should parse with minutes"
  );
}

{
  const csvText = [
    "task name,from,stop,block type,priority,deadline,required,details",
    "Study cardiology,10:20,11:10,focus,high,2:30p,,Review chapters",
    "Lunch with preceptor,12:00,13:00,appointment,high,,,Discuss cases",
    "Midday review,13:30,14:00,focus,medium,,required,Conference room",
    ",09:00,09:30,appointment,high,,,",
    "Errand pickup,25:00,25:30,errand,low,,,",
  ].join("\n");
  const csvImport = parsePlannerCsvImport({
    csvText,
    date: "2026-03-25",
    offset: BASE_OFFSET,
  });
  const importedTask = csvImport.parsedTaskResponse.tasks[0];
  const importedKeywordAnchor = csvImport.parsedTaskResponse.hardEvents[0];
  const importedRequiredAnchor = csvImport.parsedTaskResponse.hardEvents[1];

  assert.equal(
    csvImport.summary.rowCount,
    5,
    "CSV import should count non-empty data rows under the header"
  );
  assert.equal(
    csvImport.summary.taskCount,
    1,
    "CSV import should map non-anchor timed rows into reviewable tasks"
  );
  assert.equal(
    csvImport.summary.fixedEventCount,
    2,
    "CSV import should map explicit and appointment-like rows into anchors"
  );
  assert.equal(
    csvImport.summary.issueCount,
    2,
    "CSV import should surface row issues for missing titles and invalid times"
  );
  assert.equal(
    importedTask.estimatedMinutes,
    50,
    "CSV import should derive task duration from start and end times"
  );
  assert.equal(
    importedTask.timingPreference?.kind,
    "time_anchored_unconfirmed",
    "CSV import should land timed non-anchor rows in the existing timing review flow"
  );
  assert.ok(
    importedTask.dueAt?.includes("2026-03-25T14:30:00"),
    "CSV import should bind time-only due values onto the active planner date"
  );
  assert.equal(
    importedKeywordAnchor.title,
    "Lunch With Preceptor",
    "CSV import should infer anchors from appointment-like type hints"
  );
  assert.equal(
    importedRequiredAnchor.notes,
    "Conference room",
    "CSV import should preserve notes on required anchor rows"
  );
  assert.ok(
    csvImport.rowIssues.some((issue) =>
      issue.message.includes("Each row needs a title")
    ),
    "CSV import should reject rows without a title"
  );
  assert.ok(
    csvImport.rowIssues.some((issue) =>
      issue.message.includes('Could not parse the start time "25:00"')
    ),
    "CSV import should reject rows with invalid time values"
  );
}

{
  const planner = structuredClone(mockPlannerState);
  let state = createPlannerStoreState(planner);
  const context = getPlannerStoreContext(planner);
  const csvText = [
    "title,start,end,type,required",
    "Study cardiology,10:20,11:10,focus,",
    "Lunch with preceptor,12:00,13:00,appointment,",
  ].join("\n");
  const csvImport = parsePlannerCsvImport({
    csvText,
    date: planner.dayPlan.date,
    offset: BASE_OFFSET,
  });

  state = setRawText(state, context, "review nephrology 45m");
  state = interpretPlannerDraft(state, context);
  state = applyPlannerCsvImport(state, context, csvImport);

  assert.equal(
    state.stage,
    "interpretation",
    "CSV import should land in the structured review stage"
  );
  assert.equal(
    state.intakeDraft.inputMode,
    "csv",
    "CSV import should preserve CSV as the active intake mode"
  );
  assert.equal(
    state.intakeDraft.csvText,
    csvText,
    "CSV import should preserve the pasted CSV text for later review"
  );
  assert.equal(
    state.intakeDraft.rawText,
    "",
    "CSV import should replace the previous brain dump instead of merging it"
  );
  assert.equal(
    state.parsedTaskResponse?.tasks[0]?.timingPreference?.kind,
    "time_anchored_unconfirmed",
    "CSV-imported timed tasks should reuse the existing lock-or-keep-flexible review flow"
  );

  state = buildDraftRoute(state, planner, context);

  assert.equal(
    state.stage,
    "draft_route",
    "CSV-imported tasks and anchors should build through the existing route pipeline"
  );
  assert.ok(
    state.draftScheduleResponse?.dayPlan.hardEvents.some((event) =>
      event.title.includes("Lunch")
    ),
    "CSV-imported anchors should survive into the generated route"
  );
}

{
  const planner = structuredClone(mockPlannerState);
  let state = createPlannerStoreState(planner);
  const context = getPlannerStoreContext(planner);

  state = setRawText(
    state,
    context,
    "by 12:30 finish slides\n3 pm maybe call pharmacy?"
  );
  state = interpretPlannerDraft(state, context);

  const dueTaskId = state.parsedTaskResponse?.tasks[0]?.id;
  const timedTaskId = state.parsedTaskResponse?.tasks[1]?.id;

  assert.ok(dueTaskId, "expected a due-suggested task during edit preservation");
  assert.ok(timedTaskId, "expected a time-detected task during edit preservation");

  state = setTaskEstimatedMinutes(state, dueTaskId!, 55);
  state = acceptDetectedTaskDueDate(state, dueTaskId!);
  state = lockTaskToDetectedTime(state, context, timedTaskId!);
  state = buildDraftRoute(state, planner, context);
  state = returnToDaySetup(state);
  state = interpretPlannerDraft(state, context);

  const preservedDueTask = state.parsedTaskResponse?.tasks.find(
    (task) => task.id === dueTaskId
  );
  const preservedTimedTask = state.parsedTaskResponse?.tasks.find(
    (task) => task.id === timedTaskId
  );

  assert.equal(
    preservedDueTask?.estimatedMinutes,
    55,
    "reviewed duration edits should survive build -> back -> interpret"
  );
  assert.ok(
    preservedDueTask?.dueAt?.includes("T12:30:00"),
    "accepted due times should survive build -> back -> interpret"
  );
  assert.ok(
    preservedTimedTask?.hardStartTime?.includes("T15:00:00"),
    "locked task times should survive build -> back -> interpret"
  );
}

{
  const originalWindow = globalThis.window;
  const scenario = getScenarioById("late-day-replan-stress-test");
  const { planner, state } = buildScenarioState(scenario);
  const overriddenCurrentTime = "2026-03-25T17:15:00-08:00";
  const synchronizedState = setPlannerCurrentTime(state, overriddenCurrentTime);
  let storedValue = "";

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem() {
          return storedValue || null;
        },
        setItem(_key: string, value: string) {
          storedValue = value;
        },
      },
    },
  });

  persistPlannerStoreState(synchronizedState, {
    plannerCurrentTime: overriddenCurrentTime,
    selectedReplanMode: "gentler_remainder",
    selectedScenarioId: scenario.id,
  });

  const loadedSession = loadPlannerStoreState(planner);

  if (originalWindow) {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }

  assert.ok(loadedSession, "expected persisted planner session to reload");
  assert.equal(
    loadedSession.plannerCurrentTime,
    overriddenCurrentTime,
    "planner current time override should persist across reloads"
  );
  assert.equal(
    loadedSession.selectedScenarioId,
    scenario.id,
    "selected dev scenario should persist across reloads"
  );
  assert.equal(
    loadedSession.selectedReplanMode,
    "gentler_remainder",
    "persisted session may store the last selected replan mode"
  );
  assert.equal(
    loadedSession.plannerState.draftScheduleResponse?.dayPlan.activeBlockId,
    synchronizedState.draftScheduleResponse?.dayPlan.activeBlockId,
    "reloaded planner state should preserve the same active block at the persisted current time"
  );
  assert.ok(
    loadedSession.plannerState.draftScheduleResponse,
    "expected hydrated draft schedule response to remain present"
  );
  assertGeneratedRouteIsValid(
    "cold-start hydration with persisted state",
    overriddenCurrentTime,
    loadedSession.plannerState.draftScheduleResponse.dayPlan,
    loadedSession.plannerState.draftScheduleResponse.unplacedTasks,
    {
      allowProductiveBreaks:
        loadedSession.plannerState.draftScheduleResponse.dayPlan.breakMode ===
        "productive",
      carryForwardItems:
        loadedSession.plannerState.draftScheduleResponse.carryForwardItems,
      dueWarnings:
        loadedSession.plannerState.draftScheduleResponse.dueWarnings,
      strictSplittableAccounting: false,
    }
  );
}

{
  const originalWindow = globalThis.window;
  const scenario = getScenarioById("execution-continuity-test");
  const { planner, state } = buildScenarioState(scenario);
  const legacyTaskShape = (task: Task) => {
    const {
      carriedFromDate,
      carryForward,
      carryForwardReason,
      carryForwardStatus,
      deferCount,
      delayedCount,
      dueAt,
      ...legacyTask
    } = task;

    void carriedFromDate;
    void carryForward;
    void carryForwardReason;
    void carryForwardStatus;
    void deferCount;
    void delayedCount;
    void dueAt;

    return legacyTask;
  };
  let storedValue = "";

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem() {
          return storedValue || null;
        },
        setItem(_key: string, value: string) {
          storedValue = value;
        },
      },
    },
  });

  storedValue = JSON.stringify({
    plannerCurrentTime: planner.currentTime,
    plannerState: {
      stage: state.stage,
      intakeDraft: state.intakeDraft,
      warnings: state.warnings,
      parsedTaskResponse: state.parsedTaskResponse
        ? {
            ...state.parsedTaskResponse,
            tasks: state.parsedTaskResponse.tasks.map(legacyTaskShape),
          }
        : null,
      draftScheduleResponse: state.draftScheduleResponse
        ? {
            dayPlan: {
              ...state.draftScheduleResponse.dayPlan,
              tasks: state.draftScheduleResponse.dayPlan.tasks.map(legacyTaskShape),
            },
            unplacedTasks: state.draftScheduleResponse.unplacedTasks,
            warnings: state.draftScheduleResponse.warnings,
          }
        : null,
      plannerWarnings: state.plannerWarnings,
    },
    selectedScenarioId: scenario.id,
  });

  const loadedSession = loadPlannerStoreState(planner);

  if (originalWindow) {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }

  assert.ok(
    loadedSession,
    "expected legacy persisted planner payload to hydrate successfully"
  );
  assert.deepEqual(
    loadedSession.plannerState.intakeCarryForwardItems,
    [],
    "legacy hydration should default missing intake carry-forward state to an empty list"
  );
  assert.ok(
    Array.isArray(loadedSession.plannerState.draftScheduleResponse?.carryForwardItems),
    "legacy hydration should synthesize a carry-forward list even when the saved payload omitted it"
  );
  assert.ok(
    Array.isArray(loadedSession.plannerState.draftScheduleResponse?.dueWarnings),
    "legacy hydration should synthesize due warnings even when the saved payload omitted them"
  );

  const hydratedDraftScheduleResponse = loadedSession.plannerState.draftScheduleResponse;

  assert.ok(
    hydratedDraftScheduleResponse,
    "legacy hydration should preserve the built draft route"
  );
  assertGeneratedRouteIsValid(
    "legacy hydration without carry-forward fields",
    planner.currentTime,
    hydratedDraftScheduleResponse.dayPlan,
    hydratedDraftScheduleResponse.unplacedTasks,
    {
      allowProductiveBreaks:
        hydratedDraftScheduleResponse.dayPlan.breakMode === "productive",
      carryForwardItems: hydratedDraftScheduleResponse.carryForwardItems,
      dueWarnings: hydratedDraftScheduleResponse.dueWarnings,
      strictSplittableAccounting: false,
    }
  );
}

{
  const currentTime = "2026-03-25T09:00:00-08:00";
  const planningWindow = {
    startTime: "2026-03-25T09:00:00-08:00",
    endTime: "2026-03-25T12:00:00-08:00",
  };
  const response = buildDirectDraftRoute({
    currentTime,
    planningWindow,
    hardEvents: [
      {
        id: "due-overload-anchor",
        title: "Clinic huddle",
        startTime: "2026-03-25T10:00:00-08:00",
        endTime: "2026-03-25T11:00:00-08:00",
        locked: true,
        source: "user",
      },
    ],
    rawText: "due-overload",
    tasks: [
      {
        id: "task-due-call",
        title: "Call case manager",
        type: "admin",
        estimatedMinutes: 30,
        priority: "medium",
        mustDoToday: false,
        breakEligible: false,
        splittable: false,
        deferrable: true,
        energyLevel: "medium",
        dueAt: "2026-03-25T11:15:00-08:00",
        source: "user",
      },
      {
        id: "task-no-due-reading",
        title: "Read outpatient cardiology chapter",
        type: "deep_work",
        estimatedMinutes: 90,
        priority: "medium",
        mustDoToday: false,
        breakEligible: false,
        splittable: true,
        deferrable: true,
        energyLevel: "high",
        source: "user",
      },
      {
        id: "task-admin-wrap",
        title: "Reply to clinic portal messages",
        type: "admin",
        estimatedMinutes: 30,
        priority: "low",
        mustDoToday: false,
        breakEligible: true,
        splittable: false,
        deferrable: true,
        energyLevel: "low",
        source: "user",
      },
    ],
  });

  assertGeneratedRouteIsValid(
    "due-dated task protection over no-due work",
    currentTime,
    response.dayPlan,
    response.unplacedTasks,
    {
      carryForwardItems: response.carryForwardItems,
      dueWarnings: response.dueWarnings,
    }
  );
  assert.equal(
    response.carryForwardItems.some((item) => item.taskId === "task-due-call"),
    false,
    "earlier due work should be protected ahead of equivalent no-due overflow"
  );
  assert.equal(
    response.carryForwardItems.some(
      (item) => item.taskId === "task-no-due-reading"
    ),
    true,
    "overflow should prefer carrying forward lower-protection no-due work"
  );
}

{
  const currentTime = "2026-03-25T09:00:00-08:00";
  const response = buildDirectDraftRoute({
    currentTime,
    planningWindow: {
      startTime: "2026-03-25T09:00:00-08:00",
      endTime: "2026-03-25T11:00:00-08:00",
    },
    rawText: "scheduled-late-warning",
    tasks: [
      {
        id: "task-scheduled-late",
        title: "Finish preceptor packet",
        type: "admin",
        estimatedMinutes: 60,
        priority: "high",
        mustDoToday: true,
        breakEligible: false,
        splittable: false,
        deferrable: false,
        energyLevel: "medium",
        dueAt: "2026-03-25T09:30:00-08:00",
        source: "user",
      },
    ],
  });

  assert.equal(
    response.dueWarnings.some(
      (warning) =>
        warning.taskId === "task-scheduled-late" &&
        warning.kind === "scheduled_late"
    ),
    true,
    "scheduling a task past due should emit a structured scheduled-late warning"
  );
}

{
  const currentTime = "2026-03-25T09:00:00-08:00";
  const response = buildDirectDraftRoute({
    currentTime,
    planningWindow: {
      startTime: "2026-03-25T09:00:00-08:00",
      endTime: "2026-03-25T10:00:00-08:00",
    },
    rawText: "carry-forward-late-warning",
    tasks: [
      {
        id: "task-carry-forward-late",
        title: "Write reflection draft",
        type: "deep_work",
        estimatedMinutes: 90,
        priority: "medium",
        mustDoToday: false,
        breakEligible: false,
        splittable: true,
        deferrable: true,
        energyLevel: "high",
        dueAt: "2026-03-25T09:45:00-08:00",
        source: "user",
      },
    ],
  });

  assert.equal(
    response.carryForwardItems.some(
      (item) => item.taskId === "task-carry-forward-late"
    ),
    true,
    "unfinished work should be explicitly carried forward when it no longer plausibly fits today"
  );
  assert.equal(
    response.dueWarnings.some(
      (warning) =>
        warning.taskId === "task-carry-forward-late" &&
        warning.kind === "carried_forward_late"
    ),
    true,
    "carrying work forward past due should emit a structured carried-forward-late warning"
  );
}

{
  const currentTime = "2026-03-25T09:00:00-08:00";
  const response = buildDirectDraftRoute({
    currentTime,
    planningWindow: {
      startTime: "2026-03-25T09:00:00-08:00",
      endTime: "2026-03-25T10:00:00-08:00",
    },
    rawText: "split-task-carry-forward",
    tasks: [
      {
        id: "task-split-overflow",
        title: "Review shelf practice set",
        type: "deep_work",
        estimatedMinutes: 120,
        priority: "high",
        mustDoToday: true,
        breakEligible: false,
        splittable: true,
        deferrable: false,
        energyLevel: "high",
        dueAt: "2026-03-25T17:00:00-08:00",
        source: "user",
      },
    ],
  });
  const splitCarryForwardItem = response.carryForwardItems.find(
    (item) => item.taskId === "task-split-overflow"
  );
  const splitLedgerEntry = deriveTaskMinuteLedger(
    response.dayPlan,
    currentTime,
    response.carryForwardItems
  ).find((entry) => entry.task.id === "task-split-overflow");

  assert.ok(
    splitCarryForwardItem,
    "split task overflow should create an explicit carry-forward remainder"
  );
  assert.ok(splitLedgerEntry, "split task should still exist in the minute ledger");
  assert.equal(
    splitCarryForwardItem?.remainingMinutes,
    splitLedgerEntry?.remainingCarriedForwardMinutes,
    "only the unscheduled remainder of a split task may move into carry forward"
  );
}

{
  const currentTime = "2026-03-25T09:00:00-08:00";
  const response = buildDirectDraftRoute({
    currentTime,
    planningWindow: {
      startTime: "2026-03-25T09:00:00-08:00",
      endTime: "2026-03-25T10:00:00-08:00",
    },
    rawText: "defer-vs-due-balance",
    tasks: [
      {
        id: "task-repeat-defer",
        title: "Review deferred pathology notes",
        type: "deep_work",
        estimatedMinutes: 60,
        priority: "medium",
        mustDoToday: false,
        breakEligible: false,
        splittable: false,
        deferrable: true,
        deferCount: 4,
        energyLevel: "high",
        source: "user",
      },
      {
        id: "task-later-due",
        title: "Prep afternoon follow-up questions",
        type: "admin",
        estimatedMinutes: 60,
        priority: "medium",
        mustDoToday: false,
        breakEligible: false,
        splittable: false,
        deferrable: true,
        deferCount: 0,
        energyLevel: "medium",
        dueAt: "2026-03-27T17:00:00-08:00",
        source: "user",
      },
    ],
  });

  assert.equal(
    response.carryForwardItems.some((item) => item.taskId === "task-repeat-defer"),
    false,
    "repeatedly deferred work should gain protection in overflow tradeoffs"
  );
  assert.equal(
    response.carryForwardItems.some((item) => item.taskId === "task-later-due"),
    true,
    "the helper should balance defer history against later due dates rather than sorting only by dueAt"
  );
}

{
  const scenario = getScenarioById("next-day-carry-forward-intake-test");
  assert.ok(
    scenario.seedCarryForwardItems,
    "next-day carry-forward intake scenario should seed carry-forward items"
  );

  const intakeItems = getCarryForwardItemsForIntake(
    scenario.seedCarryForwardItems,
    scenario.date ?? "2026-03-26"
  );
  const pastDueItem = intakeItems.find(
    (item) => item.taskId === "carry-forward-past-due-email"
  );
  const notYetDueItem = intakeItems.find(
    (item) => item.taskId === "carry-forward-not-yet-due-reading"
  );

  assert.ok(
    pastDueItem?.dueWarningKinds.includes("carried_forward_late"),
    "next-day intake should expose already-past-due carried-forward items"
  );
  assert.ok(
    notYetDueItem && notYetDueItem.dueWarningKinds.length === 0,
    "next-day intake should keep not-yet-due carried-forward items distinct from already-late work"
  );

  const ignoredItems = updateCarryForwardItemStatus(
    intakeItems,
    "carry-forward-2026-03-25-carry-forward-not-yet-due-reading",
    "ignored"
  );
  assert.equal(
    getCarryForwardItemsForIntake(ignoredItems, scenario.date ?? "2026-03-26").some(
      (item) => item.carryForwardStatus === "ignored"
    ),
    true,
    "ignored carry-forward items should remain visible instead of disappearing silently"
  );

  const planner = {
    ...mockPlannerState,
    currentTime: buildScenarioIsoDateTime(scenario.date ?? "2026-03-26", "08:15"),
    dayPlan: {
      ...mockPlannerState.dayPlan,
      date: scenario.date ?? "2026-03-26",
    },
  };
  const context = getPlannerStoreContext(planner);
  let intakeState = createPlannerStoreState(planner);
  intakeState = loadPlannerDevScenario(intakeState, context, scenario);
  intakeState = addCarryForwardItemToIntake(
    intakeState,
    intakeItems[0]!,
    "review"
  );
  intakeState = interpretPlannerDraft(intakeState, context);

  assert.equal(
    intakeState.parsedTaskResponse?.tasks.some(
      (task) =>
        task.id === `${intakeItems[0]!.id}-intake` &&
        task.carryForward === true &&
        task.dueAt === intakeItems[0]!.dueAt
    ),
    true,
    "accepting carry-forward work into next-day review should feed the normal interpretation task list"
  );

  const acceptedItem = intakeItems[0]!;
  const consumedInbox = updateCarryForwardItemStatus(
    intakeItems,
    acceptedItem.id,
    "consumed"
  );
  const activeInboxAfterAccept = getCarryForwardItemsForIntake(
    consumedInbox,
    scenario.date ?? "2026-03-26"
  );

  assert.equal(
    activeInboxAfterAccept.some((item) => item.id === acceptedItem.id),
    false,
    "accepted carry-forward work should retire from the pending inbox immediately"
  );

  let acceptedState = createPlannerStoreState(planner);
  acceptedState = loadPlannerDevScenario(acceptedState, context, scenario);
  acceptedState = interpretPlannerDraft(acceptedState, context);
  acceptedState = addCarryForwardItemToIntake(
    acceptedState,
    acceptedItem,
    "accepted"
  );
  acceptedState = addCarryForwardItemToIntake(
    acceptedState,
    acceptedItem,
    "accepted"
  );

  const acceptedTaskId = `${acceptedItem.id}-intake`;
  const acceptedTaskCount =
    acceptedState.parsedTaskResponse?.tasks.filter(
      (task) => task.id === acceptedTaskId
    ).length ?? 0;

  assert.equal(
    acceptedTaskCount,
    1,
    "accepted carry-forward work should create exactly one staged intake task even if the acceptance path is retriggered"
  );
  assert.equal(
    acceptedState.intakeCarryForwardItems.filter(
      (item) => item.id === acceptedItem.id && item.carryForwardStatus === "accepted"
    ).length,
    1,
    "accepted carry-forward work should keep a single accepted intake record"
  );

  const editedItem = intakeItems.find(
    (item) => item.taskId === "carry-forward-not-yet-due-reading"
  );
  assert.ok(
    editedItem,
    "next-day carry-forward intake scenario should include a second editable carry-forward item"
  );
  const editedTaskId = `${editedItem.id}-intake`;

  let editedState = createPlannerStoreState(planner);
  editedState = loadPlannerDevScenario(editedState, context, scenario);
  editedState = interpretPlannerDraft(editedState, context);
  editedState = addCarryForwardItemToIntake(
    editedState,
    editedItem,
    "accepted"
  );
  editedState = setPlanningWindowField(
    editedState,
    context,
    "planningEnd",
    "13:00"
  );
  editedState = setTaskEstimatedMinutes(
    editedState,
    editedTaskId,
    180
  );
  editedState = buildDraftRoute(editedState, planner, context);

  const editedDraftScheduleResponse = editedState.draftScheduleResponse;
  assert.ok(
    editedDraftScheduleResponse,
    "accepted carry-forward work should remain buildable after manual edits"
  );

  assert.equal(
    editedDraftScheduleResponse.dayPlan.tasks.some(
      (task) =>
        task.id === editedTaskId && task.estimatedMinutes === 180
    ),
    true,
    "manual edits to accepted carry-forward work should remain authoritative in the built route"
  );
  assert.equal(
    editedDraftScheduleResponse.carryForwardItems.some(
      (item) => item.taskId === editedItem.taskId
    ),
    false,
    "re-carried work should not revive the stale pre-acceptance task id"
  );
  assert.equal(
    editedDraftScheduleResponse.carryForwardItems.filter(
      (item) => item.taskId === editedTaskId
    ).length,
    1,
    "overflow from an accepted-and-edited carry-forward task should produce one carry-forward remainder tied to the edited intake task"
  );

  const replannedEditedRoute = replanRemainingDay({
    currentTime: buildScenarioIsoDateTime(scenario.date ?? "2026-03-26", "11:45"),
    dayPlan: editedDraftScheduleResponse.dayPlan,
    replanMode: "replan_from_now",
  });

  assert.equal(
    replannedEditedRoute.dayPlan.tasks.filter(
      (task) => task.id === editedTaskId
    ).length,
    1,
    "replanning after an intake edit should preserve the edited intake task as the single source of truth"
  );
  assert.equal(
    replannedEditedRoute.carryForwardItems.some(
      (item) => item.taskId === editedItem.taskId
    ),
    false,
    "replanning should not recreate carry-forward entries from the stale original carry-forward task id"
  );
  assert.equal(
    replannedEditedRoute.carryForwardItems.filter(
      (item) => item.taskId === editedTaskId
    ).length,
    1,
    "replanning should keep exactly one carry-forward remainder for the edited intake task"
  );
}

{
  const planner = {
    ...mockPlannerState,
    dayPlan: {
      ...mockPlannerState.dayPlan,
      date: "2026-03-25",
    },
  };
  const context = getPlannerStoreContext(planner);
  const validation = validateDaySetupDraft(
    {
      csvText: "",
      inputMode: "brain_dump",
      rawText: "study neuro 60m",
      profileName: "",
      profileJourney: "building",
      profilePriorities: ["focus", "learning"],
      profileRhythm: "",
      profilePreference: "",
      planningStart: "18:00",
      planningEnd: "08:00",
      breakMode: "restful",
      breakCadence: "focus_50",
      paceMode: "finish_sooner",
      fixedEvents: [
        {
          id: "fixed-1",
          title: "",
          startTime: "09:00",
          endTime: "",
          note: "",
        },
      ],
    },
    context
  );

  assert.equal(
    validation.errors.planningWindow,
    "Set the end time later than the start time."
  );
  assert.ok(
    validation.warnings.fixedEvents["fixed-1"]?.includes(
      "Add both times to place this event on the timeline."
    ),
    "day-setup validation should warn when a fixed event only has one time"
  );
}

for (const scenario of plannerDevScenarios) {
  const { planner, state, context } = buildScenarioState(scenario);
  const view = buildPlannerView(planner, state, context);
  const draftScheduleResponse = getDraftScheduleResponse(state);

  assertGeneratedRouteIsValid(
    `${scenario.id} generated route`,
    planner.currentTime,
    view.dayPlan,
    draftScheduleResponse.unplacedTasks,
    {
      allowProductiveBreaks: view.dayPlan.breakMode === "productive",
      carryForwardItems: draftScheduleResponse.carryForwardItems,
      dueWarnings: draftScheduleResponse.dueWarnings,
    }
  );
}

{
  const fixtureDayPlan = {
    ...mockPlannerState.dayPlan,
    planningWindow: {
      startTime: "2026-03-25T08:00:00-08:00",
      endTime: "2026-03-25T18:00:00-08:00",
    },
    blocks: [
      {
        ...mockPlannerState.dayPlan.blocks[0],
        id: "fixture-first",
        title: "Fixture first",
        startTime: "2026-03-25T08:30:00-08:00",
        endTime: "2026-03-25T09:00:00-08:00",
        status: "upcoming" as const,
      },
      {
        ...mockPlannerState.dayPlan.blocks[1],
        id: "fixture-break",
        title: "Fixture break",
        blockType: "break" as const,
        taskId: undefined,
        startTime: "2026-03-25T10:00:00-08:00",
        endTime: "2026-03-25T10:15:00-08:00",
        status: "upcoming" as const,
      },
      {
        ...mockPlannerState.dayPlan.blocks[2],
        id: "fixture-last",
        title: "Fixture last",
        startTime: "2026-03-25T10:30:00-08:00",
        endTime: "2026-03-25T11:00:00-08:00",
        status: "upcoming" as const,
      },
    ],
  };

  assertCurrentTimeState(
    "current-time state before first block",
    fixtureDayPlan,
    "2026-03-25T08:10:00-08:00",
    "before_first_block"
  );
  assertCurrentTimeState(
    "current-time state between blocks",
    fixtureDayPlan,
    "2026-03-25T09:30:00-08:00",
    "between_blocks"
  );
  assertCurrentTimeState(
    "current-time state inside scheduled break",
    fixtureDayPlan,
    "2026-03-25T10:05:00-08:00",
    "scheduled_block"
  );
  assertCurrentTimeState(
    "current-time state after last block",
    fixtureDayPlan,
    "2026-03-25T11:30:00-08:00",
    "after_last_block"
  );
}

{
  const fixtureDayPlan = {
    ...mockPlannerState.dayPlan,
    blocks: [
      {
        ...mockPlannerState.dayPlan.blocks[0],
        id: "fixture-done-overlap",
        title: "Fixture done overlap",
        startTime: "2026-03-25T09:30:00-08:00",
        endTime: "2026-03-25T10:45:00-08:00",
        status: "done" as const,
      },
      {
        ...mockPlannerState.dayPlan.blocks[1],
        id: "fixture-next",
        title: "Fixture next",
        startTime: "2026-03-25T11:00:00-08:00",
        endTime: "2026-03-25T11:30:00-08:00",
        status: "upcoming" as const,
      },
    ],
  };

  assertCurrentTimeState(
    "terminal history overlap fixture",
    fixtureDayPlan,
    "2026-03-25T10:20:00-08:00",
    "terminal_history_overlap"
  );
}

{
  const scenario = getScenarioById("late-day-replan-stress-test");
  const { planner, state, context } = buildScenarioState(scenario);
  const view = buildPlannerView(planner, state, context);

  for (const replanMode of [
    "replan_from_now",
    "keep_essentials_only",
    "gentler_remainder",
    "use_productive_breaks",
    "preserve_focus_first",
  ] as const) {
    assertReplanIsValid(
      `late-day-replan-stress-test ${replanMode}`,
      planner.currentTime,
      view.dayPlan,
      replanMode
    );
  }
}

{
  const restfulScenario = getScenarioById("normal-realistic-day");
  const { planner, state, context } = buildScenarioState(restfulScenario);
  const restfulView = buildPlannerView(planner, state, context);

  assert.equal(
    restfulView.dayPlan.blocks.some(
      (block) => block.blockType === "break" && Boolean(block.taskId)
    ),
    false,
    "normal-realistic-day: restful routing should not place task-backed productive breaks"
  );

  const productiveScenario = getScenarioById("low-energy-productive-break-test");
  const productiveState = buildScenarioState(productiveScenario);
  const productiveView = buildPlannerView(
    productiveState.planner,
    productiveState.state,
    productiveState.context
  );
  const productiveBreakBlocks = productiveView.dayPlan.blocks.filter(
    (block) => block.blockType === "break" && Boolean(block.taskId)
  );
  const trueBreakBlocks = productiveView.dayPlan.blocks.filter(
    (block) => block.blockType === "break" && !block.taskId
  );

  if (productiveBreakBlocks.length > 0) {
    assert.ok(
      trueBreakBlocks.length > 0,
      "low-energy-productive-break-test: productive break mode should still leave at least one true break"
    );
  }
}

{
  const boundaryDayPlan = {
    ...mockPlannerState.dayPlan,
    planningWindow: {
      startTime: "2026-03-25T08:00:00-08:00",
      endTime: "2026-03-25T18:00:00-08:00",
    },
    tasks: [],
    hardEvents: [
      {
        id: "boundary-anchor",
        title: "Boundary anchor",
        startTime: "2026-03-25T10:00:00-08:00",
        endTime: "2026-03-25T11:00:00-08:00",
        locked: true as const,
        source: "user" as const,
      },
    ],
    blocks: [
      {
        ...mockPlannerState.dayPlan.blocks[0],
        id: "boundary-work",
        taskId: undefined,
        title: "Boundary work",
        startTime: "2026-03-25T09:15:00-08:00",
        endTime: "2026-03-25T10:00:00-08:00",
        status: "expired" as const,
      },
      {
        ...mockPlannerState.dayPlan.blocks[10],
        id: "boundary-anchor-block",
        title: "Boundary anchor",
        startTime: "2026-03-25T10:00:00-08:00",
        endTime: "2026-03-25T11:00:00-08:00",
        status: "upcoming" as const,
        locked: true,
      },
    ],
  };
  const boundaryValidation = validateGeneratedDayPlan(boundaryDayPlan, {
    currentTime: "2026-03-25T10:00:00-08:00",
    unplacedTasks: [],
  });

  assert.equal(
    boundaryValidation.isValid,
    true,
    `hard-event boundary fixture: ${boundaryValidation.warnings.join(" | ")}`
  );
}

for (const scenarioId of [
  "normal-realistic-day",
  "deep-work-fragmentation-torture-test",
  "execution-continuity-test",
]) {
  const scenario = getScenarioById(scenarioId);
  const { planner, state, context } = buildScenarioState(scenario);
  const initialView = buildPlannerView(planner, state, context);
  const execution = deriveDayPlanExecutionSnapshot(
    initialView.dayPlan,
    planner.currentTime
  );

  assert.ok(
    execution.currentActionableBlock,
    `${scenarioId}: expected a current actionable block`
  );

  const skippedState = skipBlock(
    state,
    planner.currentTime,
    execution.currentActionableBlock.id
  );
  const skippedView = buildPlannerView(planner, skippedState, context);
  const skippedDraftScheduleResponse = getDraftScheduleResponse(skippedState);

  assertGeneratedRouteIsValid(
    `${scenarioId} skip-current mutation`,
    planner.currentTime,
    skippedView.dayPlan,
    skippedDraftScheduleResponse.unplacedTasks,
    {
      allowProductiveBreaks: skippedView.dayPlan.breakMode === "productive",
      carryForwardItems: skippedDraftScheduleResponse.carryForwardItems,
      dueWarnings: skippedDraftScheduleResponse.dueWarnings,
      strictSplittableAccounting: false,
    }
  );

  assertReplanIsValid(
    `${scenarioId} skip-current replan`,
    planner.currentTime,
    skippedView.dayPlan
  );
}

{
  const scenario = getScenarioById("execution-continuity-test");
  const { planner, state, context } = buildScenarioState(scenario);
  const initialView = buildPlannerView(planner, state, context);
  const execution = deriveDayPlanExecutionSnapshot(
    initialView.dayPlan,
    planner.currentTime
  );

  assert.ok(
    execution.currentActionableBlock,
    "execution-continuity-test: expected a current actionable block"
  );

  const completedState = markBlockComplete(
    state,
    planner.currentTime,
    execution.currentActionableBlock.id
  );
  const completedView = buildPlannerView(planner, completedState, context);
  const completedDraftScheduleResponse = getDraftScheduleResponse(completedState);

  assertGeneratedRouteIsValid(
    "execution-continuity-test complete-current mutation",
    planner.currentTime,
    completedView.dayPlan,
    completedDraftScheduleResponse.unplacedTasks,
    {
      allowProductiveBreaks: completedView.dayPlan.breakMode === "productive",
      carryForwardItems: completedDraftScheduleResponse.carryForwardItems,
      dueWarnings: completedDraftScheduleResponse.dueWarnings,
      strictSplittableAccounting: false,
    }
  );

  assertReplanIsValid(
    "execution-continuity-test complete-current replan",
    planner.currentTime,
    completedView.dayPlan
  );

  const completedTaskId = execution.currentActionableBlock.taskId;

  assert.ok(
    completedTaskId,
    "execution-continuity-test: expected the current actionable block to belong to a task"
  );
  assert.ok(
    completedView.dayPlan.completedTaskIds?.includes(completedTaskId),
    "execution-continuity-test: completing a task block should mark the task complete"
  );
  assert.equal(
    completedView.dayPlan.blocks.some(
      (block) =>
        block.taskId === completedTaskId &&
        block.status !== "done" &&
        new Date(block.endTime).getTime() > new Date(planner.currentTime).getTime()
    ),
    false,
    "execution-continuity-test: future scheduled blocks for a completed task should be cleared"
  );

  const completedPreview = replanRemainingDay({
    currentTime: planner.currentTime,
    dayPlan: completedView.dayPlan,
    replanMode: "replan_from_now",
  });

  assert.equal(
    completedPreview.dayPlan.blocks.some(
      (block) =>
        block.taskId === completedTaskId &&
        new Date(block.endTime).getTime() > new Date(planner.currentTime).getTime()
    ),
    false,
    "execution-continuity-test: replanning should not reinsert a task that was marked complete"
  );

  const rebuiltState = buildDraftRoute(completedState, planner, context);
  const rebuiltView = buildPlannerView(planner, rebuiltState, context);

  assert.equal(
    rebuiltView.dayPlan.blocks.some(
      (block) =>
        block.taskId === completedTaskId &&
        block.status !== "done" &&
        new Date(block.endTime).getTime() > new Date(planner.currentTime).getTime()
    ),
    false,
    "execution-continuity-test: rebuilding should not reinsert a task that was already marked complete"
  );
}

{
  const scenario = getScenarioById("execution-continuity-test");
  const { planner, state, context } = buildScenarioState(scenario);
  const initialView = buildPlannerView(planner, state, context);
  const execution = deriveDayPlanExecutionSnapshot(
    initialView.dayPlan,
    planner.currentTime
  );

  assert.ok(
    execution.currentActionableBlock,
    "execution-continuity-test: expected a current actionable block for delay coverage"
  );

  const delayedState = delayBlock(
    state,
    planner.currentTime,
    execution.currentActionableBlock.id,
    10
  );
  const delayedView = buildPlannerView(planner, delayedState, context);
  const delayedDraftScheduleResponse = getDraftScheduleResponse(delayedState);

  assertGeneratedRouteIsValid(
    "execution-continuity-test delay-current mutation",
    planner.currentTime,
    delayedView.dayPlan,
    delayedDraftScheduleResponse.unplacedTasks,
    {
      allowProductiveBreaks: delayedView.dayPlan.breakMode === "productive",
      carryForwardItems: delayedDraftScheduleResponse.carryForwardItems,
      dueWarnings: delayedDraftScheduleResponse.dueWarnings,
      strictSplittableAccounting: false,
    }
  );
  assertReplanIsValid(
    "execution-continuity-test delay-current replan",
    planner.currentTime,
    delayedView.dayPlan
  );
}

{
  const scenario = getScenarioById("deep-work-fragmentation-torture-test");
  const { planner, state, context } = buildScenarioState(scenario);
  const initialView = buildPlannerView(planner, state, context);
  const expiredTaskBlock = initialView.dayPlan.blocks.find(
    (block) =>
      !block.locked &&
      block.taskId &&
      block.status === "expired" &&
      new Date(block.endTime).getTime() <= new Date(planner.currentTime).getTime()
  );

  assert.ok(
    expiredTaskBlock,
    "deep-work-fragmentation-torture-test: expected an expired task block to toggle complete"
  );

  const toggledState = togglePastBlockComplete(
    state,
    planner.currentTime,
    expiredTaskBlock.id
  );
  const toggledView = buildPlannerView(planner, toggledState, context);
  const toggledDraftScheduleResponse = getDraftScheduleResponse(toggledState);
  const toggledBlock = toggledView.dayPlan.blocks.find(
    (block) => block.id === expiredTaskBlock.id
  );

  assert.ok(toggledBlock, "toggled past block should still exist in the route");
  assert.equal(
    toggledBlock.status,
    "done",
    "toggling a past block should preserve it and mark it done"
  );
  assert.equal(
    toggledBlock.startTime,
    expiredTaskBlock.startTime,
    "toggling a past block complete should keep the original start time"
  );
  assert.equal(
    toggledBlock.endTime,
    expiredTaskBlock.endTime,
    "toggling a past block complete should keep the original end time"
  );
  assert.equal(
    toggledView.dayPlan.completedTaskIds?.includes(expiredTaskBlock.taskId!),
    true,
    "toggling a past block complete should mark the task complete"
  );
  assertGeneratedRouteIsValid(
    "deep-work-fragmentation-torture-test toggle-past mutation",
    planner.currentTime,
    toggledView.dayPlan,
    toggledDraftScheduleResponse.unplacedTasks,
    {
      allowProductiveBreaks: toggledView.dayPlan.breakMode === "productive",
      carryForwardItems: toggledDraftScheduleResponse.carryForwardItems,
      dueWarnings: toggledDraftScheduleResponse.dueWarnings,
      strictSplittableAccounting: false,
    }
  );

  const toggledPreview = replanRemainingDay({
    currentTime: planner.currentTime,
    dayPlan: toggledView.dayPlan,
    replanMode: "replan_from_now",
  });
  const toggledPreviewTaskBlocks = toggledPreview.dayPlan.blocks.filter(
    (block) => block.taskId === expiredTaskBlock.taskId
  );

  assert.ok(
    toggledPreviewTaskBlocks.some((block) => block.id === expiredTaskBlock.id),
    "replan should preserve the completed past block in visible history"
  );
  assert.ok(
    toggledPreviewTaskBlocks.every(
      (block) =>
        block.id === expiredTaskBlock.id ||
        new Date(block.endTime).getTime() <= new Date(planner.currentTime).getTime()
    ),
    "replan should not reinsert unfinished future chunks after a past block is marked complete"
  );
}

{
  const scenario = getScenarioById("execution-continuity-test");
  const { planner, state, context } = buildScenarioState(scenario);
  const initialView = buildPlannerView(planner, state, context);
  const initialBlocks = getComparableBlocks(initialView.dayPlan);
  const execution = deriveDayPlanExecutionSnapshot(
    initialView.dayPlan,
    planner.currentTime
  );

  assert.ok(execution.nextBlock, "execution-continuity-test: expected a next block");
  const lockedUpcomingBlock = initialView.dayPlan.blocks.find(
    (block) =>
      block.locked &&
      new Date(block.endTime).getTime() > new Date(planner.currentTime).getTime()
  );

  assert.equal(
    Boolean(lockedUpcomingBlock),
    true,
    "execution-continuity-test: expected at least one locked upcoming anchor"
  );

  const lockedBlockId = lockedUpcomingBlock!.id;
  const skipLocked = skipBlock(state, planner.currentTime, lockedBlockId);
  const completeLocked = markBlockComplete(state, planner.currentTime, lockedBlockId);
  const delayLocked = delayBlock(state, planner.currentTime, lockedBlockId, 10);

  assert.deepEqual(
    getComparableBlocks(buildPlannerView(planner, skipLocked, context).dayPlan),
    initialBlocks,
    "locked upcoming blocks should not be skippable"
  );
  assert.deepEqual(
    getComparableBlocks(buildPlannerView(planner, completeLocked, context).dayPlan),
    initialBlocks,
    "locked upcoming blocks should not be completable"
  );
  assert.deepEqual(
    getComparableBlocks(buildPlannerView(planner, delayLocked, context).dayPlan),
    initialBlocks,
    "locked upcoming blocks should not be delayable"
  );

  assert.ok(
    skipLocked.plannerWarnings.some((warning) =>
      warning.includes("Only the current unlocked block can be skipped")
    ),
    "skipping a locked upcoming block should surface a clear warning"
  );
  assert.ok(
    completeLocked.plannerWarnings.some((warning) =>
      warning.includes("Only the current unlocked block can be marked complete")
    ),
    "completing a locked upcoming block should surface a clear warning"
  );
  assert.ok(
    delayLocked.plannerWarnings.some((warning) =>
      warning.includes("Only the current unlocked block can be delayed")
    ),
    "delaying a locked upcoming block should surface a clear warning"
  );
}

{
  assertOpenAiStrictObjectSchema(
    getPlannerAiResponseJsonSchema("parse") as JsonSchema
  );
  assertOpenAiStrictObjectSchema(
    getPlannerAiResponseJsonSchema("draft") as JsonSchema
  );
  assertOpenAiStrictObjectSchema(
    getPlannerAiResponseJsonSchema("replan") as JsonSchema
  );
}

{
  assert.equal(
    inferTaskRouteFlowContext(
      createRegressionTask({
        id: "call-pharmacy",
        title: "call pharmacy 15m",
        overrides: {
          type: "admin",
          breakEligible: true,
          energyLevel: "low",
        },
      })
    ).locationContext,
    "desk",
    "desk-contact tasks should not be misclassified as out-of-home travel"
  );
  assert.equal(
    inferTaskRouteFlowContext(
      createRegressionTask({
        id: "email-clinic",
        title: "email clinic coordinator 10m",
        overrides: {
          type: "admin",
        },
      })
    ).locationContext,
    "desk",
    "email-based tasks should remain desk-context work"
  );
  assert.equal(
    inferTaskRouteFlowContext(
      createRegressionTask({
        id: "grocery-run",
        title: "grocery run 40m",
        overrides: {
          type: "errand",
          estimatedMinutes: 40,
        },
      })
    ).locationContext,
    "out_of_home",
    "strong errand cues should infer out-of-home context"
  );
  assert.equal(
    inferTaskRouteFlowContext(
      createRegressionTask({
        id: "shower",
        title: "shower 20m",
        overrides: {
          type: "self_care",
          estimatedMinutes: 20,
          deferrable: false,
        },
      })
    ).locationContext,
    "home",
    "home-reset tasks like shower should infer home context without becoming a global flow bucket"
  );

  const draftPrompt = buildPlannerAiSystemPrompt("draft");
  assert.ok(
    draftPrompt.includes("Route coherence sits below"),
    "draft AI prompt should encode the explicit route-coherence priority stack"
  );
  assert.ok(
    draftPrompt.includes("do not turn calls, emails, or texts into travel"),
    "draft AI prompt should warn against fake geography"
  );
}

{
  const planner = {
    ...mockPlannerState,
    currentTime: buildScenarioIsoDateTime(mockPlannerState.dayPlan.date, "08:00"),
    dayPlan: {
      ...mockPlannerState.dayPlan,
      planningWindow: {
        startTime: buildScenarioIsoDateTime(mockPlannerState.dayPlan.date, "08:00"),
        endTime: buildScenarioIsoDateTime(mockPlannerState.dayPlan.date, "13:00"),
      },
    },
  };
  const routeTasks = [
    createRegressionTask({
      id: "grocery-run",
      title: "grocery run 40m",
      overrides: {
        type: "errand",
        estimatedMinutes: 40,
      },
    }),
    createRegressionTask({
      id: "pharmacy-pickup",
      title: "pharmacy pickup 15m",
      overrides: {
        type: "errand",
        estimatedMinutes: 15,
      },
    }),
    createRegressionTask({
      id: "dropoff-package",
      title: "drop off package 15m",
      overrides: {
        type: "errand",
        estimatedMinutes: 15,
      },
    }),
    createRegressionTask({
      id: "email-clinic",
      title: "email clinic coordinator 15m",
      overrides: {
        type: "admin",
        estimatedMinutes: 15,
      },
    }),
  ];
  const draftScheduleResponse = generateDraftSchedule({
    breakCadence: "focus_50",
    breakMode: "restful",
    paceMode: "finish_sooner",
    currentTime: planner.currentTime,
    hardEvents: [],
    planner,
    planningWindow: planner.dayPlan.planningWindow,
    rawText: routeTasks.map((task) => task.title).join("\n"),
    tasks: routeTasks,
  });
  const flexibleTaskTitles = draftScheduleResponse.dayPlan.blocks
    .filter((block) => !block.locked && Boolean(block.taskId) && block.blockType !== "break")
    .map((block) => block.title.replace(/\s+· part \d+$/, ""));

  assert.deepEqual(
    flexibleTaskTitles.slice(0, 3),
    ["grocery run 40m", "pharmacy pickup 15m", "drop off package 15m"],
    "local route-building should group strong out-of-home errands together when priorities are otherwise similar"
  );

  const focusProtectedDraft = generateDraftSchedule({
    breakCadence: "focus_50",
    breakMode: "restful",
    paceMode: "finish_sooner",
    currentTime: planner.currentTime,
    hardEvents: [],
    planner,
    planningWindow: planner.dayPlan.planningWindow,
    rawText: ["review IM questions 90m", "shower 20m", "grocery run 30m"].join("\n"),
    tasks: [
      createRegressionTask({
        id: "review-questions",
        title: "review IM questions 90m",
        overrides: {
          type: "deep_work",
          estimatedMinutes: 90,
          priority: "high",
          mustDoToday: true,
          splittable: true,
          deferrable: false,
          energyLevel: "high",
        },
      }),
      createRegressionTask({
        id: "shower",
        title: "shower 20m",
        overrides: {
          type: "self_care",
          estimatedMinutes: 20,
          deferrable: false,
        },
      }),
      createRegressionTask({
        id: "grocery-run",
        title: "grocery run 30m",
        overrides: {
          type: "errand",
          estimatedMinutes: 30,
        },
      }),
    ],
  });
  const firstRoutedTask = focusProtectedDraft.dayPlan.blocks.find(
    (block) => !block.locked && Boolean(block.taskId) && block.blockType !== "break"
  );

  assert.equal(
    firstRoutedTask?.taskId,
    "review-questions",
    "route coherence should not outrank meaningful focus protection"
  );
}

{
  const plannerDate = mockPlannerState.dayPlan.date;
  const taskSet = [
    createRegressionTask({
      id: "desk-review",
      title: "review IM questions",
      overrides: {
        type: "deep_work",
        estimatedMinutes: 60,
        priority: "high",
        mustDoToday: true,
        splittable: false,
        deferrable: false,
        energyLevel: "high",
      },
    }),
    createRegressionTask({
      id: "grocery-run",
      title: "grocery run",
      overrides: {
        type: "errand",
        estimatedMinutes: 30,
      },
    }),
    createRegressionTask({
      id: "email-clinic",
      title: "email clinic coordinator",
      overrides: {
        type: "admin",
        estimatedMinutes: 15,
      },
    }),
  ];
  const hardEvents = [
    {
      id: "anchor-noon",
      title: "Lunch",
      startTime: buildScenarioIsoDateTime(plannerDate, "09:00"),
      endTime: buildScenarioIsoDateTime(plannerDate, "09:30"),
      locked: true as const,
      source: "user" as const,
    },
    {
      id: "anchor-checkin",
      title: "Check-in",
      startTime: buildScenarioIsoDateTime(plannerDate, "10:30"),
      endTime: buildScenarioIsoDateTime(plannerDate, "11:00"),
      locked: true as const,
      source: "user" as const,
    },
  ];
  const awkwardDraft: DraftScheduleResponse = {
    dayPlan: synchronizeDayPlanToCurrentTime(
      {
        ...mockPlannerState.dayPlan,
        planningWindow: {
          startTime: buildScenarioIsoDateTime(plannerDate, "08:00"),
          endTime: buildScenarioIsoDateTime(plannerDate, "12:00"),
        },
        tasks: taskSet,
        hardEvents,
        blocks: [
          {
            id: "desk-block",
            taskId: "desk-review",
            title: "review IM questions",
            blockType: "focus",
            startTime: buildScenarioIsoDateTime(plannerDate, "08:00"),
            endTime: buildScenarioIsoDateTime(plannerDate, "09:00"),
            status: "upcoming",
            locked: false,
            source: "user",
          },
          {
            id: "anchor-lunch-block",
            title: "Lunch",
            blockType: "appointment",
            startTime: buildScenarioIsoDateTime(plannerDate, "09:00"),
            endTime: buildScenarioIsoDateTime(plannerDate, "09:30"),
            status: "upcoming",
            locked: true,
            source: "user",
          },
          {
            id: "errand-block",
            taskId: "grocery-run",
            title: "grocery run",
            blockType: "chore",
            startTime: buildScenarioIsoDateTime(plannerDate, "09:30"),
            endTime: buildScenarioIsoDateTime(plannerDate, "10:00"),
            status: "upcoming",
            locked: false,
            source: "user",
          },
          {
            id: "anchor-checkin-block",
            title: "Check-in",
            blockType: "appointment",
            startTime: buildScenarioIsoDateTime(plannerDate, "10:30"),
            endTime: buildScenarioIsoDateTime(plannerDate, "11:00"),
            status: "upcoming",
            locked: true,
            source: "user",
          },
          {
            id: "desk-admin-block",
            taskId: "email-clinic",
            title: "email clinic coordinator",
            blockType: "admin",
            startTime: buildScenarioIsoDateTime(plannerDate, "11:00"),
            endTime: buildScenarioIsoDateTime(plannerDate, "11:15"),
            status: "upcoming",
            locked: false,
            source: "user",
          },
        ],
        breakMode: "restful",
        breakCadence: "focus_50",
        paceMode: "finish_sooner",
        completedTaskIds: [],
        updatedAt: buildScenarioIsoDateTime(plannerDate, "08:00"),
      },
      buildScenarioIsoDateTime(plannerDate, "08:00")
    ),
    unplacedTasks: [],
    carryForwardItems: [],
    carryForwardTaskIds: [],
    dueWarnings: [],
    warnings: [],
  };
  const routeFlowAnalysis = analyzeRouteFlowSequence(
    awkwardDraft.dayPlan.blocks,
    awkwardDraft.dayPlan.tasks
  );

  assert.equal(
    routeFlowAnalysis.hasForcedAwkwardInterleaving,
    true,
    "route-flow analysis should recognize anchor-forced location switching"
  );

  const awkwardState = applyDraftScheduleResult({
    state: createPlannerStoreState({
      ...mockPlannerState,
      currentTime: buildScenarioIsoDateTime(plannerDate, "08:00"),
    }),
    planner: {
      ...mockPlannerState,
      currentTime: buildScenarioIsoDateTime(plannerDate, "08:00"),
    },
    draftScheduleResponse: awkwardDraft,
    parsedTaskResponse: {
      tasks: taskSet,
      hardEvents,
      warnings: [],
    },
  });

  assert.ok(
    awkwardState.oracleAdvice.some((item) =>
      item.includes("Some out-of-home and desk work stay split")
    ),
    "Oracle should explain when fixed anchors force an awkward but valid route"
  );
}

{
  const plannerDate = mockPlannerState.dayPlan.date;
  const currentTasks = [
    createRegressionTask({
      id: "focus-a",
      title: "review cardio",
      overrides: {
        type: "deep_work",
        estimatedMinutes: 50,
        splittable: false,
        deferrable: false,
      },
    }),
    createRegressionTask({
      id: "admin-a",
      title: "email clinic coordinator",
      overrides: {
        type: "admin",
        estimatedMinutes: 15,
      },
    }),
  ];
  const currentDraft: DraftScheduleResponse = {
    dayPlan: {
      ...mockPlannerState.dayPlan,
      date: plannerDate,
      tasks: currentTasks,
      hardEvents: [],
      blocks: [
        {
          id: "focus-a-block",
          taskId: "focus-a",
          title: "review cardio",
          blockType: "focus",
          startTime: buildScenarioIsoDateTime(plannerDate, "08:00"),
          endTime: buildScenarioIsoDateTime(plannerDate, "08:50"),
          status: "upcoming",
          locked: false,
          source: "user",
        },
        {
          id: "admin-a-block",
          taskId: "admin-a",
          title: "email clinic coordinator",
          blockType: "admin",
          startTime: buildScenarioIsoDateTime(plannerDate, "08:55"),
          endTime: buildScenarioIsoDateTime(plannerDate, "09:10"),
          status: "upcoming",
          locked: false,
          source: "user",
        },
      ],
      updatedAt: buildScenarioIsoDateTime(plannerDate, "08:00"),
    },
    unplacedTasks: [],
    carryForwardItems: [],
    carryForwardTaskIds: [],
    dueWarnings: [],
    warnings: [],
  };
  const minorShuffleDraft: DraftScheduleResponse = {
    ...currentDraft,
    dayPlan: {
      ...currentDraft.dayPlan,
      blocks: currentDraft.dayPlan.blocks.map((block) =>
        block.id === "admin-a-block"
          ? {
              ...block,
              startTime: buildScenarioIsoDateTime(plannerDate, "09:00"),
              endTime: buildScenarioIsoDateTime(plannerDate, "09:15"),
            }
          : block
      ),
    },
  };
  const minorShuffleEvaluation = evaluateDraftAiRefinement({
    candidateCarryForwardItems: minorShuffleDraft.carryForwardItems,
    candidateDayPlan: minorShuffleDraft.dayPlan,
    candidateUnplacedTasks: minorShuffleDraft.unplacedTasks,
    currentCarryForwardItems: currentDraft.carryForwardItems,
    currentDayPlan: currentDraft.dayPlan,
    currentTime: buildScenarioIsoDateTime(plannerDate, "08:00"),
    currentUnplacedTasks: currentDraft.unplacedTasks,
  });

  assert.equal(
    minorShuffleEvaluation.outcome,
    "no_change",
    "small timing shuffles with the same practical route shape should not trigger an Oracle refinement offer"
  );
}

{
  const plannerDate = mockPlannerState.dayPlan.date;
  const routeTasks = [
    createRegressionTask({
      id: "focus-a",
      title: "review cardio",
      overrides: {
        type: "deep_work",
        estimatedMinutes: 50,
        splittable: false,
        deferrable: false,
      },
    }),
    createRegressionTask({
      id: "errand-a",
      title: "grocery run",
      overrides: {
        type: "errand",
        estimatedMinutes: 35,
      },
    }),
  ];
  const currentDraft: DraftScheduleResponse = {
    dayPlan: {
      ...mockPlannerState.dayPlan,
      date: plannerDate,
      tasks: routeTasks,
      hardEvents: [],
      blocks: [
        {
          id: "focus-a-block",
          taskId: "focus-a",
          title: "review cardio",
          blockType: "focus",
          startTime: buildScenarioIsoDateTime(plannerDate, "08:00"),
          endTime: buildScenarioIsoDateTime(plannerDate, "08:50"),
          status: "upcoming",
          locked: false,
          source: "user",
        },
      ],
      updatedAt: buildScenarioIsoDateTime(plannerDate, "08:00"),
    },
    unplacedTasks: [],
    carryForwardItems: [
      {
        id: "carry-errand-a",
        taskId: "errand-a",
        carriedFromDate: plannerDate,
        title: "grocery run",
        remainingMinutes: 35,
        carryForwardReason: "overflow",
        carryForwardStatus: "pending",
        deferCount: 0,
        dueWarningKinds: [],
        unplacedReason: "did_not_fit_today",
        explanation: "did not fit",
        type: "errand",
        priority: "medium",
        mustDoToday: false,
        breakEligible: false,
        splittable: false,
        deferrable: true,
        energyLevel: "medium",
        source: "user",
      },
    ],
    carryForwardTaskIds: ["errand-a"],
    dueWarnings: [],
    warnings: [],
  };
  const cleanerDraft: DraftScheduleResponse = {
    ...currentDraft,
    dayPlan: {
      ...currentDraft.dayPlan,
      blocks: [
        ...currentDraft.dayPlan.blocks,
        {
          id: "errand-a-block",
          taskId: "errand-a",
          title: "grocery run",
          blockType: "chore",
          startTime: buildScenarioIsoDateTime(plannerDate, "09:00"),
          endTime: buildScenarioIsoDateTime(plannerDate, "09:35"),
          status: "upcoming",
          locked: false,
          source: "user",
        },
      ],
      updatedAt: buildScenarioIsoDateTime(plannerDate, "08:00"),
    },
    carryForwardItems: [],
    carryForwardTaskIds: [],
  };
  const overflowEvaluation = evaluateDraftAiRefinement({
    candidateCarryForwardItems: cleanerDraft.carryForwardItems,
    candidateDayPlan: cleanerDraft.dayPlan,
    candidateUnplacedTasks: cleanerDraft.unplacedTasks,
    currentCarryForwardItems: currentDraft.carryForwardItems,
    currentDayPlan: currentDraft.dayPlan,
    currentTime: buildScenarioIsoDateTime(plannerDate, "08:00"),
    currentUnplacedTasks: currentDraft.unplacedTasks,
  });

  assert.equal(
    overflowEvaluation.outcome,
    "offer",
    "keeping an overflowed task inside today should qualify as a materially better AI refinement"
  );
}

{
  const plannerDate = mockPlannerState.dayPlan.date;
  const remainderTasks = [
    createRegressionTask({
      id: "desk-a",
      title: "email clinic coordinator",
      overrides: {
        type: "admin",
        estimatedMinutes: 15,
      },
    }),
    createRegressionTask({
      id: "desk-b",
      title: "call pharmacy",
      overrides: {
        type: "admin",
        estimatedMinutes: 15,
      },
    }),
  ];
  const currentPreview: ReplanPreview = {
    carryForwardItems: [],
    carryForwardTaskIds: [],
    dayPlan: {
      ...mockPlannerState.dayPlan,
      date: plannerDate,
      tasks: remainderTasks,
      hardEvents: [],
      blocks: [
        {
          id: "desk-a-block",
          taskId: "desk-a",
          title: "email clinic coordinator",
          blockType: "admin",
          startTime: buildScenarioIsoDateTime(plannerDate, "16:45"),
          endTime: buildScenarioIsoDateTime(plannerDate, "17:00"),
          status: "upcoming",
          locked: false,
          source: "user",
        },
        {
          id: "desk-b-block",
          taskId: "desk-b",
          title: "call pharmacy",
          blockType: "admin",
          startTime: buildScenarioIsoDateTime(plannerDate, "17:05"),
          endTime: buildScenarioIsoDateTime(plannerDate, "17:20"),
          status: "upcoming",
          locked: false,
          source: "user",
        },
      ],
      updatedAt: buildScenarioIsoDateTime(plannerDate, "16:45"),
    },
    dueWarnings: [],
    mode: "replan_from_now" as const,
    summary: {
      summaryLines: ["Revised 2 remaining blocks from the current time boundary."],
      deferredOptionalTaskCount: 0,
      forcedUnplacedTaskCount: 0,
      preservedAnchorCount: 0,
      preservedHistoryCount: 0,
      productiveBreaksUsed: false,
      clippedActiveBlock: false,
      revisedBlockCount: 2,
      stayedOutTaskCount: 0,
    },
    unplacedTasks: [],
    warnings: [],
  };
  const minorRemainderShift: typeof currentPreview = {
    ...currentPreview,
    dayPlan: {
      ...currentPreview.dayPlan,
      blocks: currentPreview.dayPlan.blocks.map((block) =>
        block.id === "desk-b-block"
          ? {
              ...block,
              startTime: buildScenarioIsoDateTime(plannerDate, "17:10"),
              endTime: buildScenarioIsoDateTime(plannerDate, "17:25"),
            }
          : block
      ),
    },
  };
  const replanEvaluation = evaluateReplanAiRefinement({
    candidateCarryForwardItems: minorRemainderShift.carryForwardItems,
    candidateDayPlan: minorRemainderShift.dayPlan,
    candidateUnplacedTasks: minorRemainderShift.unplacedTasks,
    currentCarryForwardItems: currentPreview.carryForwardItems,
    currentDayPlan: currentPreview.dayPlan,
    currentTime: buildScenarioIsoDateTime(plannerDate, "16:45"),
    currentUnplacedTasks: currentPreview.unplacedTasks,
  });

  assert.equal(
    replanEvaluation.outcome,
    "no_change",
    "small late-remainder timing shifts should not reopen the Oracle compare/apply loop"
  );
}

{
  const scenario = getScenarioById("normal-realistic-day");
  const { planner, context } = buildScenarioState(scenario);
  let state = createPlannerStoreState(planner);

  state = loadPlannerDevScenario(state, context, scenario);
  state = interpretPlannerDraft(state, context);

  assert.equal(
    state.stage,
    "interpretation",
    "normal-realistic-day: expected to start in interpretation after parsing"
  );

  const updatedState = setBreakCadence(state, context, "focus_45");

  assert.equal(
    updatedState.stage,
    "interpretation",
    "changing break cadence during interpretation should keep the review stage active"
  );
  assert.ok(
    updatedState.parsedTaskResponse,
    "changing break cadence during interpretation should preserve parsed tasks"
  );
}

{
  const context = getPlannerStoreContext(mockPlannerState);
  let localState = createPlannerStoreState(mockPlannerState);

  localState = setRawText(
    localState,
    context,
    ["email clinic about forms 15m", "shower 20m"].join("\n")
  );

  const parseContext = buildPlannerAiParseContext({
    draft: localState.intakeDraft,
    context,
    hasBlockingErrors: false,
  });

  assert.equal(
    isPlannerAiParseHighConfidence({
      baselineResponse: parseContext.baselineResponse,
      hasBlockingErrors: false,
    }),
    true,
    "simple structured inputs should stay on the high-confidence parse refinement path"
  );
  assert.equal(
    parseContext.strategy,
    "refine",
    "high-confidence local interpretation should request AI refinement instead of full parsing"
  );
}

{
  const scenario = getScenarioById("ambiguous-human-chaos-input-test");
  const scenarioDate = scenario.date ?? mockPlannerState.dayPlan.date;
  const planner = {
    ...mockPlannerState,
    currentTime: scenario.currentTime
      ? buildScenarioIsoDateTime(scenarioDate, scenario.currentTime)
      : replaceIsoDate(mockPlannerState.currentTime, scenarioDate),
    dayPlan: {
      ...mockPlannerState.dayPlan,
      date: scenarioDate,
      planningWindow: {
        startTime: replaceIsoDate(
          mockPlannerState.dayPlan.planningWindow.startTime,
          scenarioDate
        ),
        endTime: replaceIsoDate(
          mockPlannerState.dayPlan.planningWindow.endTime,
          scenarioDate
        ),
      },
      rawInput: {
        ...mockPlannerState.dayPlan.rawInput,
        createdAt: replaceIsoDate(
          mockPlannerState.dayPlan.rawInput.createdAt,
          scenarioDate
        ),
      },
    },
  };
  const context = getPlannerStoreContext(planner);
  let scenarioState = createPlannerStoreState(planner);

  scenarioState = loadPlannerDevScenario(scenarioState, context, scenario);

  const parseContext = buildPlannerAiParseContext({
    draft: scenarioState.intakeDraft,
    context,
    hasBlockingErrors: false,
  });

  assert.equal(
    isPlannerAiParseHighConfidence({
      baselineResponse: parseContext.baselineResponse,
      hasBlockingErrors: false,
    }),
    false,
    "ambiguous intake should stay on the full AI interpretation path"
  );
  assert.equal(
    parseContext.strategy,
    "full",
    "low-confidence local interpretation should escalate to full AI parsing"
  );

  const validParseResponse = {
    tasks: parseContext.baselineResponse.tasks.map(toPlannerAiTask),
    warnings: ["Estimated durations conservatively where the raw text was vague."],
    followUpQuestions: ["Which lab forms are truly due today?"],
  };
  const invalidParseResponse = {
    ...validParseResponse,
    tasks: [
      {
        ...validParseResponse.tasks[0],
        estimatedMinutes: -15,
      },
      ...validParseResponse.tasks.slice(1),
    ],
  };

  assert.equal(
    plannerAiParseResponseSchema.safeParse(validParseResponse).success,
    true,
    "planner-ai parse schema should accept a well-formed structured response"
  );
  assert.equal(
    plannerAiParseResponseSchema.safeParse(invalidParseResponse).success,
    false,
    "planner-ai parse schema should reject malformed task estimates"
  );

  const translatedParse = translateAiParseResponse({
    baselineResponse: parseContext.baselineResponse,
    response: {
      ...validParseResponse,
      tasks: validParseResponse.tasks.map((task, index) => ({
        ...task,
        id: index === 0 ? "task-ai-mismatch" : task.id,
        estimatedMinutes: task.estimatedMinutes + 5,
        source: "ai",
      })),
    },
  });

  assert.equal(
    translatedParse.value.tasks[0].id,
    parseContext.baselineResponse.tasks[0].id,
    "AI parse translation should repair invalid task ids back onto canonical tasks"
  );
  assert.deepEqual(
    translatedParse.value.followUpQuestions,
    ["Which lab forms are truly due today?"],
    "AI parse translation should preserve targeted follow-up questions"
  );
  assert.ok(
    translatedParse.repairNotes.some((note) =>
      note.includes('Reassigned the invalid task id "task-ai-mismatch"')
    ),
    "AI parse translation should expose task-id repair notes for diagnostics"
  );
}

{
  const scenario = getScenarioById("late-day-replan-stress-test");
  const { planner, state, context } = buildScenarioState(scenario);
  const sourceDayPlan = buildPlannerView(planner, state, context).dayPlan;
  const baseTask = toPlannerAiTask(sourceDayPlan.tasks[0]);
  const sourceBlock =
    sourceDayPlan.blocks.find((block) => !block.locked && Boolean(block.taskId)) ??
    sourceDayPlan.blocks.find((block) => Boolean(block.taskId));

  assert.ok(sourceBlock, "replan severity test requires at least one routed task block");

  const lowTierPayload = {
    currentTime: planner.currentTime,
    planningWindow: sourceDayPlan.planningWindow,
    breakMode: sourceDayPlan.breakMode,
    breakCadence: sourceDayPlan.breakCadence,
    paceMode: sourceDayPlan.paceMode,
    replanMode: "gentler_remainder" as const,
    tasks: [
      {
        ...baseTask,
        id: "task-low-tier",
      },
    ],
    currentBlocks: [
      {
        ...toPlannerAiBlock(sourceBlock!),
        id: "block-low-tier",
        taskId: "task-low-tier",
        locked: false,
      },
    ],
    completedBlockIds: [],
    remainingTaskIds: ["task-low-tier"],
    hardEvents: [],
    localScaffold: {
      blocks: [],
      carryForwardTaskIds: [],
      dueWarnings: [],
      warnings: [],
      summaryLines: [],
      qualityHints: [],
    },
  };

  assert.equal(
    shouldUseHighTierReplanModel(lowTierPayload),
    false,
    "routine replans without anchor pressure or overflow should stay on the standard replan model tier"
  );
  assert.equal(
    shouldUseHighTierReplanModel({
      ...lowTierPayload,
      replanMode: "preserve_focus_first",
    }),
    true,
    "preserve-focus-first replans should escalate to the high replan model tier"
  );
  assert.equal(
    shouldUseHighTierReplanModel({
      ...lowTierPayload,
      tasks: [
        ...lowTierPayload.tasks,
        {
          ...baseTask,
          id: "task-unplaced-tier",
        },
      ],
      remainingTaskIds: ["task-low-tier", "task-unplaced-tier"],
    }),
    true,
    "replans with unresolved unplaced work should escalate to the high replan model tier"
  );
}

{
  const scenario = getScenarioById("ai-draft-believability-comparison-test");
  const { planner, state, context } = buildScenarioState(scenario);
  const parsedTaskResponse = state.parsedTaskResponse;
  const draftScheduleResponse = getDraftScheduleResponse(state);

  assert.ok(parsedTaskResponse, "normal-realistic-day: expected parsed tasks");

  const draftPayload = buildDraftPayloadFromParsedTasks({
    currentTime: planner.currentTime,
    draft: state.intakeDraft,
    hardEvents: parsedTaskResponse.hardEvents,
    localScaffold: buildPlannerAiDraftLocalScaffold(draftScheduleResponse),
    parsedTaskResponse,
    context,
  });

  assert.equal(
    draftPayload.tasks.find((task) => /call pharmacy/i.test(task.title))?.routeContext
      ?.locationContext,
    "desk",
    "AI draft payload should mark desk-contact tasks conservatively"
  );
  assert.equal(
    draftPayload.tasks.find((task) => /grocery run/i.test(task.title))?.routeContext
      ?.locationContext,
    "out_of_home",
    "AI draft payload should include route-flow context for strong out-of-home tasks"
  );
  assert.ok(
    draftPayload.tasks.every((task) => Boolean(task.routeContext)),
    "AI draft payload should include route-flow context tags for every scheduling task"
  );

  const validDraftResponse = {
    tasks: draftScheduleResponse.dayPlan.tasks.map((task) => ({
      ...toPlannerAiTask(task),
      source: "ai" as const,
    })),
    blocks: draftScheduleResponse.dayPlan.blocks
      .filter(
        (block) =>
          block.blockType !== "buffer" &&
          block.status !== "done" &&
          block.status !== "skipped" &&
          block.status !== "expired"
      )
      .map((block) => ({
        ...toPlannerAiBlock(block),
        source: "ai" as const,
      })),
    warnings: ["Built a conservative one-day route."],
    summary: "Kept the route inside the planning window.",
  };
  const invalidDraftResponse = {
    ...validDraftResponse,
    blocks: [
      {
        ...validDraftResponse.blocks[0],
        endTime: 42,
      },
      ...validDraftResponse.blocks.slice(1),
    ],
  };

  assert.equal(
    plannerAiDraftResponseSchema.safeParse(validDraftResponse).success,
    true,
    "planner-ai draft schema should accept structured task and block output"
  );
  assert.equal(
    plannerAiDraftResponseSchema.safeParse(invalidDraftResponse).success,
    false,
    "planner-ai draft schema should reject malformed block fields"
  );

  const translatedDraft = translateAiDraftResponse({
    currentTime: planner.currentTime,
    dayPlan: buildDraftSeedDayPlan(planner, state),
    hardEvents: parsedTaskResponse.hardEvents,
    rawText: state.intakeDraft.rawText,
    response: validDraftResponse,
  });

  assertGeneratedRouteIsValid(
    "normal-realistic-day AI draft parity",
    planner.currentTime,
    translatedDraft.value.dayPlan,
    translatedDraft.value.unplacedTasks,
    {
      allowProductiveBreaks:
        translatedDraft.value.dayPlan.breakMode === "productive",
      carryForwardItems: translatedDraft.value.carryForwardItems,
      dueWarnings: translatedDraft.value.dueWarnings,
      strictSplittableAccounting: false,
    }
  );

  let interpretedState = createPlannerStoreState(planner);

  interpretedState = loadPlannerDevScenario(interpretedState, context, scenario);
  interpretedState = interpretPlannerDraft(interpretedState, context);

  const appliedAiDraftState = applyDraftScheduleResult({
    state: interpretedState,
    planner,
    draftScheduleResponse: translatedDraft.value,
    parsedTaskResponse: {
      ...parsedTaskResponse,
      tasks: translatedDraft.value.dayPlan.tasks,
      hardEvents: translatedDraft.value.dayPlan.hardEvents,
      warnings: [
        ...parsedTaskResponse.warnings,
        ...translatedDraft.value.warnings,
      ],
    },
  });

  assert.equal(
    appliedAiDraftState.stage,
    "draft_route",
    "AI draft application should still land in the canonical draft-route stage"
  );
  assert.equal(
    appliedAiDraftState.routeHonestyWarnings.some((warning) =>
      warning.includes("Kept the route inside the planning window.")
    ),
    false,
    "AI draft summaries should not land in route honesty warnings"
  );
  assert.equal(
    appliedAiDraftState.oracleAdvice.some((warning) =>
      warning.includes("Kept the route inside the planning window.")
    ),
    true,
    "AI draft summaries should surface through the oracle advice channel"
  );
}

{
  const scenario = getScenarioById("late-day-replan-stress-test");
  const { planner, state, context } = buildScenarioState(scenario);
  const dayPlan = buildPlannerView(planner, state, context).dayPlan;
  const replanPreview = replanRemainingDay({
    currentTime: planner.currentTime,
    dayPlan,
    replanMode: "replan_from_now",
  });
  const replanPayload = buildPlannerAiReplanPayload({
    currentTime: planner.currentTime,
    dayPlan,
    localScaffold: buildPlannerAiReplanLocalScaffold({
      ...replanPreview,
      mode: "replan_from_now",
    }),
    replanMode: "replan_from_now",
  });

  assert.ok(
    replanPayload.tasks.every((task) => task.routeContext),
    "AI replan payload should include route-flow context tags for every remaining task"
  );
}

{
  const currentTime = "2026-03-25T14:30:00-08:00";
  const planningWindow = {
    startTime: "2026-03-25T08:00:00-08:00",
    endTime: "2026-03-25T17:00:00-08:00",
  };
  const slidesTask: Task = {
    id: "task-nonsplittable-slides",
    title: "Presentation slides",
    type: "deep_work",
    estimatedMinutes: 75,
    priority: "high",
    mustDoToday: true,
    breakEligible: false,
    splittable: false,
    deferrable: false,
    energyLevel: "high",
    source: "user",
  };
  const baseDraft = buildDirectDraftRoute({
    currentTime,
    planningWindow,
    rawText: "presentation slides 75m",
    tasks: [slidesTask],
  });
  const normalizedDraftState = applyDraftScheduleResult({
    state: createPlannerStoreState(mockPlannerState),
    planner: {
      ...mockPlannerState,
      currentTime,
      dayPlan: {
        ...mockPlannerState.dayPlan,
        date: "2026-03-25",
      },
    },
    draftScheduleResponse: {
      ...baseDraft,
      warnings: ["Fixed anchors leave very little open space, so the route stays intentionally conservative."],
      oracleAdvice: [
        "The 75-minute slides task is not splittable, so it exceeds the focus_50 cadence. Consider a mid-task pause only if it wouldn't break your flow.",
        "If the clinic call runs over, start times for IM review and later tasks may shift slightly.",
      ],
    },
    parsedTaskResponse: {
      tasks: [slidesTask],
      hardEvents: [],
      warnings: [],
    },
  });

  assert.equal(
    normalizedDraftState.oracleAdvice.some((item) =>
      item.includes("current focus cadence")
    ),
    false,
    "oracle advice should drop obvious cadence commentary for non-splittable work"
  );
  assert.equal(
    normalizedDraftState.oracleAdvice.some((item) =>
      item.includes("runs over")
    ),
    false,
    "speculative route advice should be filtered out of oracle guidance"
  );
  assert.equal(
    normalizedDraftState.oracleAdvice.some((item) =>
      item.includes("Route is holding as written.")
    ),
    true,
    "when low-signal advice is removed the oracle should fall back to a brief route-aware note"
  );
  assert.equal(
    normalizedDraftState.routeHonestyWarnings.some((item) =>
      item.includes("stays intentionally conservative")
    ),
    false,
    "generic scheduling commentary should stay out of route honesty warnings"
  );
}

{
  const scenario = getScenarioById("normal-realistic-day");
  const { planner, state, context } = buildScenarioState(scenario);
  const parsedTaskResponse = state.parsedTaskResponse;
  const draftScheduleResponse = getDraftScheduleResponse(state);
  const validation = validateDaySetupDraft(state.intakeDraft, context);
  const parseContext = buildPlannerAiParseContext({
    draft: state.intakeDraft,
    context,
    hasBlockingErrors: hasBlockingErrors(validation.errors),
  });

  assert.ok(parsedTaskResponse, "normal-realistic-day: expected parsed tasks");
  assert.ok(
    parseContext.payload.baselineTasks.length > 0,
    "hybrid AI parse payload should include a baseline task scaffold"
  );
  assert.equal(
    parseContext.payload.baselineTasks.some((task) => "carryForward" in task),
    false,
    "hybrid AI parse payload should omit carry-forward state from the network transport"
  );
  assert.equal(
    parseContext.payload.baselineTasks.some((task) => "hardStartTime" in task),
    false,
    "hybrid AI parse payload should omit hard-time transport fields from the baseline task scaffold"
  );
  assert.equal(
    parseContext.payload.baselineTasks.some((task) => "routeContext" in task),
    false,
    "hybrid AI parse payload should keep the parse baseline lean and not send route context"
  );

  const localScaffold = buildPlannerAiDraftLocalScaffold(draftScheduleResponse);
  const changedTask = parsedTaskResponse.tasks[0];
  const draftPayload = buildDraftPayloadFromParsedTasks({
    currentTime: planner.currentTime,
    draft: state.intakeDraft,
    hardEvents: parsedTaskResponse.hardEvents,
    localScaffold,
    parsedTaskResponse,
    previousAcceptedAiProposal: {
      taskIds: draftScheduleResponse.dayPlan.tasks.map((task) => task.id),
      blockIds: draftScheduleResponse.dayPlan.blocks.map((block) => block.id),
      warnings: draftScheduleResponse.warnings,
      oracleAdvice: draftScheduleResponse.oracleAdvice,
    },
    changedTaskIds: [changedTask.id],
    taskDeltas: [
      {
        taskId: changedTask.id,
        changeType: "updated",
        changedFields: ["estimatedMinutes", "dueAt"],
        before: {
          id: changedTask.id,
          estimatedMinutes: changedTask.estimatedMinutes,
          dueAt: changedTask.dueAt,
        },
        after: {
          id: changedTask.id,
          estimatedMinutes: changedTask.estimatedMinutes + 15,
          dueAt: changedTask.dueAt,
        },
      },
    ],
    context,
  });

  assert.equal(
    draftPayload.localScaffold.blocks.length,
    draftScheduleResponse.dayPlan.blocks.length,
    "hybrid AI draft payload should include the local scaffold blocks"
  );
  assert.equal(
    draftPayload.paceMode,
    state.intakeDraft.paceMode,
    "hybrid AI draft payload should preserve the selected pace mode"
  );
  assert.equal(
    draftPayload.previousAcceptedAiProposal?.blockIds.length,
    draftScheduleResponse.dayPlan.blocks.length,
    "hybrid AI draft payload should include the previously accepted AI proposal when supplied"
  );
  assert.equal(
    draftPayload.localScaffold.blocks.some((block) => "title" in block),
    false,
    "hybrid AI draft payload should omit block titles from the local scaffold transport"
  );
  const draftAcceptedProposalKeys = Object.keys(
    draftPayload.previousAcceptedAiProposal ?? {}
  );
  assert.equal(
    draftAcceptedProposalKeys.includes("taskIds"),
    true,
    "hybrid AI draft payload should carry accepted draft task ids"
  );
  assert.equal(
    draftAcceptedProposalKeys.includes("blockIds"),
    true,
    "hybrid AI draft payload should carry accepted draft block ids"
  );
  assert.equal(
    draftAcceptedProposalKeys.includes("tasks"),
    false,
    "hybrid AI draft payload should not send full accepted draft task objects"
  );
  assert.equal(
    draftAcceptedProposalKeys.includes("blocks"),
    false,
    "hybrid AI draft payload should not send full accepted draft block objects"
  );
  assert.deepEqual(
    draftPayload.changedTaskIds,
    [changedTask.id],
    "hybrid AI draft payload should preserve explicit changed task ids"
  );
  assert.equal(
    draftPayload.taskDeltas?.[0]?.changedFields.includes("estimatedMinutes"),
    true,
    "hybrid AI draft payload should carry structured task deltas for small rebuilds"
  );
  assert.equal(
    draftPayload.tasks.some((task) => "notes" in task),
    false,
    "hybrid AI draft payload should omit non-essential task notes from transport"
  );
  assert.equal(
    draftPayload.localScaffold.unplacedTasks.every(
      (task) =>
        Object.keys(task).length === 2 &&
        "taskId" in task &&
        "reason" in task
    ),
    true,
    "hybrid AI draft payload should trim unplaced-task transport down to ids and reasons"
  );
  assert.equal(
    draftPayload.localScaffold.dueWarnings.every(
      (warning) =>
        Object.keys(warning).length === 2 &&
        "taskId" in warning &&
        "kind" in warning
    ),
    true,
    "hybrid AI draft payload should trim due-warning transport down to ids and kinds"
  );

  const noisyDraftPayload = buildDraftPayloadFromParsedTasks({
    currentTime: planner.currentTime,
    draft: state.intakeDraft,
    hardEvents: parsedTaskResponse.hardEvents,
    localScaffold: {
      ...localScaffold,
      warnings: ["overflow_visible", "overflow_visible", "due_pressure", "carry_forward_needed", "anchor_forced_interleaving", "dense_fragmentation"],
      qualityHints: ["overflow_visible", "overflow_visible", "due_pressure", "carry_forward_needed", "anchor_forced_interleaving", "dense_fragmentation"],
    },
    parsedTaskResponse,
    previousAcceptedAiProposal: {
      taskIds: draftScheduleResponse.dayPlan.tasks.map((task) => task.id),
      blockIds: draftScheduleResponse.dayPlan.blocks.map((block) => block.id),
      warnings: ["a", "a", "b", "c", "d", "e"],
      oracleAdvice: ["one", "one", "two", "three", "four", "five"],
    },
    context,
  });

  assert.deepEqual(
    noisyDraftPayload.localScaffold.warnings,
    ["overflow_visible", "due_pressure", "carry_forward_needed", "anchor_forced_interleaving"],
    "hybrid AI draft payload should dedupe and cap scaffold warnings at four items"
  );
  assert.deepEqual(
    noisyDraftPayload.localScaffold.qualityHints,
    ["overflow_visible", "due_pressure", "carry_forward_needed", "anchor_forced_interleaving"],
    "hybrid AI draft payload should dedupe and cap scaffold quality hints at four items"
  );
  assert.deepEqual(
    noisyDraftPayload.previousAcceptedAiProposal?.warnings,
    ["a", "b", "c", "d"],
    "hybrid AI draft payload should dedupe and cap accepted-proposal warnings at four items"
  );
  assert.deepEqual(
    noisyDraftPayload.previousAcceptedAiProposal?.oracleAdvice,
    ["one", "two", "three", "four"],
    "hybrid AI draft payload should dedupe and cap accepted-proposal oracle advice at four items"
  );
}

{
  const parseProviderOptions = buildPlannerAiProviderOptions({
    flow: "parse",
    model: "gpt-5-mini",
    strategy: "refine",
  });
  const draftProviderOptions = buildPlannerAiProviderOptions({
    flow: "draft",
    model: "gpt-5-mini",
  });
  const replanProviderOptions = buildPlannerAiProviderOptions({
    flow: "replan",
    model: "gpt-5-mini",
  });
  const unknownModelOptions = buildPlannerAiProviderOptions({
    flow: "draft",
    model: "custom-test-model",
  });

  assert.equal(
    getPlannerAiModelCapabilities("gpt-5-mini").supportsReasoningControls,
    true,
    "known planner AI models should advertise reasoning-control support via the compatibility helper"
  );
  assert.equal(
    getPlannerAiModelCapabilities("custom-test-model").supportsReasoningControls,
    false,
    "unknown models should not assume reasoning-control support"
  );
  assert.equal(
    parseProviderOptions.requestOptions.max_output_tokens,
    1400,
    "planner AI parse requests should leave modest extra output headroom by default"
  );
  assert.equal(
    draftProviderOptions.requestOptions.max_output_tokens,
    3600,
    "planner AI draft requests should raise the output cap to preserve schema validity"
  );
  assert.equal(
    replanProviderOptions.requestOptions.max_output_tokens,
    2400,
    "planner AI replan requests should raise the output cap to preserve schema validity"
  );
  assert.deepEqual(
    parseProviderOptions.requestOptions.reasoning,
    { effort: "minimal" },
    "planner AI parse requests should use the low-latency reasoning setting by default"
  );
  assert.equal(
    parseProviderOptions.requestOptions.service_tier,
    "priority",
    "planner AI requests should default to the interactive lower-latency service tier"
  );
  assert.equal(
    typeof parseProviderOptions.requestOptions.prompt_cache_key,
    "string",
    "planner AI requests should attach a prompt cache key for stable prefixes"
  );
  assert.equal(
    String(parseProviderOptions.requestOptions.prompt_cache_key).includes(
      PLANNER_AI_PROMPT_CACHE_VERSION
    ),
    true,
    "planner AI prompt cache keys should carry an explicit version"
  );
  assert.equal(
    "reasoning" in unknownModelOptions.requestOptions,
    false,
    "unknown planner AI models should omit unsupported reasoning controls"
  );
  assert.equal(
    didPlannerAiHitOutputCap({
      providerOptions: parseProviderOptions.diagnostics,
      tokenUsage: {
        inputTokens: 1000,
        uncachedInputTokens: 1000,
        cachedInputTokens: 0,
        outputTokens: 1400,
        totalTokens: 2400,
      },
    }),
    true,
    "planner AI diagnostics should flag likely truncation when output usage reaches the configured cap"
  );
  assert.equal(
    didPlannerAiHitOutputCap({
      providerOptions: draftProviderOptions.diagnostics,
      tokenUsage: {
        inputTokens: 1000,
        uncachedInputTokens: 1000,
        cachedInputTokens: 0,
        outputTokens: 2799,
        totalTokens: 3799,
      },
    }),
    false,
    "planner AI diagnostics should stay clear when output usage remains below the configured cap"
  );
}

{
  const scenario = getScenarioById("deep-work-fragmentation-torture-test");
  const { planner, state } = buildScenarioState(scenario);
  const parsedTaskResponse = state.parsedTaskResponse;
  const draftScheduleResponse = getDraftScheduleResponse(state);

  assert.ok(
    parsedTaskResponse,
    "deep-work-fragmentation-torture-test: expected parsed tasks"
  );

  const aiDraftBlocks = draftScheduleResponse.dayPlan.blocks
    .filter(
      (block) =>
        !block.locked &&
        block.blockType !== "buffer" &&
        block.status !== "done" &&
        block.status !== "skipped" &&
        block.status !== "expired"
    )
    .map((block) => ({
      ...toPlannerAiBlock(block),
      source: "ai" as const,
    }));
  const deepWorkBlock = aiDraftBlocks.find(
    (block) =>
      block.taskId &&
      draftScheduleResponse.dayPlan.tasks.find((task) => task.id === block.taskId)
        ?.type === "deep_work"
  );

  assert.ok(
    deepWorkBlock,
    "deep-work-fragmentation-torture-test: expected a deep-work block for productive-break repair coverage"
  );

  const productiveBreakMisuse = translateAiDraftResponse({
    currentTime: planner.currentTime,
    dayPlan: buildDraftSeedDayPlan(planner, state),
    hardEvents: parsedTaskResponse.hardEvents,
    rawText: state.intakeDraft.rawText,
    response: {
      tasks: parsedTaskResponse.tasks.map((task) => ({
        ...toPlannerAiTask(task),
        source: "ai" as const,
      })),
      blocks: aiDraftBlocks.map((block) =>
        block.id === deepWorkBlock!.id
          ? {
              ...block,
              blockType: "break",
              isBreakEligibleTaskPlacement: true,
            }
          : block
      ),
    },
  });
  const repairedBlock = productiveBreakMisuse.value.dayPlan.blocks.find(
    (block) => block.taskId === deepWorkBlock!.taskId
  );

  assert.equal(
    repairedBlock?.blockType,
    "focus",
    "AI draft translation should reject productive-break misuse for deep work"
  );
}

{
  const scenario = getScenarioById("execution-continuity-test");
  const { planner, state } = buildScenarioState(scenario);
  const parsedTaskResponse = state.parsedTaskResponse;
  const draftScheduleResponse = getDraftScheduleResponse(state);

  assert.ok(parsedTaskResponse, "execution-continuity-test: expected parsed tasks");
  assert.ok(
    parsedTaskResponse.hardEvents.length > 0,
    "execution-continuity-test: expected a hard event for overlap rejection"
  );

  const candidateBlocks = draftScheduleResponse.dayPlan.blocks.filter(
    (block) =>
      !block.locked &&
      block.blockType !== "break" &&
      block.blockType !== "buffer" &&
      block.status !== "done" &&
      block.status !== "skipped" &&
      block.status !== "expired"
  );
  const targetBlock = candidateBlocks[0];

  assert.ok(
    targetBlock,
    "execution-continuity-test: expected a flexible block for overlap rejection"
  );

  const conflictingEvent = parsedTaskResponse.hardEvents[0];
  const translatedDraft = translateAiDraftResponse({
    currentTime: planner.currentTime,
    dayPlan: buildDraftSeedDayPlan(planner, state),
    hardEvents: parsedTaskResponse.hardEvents,
    rawText: state.intakeDraft.rawText,
    response: {
      tasks: parsedTaskResponse.tasks.map((task) => ({
        ...toPlannerAiTask(task),
        source: "ai" as const,
      })),
      blocks: draftScheduleResponse.dayPlan.blocks
        .filter(
          (block) =>
            block.blockType !== "buffer" &&
            block.status !== "done" &&
            block.status !== "skipped" &&
            block.status !== "expired"
        )
        .map((block) =>
          block.id === targetBlock!.id
            ? {
                ...toPlannerAiBlock(block),
                startTime: conflictingEvent.startTime,
                endTime: conflictingEvent.endTime,
                locked: false,
                source: "ai" as const,
              }
            : {
                ...toPlannerAiBlock(block),
                source: "ai" as const,
              }
        ),
      warnings: ["Tried a tighter overlap than the planner allows."],
    },
  });
  const rejectedDraftState = applyDraftScheduleResult({
    state,
    planner,
    draftScheduleResponse: translatedDraft.value,
    parsedTaskResponse: {
      ...parsedTaskResponse,
      tasks: translatedDraft.value.dayPlan.tasks,
      hardEvents: translatedDraft.value.dayPlan.hardEvents,
      warnings: [
        ...parsedTaskResponse.warnings,
        ...translatedDraft.value.warnings,
      ],
    },
  });

  assert.equal(
    rejectedDraftState.draftScheduleResponse,
    state.draftScheduleResponse,
    "invalid AI draft output should preserve the existing canonical route"
  );
  assert.ok(
    rejectedDraftState.plannerWarnings.some((warning) =>
      warning.includes(`overlaps the locked anchor "${conflictingEvent.title}"`)
    ),
    "invalid AI draft output should surface overlap rejection details"
  );
}

{
  const scenario = getScenarioById("execution-continuity-test");
  const { planner, state, context } = buildScenarioState(scenario);
  const initialView = buildPlannerView(planner, state, context);
  const execution = deriveDayPlanExecutionSnapshot(
    initialView.dayPlan,
    planner.currentTime
  );

  assert.ok(
    execution.currentActionableBlock?.taskId,
    "execution-continuity-test: expected a current task block for AI replan preservation"
  );

  const completedState = markBlockComplete(
    state,
    planner.currentTime,
    execution.currentActionableBlock!.id
  );
  const completedView = buildPlannerView(planner, completedState, context);
  const localPreview = replanRemainingDay({
    currentTime: planner.currentTime,
    dayPlan: completedView.dayPlan,
    replanMode: "replan_from_now",
  });
  const completedTaskId = execution.currentActionableBlock!.taskId!;
  const futureFlexibleBlock = localPreview.dayPlan.blocks.find(
    (block) =>
      !block.locked &&
      new Date(block.startTime).getTime() >= new Date(planner.currentTime).getTime()
  );

  assert.ok(
    futureFlexibleBlock,
    "execution-continuity-test: expected a future block for AI replan rewriting coverage"
  );

  const translatedReplan = translateAiReplanResponse({
    currentTime: planner.currentTime,
    dayPlan: completedView.dayPlan,
    replanMode: "replan_from_now",
    response: {
      blocks: [
        {
          ...toPlannerAiBlock(futureFlexibleBlock!),
          id: "block-ai-rewrite-completed",
          taskId: completedTaskId,
          title: "Rewrite completed work",
          source: "ai",
        },
        ...localPreview.dayPlan.blocks
          .filter(
            (block) =>
              !block.locked &&
              new Date(block.startTime).getTime() >=
                new Date(planner.currentTime).getTime()
          )
          .map((block) => ({
            ...toPlannerAiBlock(block),
            source: "ai" as const,
          })),
      ],
      warnings: ["Rebuilt the remainder from the current boundary."],
    },
  });

  assert.equal(
    translatedReplan.value.dayPlan.blocks.some(
      (block) =>
        block.taskId === completedTaskId &&
        new Date(block.endTime).getTime() > new Date(planner.currentTime).getTime() &&
        block.status !== "done"
    ),
    false,
    "AI replan translation should not reinsert a task that is already completed"
  );
  assert.ok(
    translatedReplan.repairNotes.some((note) =>
      note.includes("completed, skipped, or fixed-time task")
    ),
    "AI replan translation should record completed-history suppression in diagnostics"
  );
}

{
  const currentTime = "2026-03-25T09:00:00-08:00";
  const planningWindow = {
    startTime: "2026-03-25T09:00:00-08:00",
    endTime: "2026-03-25T10:00:00-08:00",
  };
  const sourceTasks: Task[] = [
    {
      id: "task-carry-forward-late-ai",
      title: "Write reflection draft",
      type: "deep_work",
      estimatedMinutes: 90,
      priority: "medium",
      mustDoToday: false,
      breakEligible: false,
      splittable: true,
      deferrable: true,
      energyLevel: "high",
      dueAt: "2026-03-25T09:45:00-08:00",
      source: "user",
    },
  ];
  const canonicalDraft = buildDirectDraftRoute({
    currentTime,
    planningWindow,
    rawText: "carry-forward-late-warning-ai",
    tasks: sourceTasks,
  });
  const aiTranslatedDraft = translateAiDraftResponse({
    currentTime,
    dayPlan: {
      ...mockPlannerState.dayPlan,
      date: "2026-03-25",
      planningWindow,
      rawInput: {
        ...mockPlannerState.dayPlan.rawInput,
        rawText: "carry-forward-late-warning-ai",
        createdAt: currentTime,
      },
      tasks: sourceTasks,
      hardEvents: [],
      blocks: [],
      breakMode: "restful",
      breakCadence: "focus_50",
      completedTaskIds: [],
      updatedAt: currentTime,
    },
    hardEvents: [],
    rawText: "carry-forward-late-warning-ai",
    response: {
      tasks: sourceTasks.map((task) => ({
        ...toPlannerAiTask(task),
        source: "ai" as const,
      })),
      blocks: canonicalDraft.dayPlan.blocks
        .filter((block) => !block.locked && block.blockType !== "buffer")
        .map((block) => ({
          ...toPlannerAiBlock(block),
          source: "ai" as const,
        })),
    },
  });

  assert.equal(
    aiTranslatedDraft.value.carryForwardItems.some(
      (item) => item.taskId === "task-carry-forward-late-ai"
    ),
    true,
    "AI draft translation should preserve carry-forward accounting for overflowed work"
  );
  assert.equal(
    aiTranslatedDraft.value.dueWarnings.some(
      (warning) =>
        warning.taskId === "task-carry-forward-late-ai" &&
        warning.kind === "carried_forward_late"
    ),
    true,
    "AI draft translation should still derive structured carried-forward-late warnings app-side"
  );
}

{
  const plannerDate = mockPlannerState.dayPlan.date;
  const exportDraft: DraftScheduleResponse = {
    dayPlan: mockPlannerState.dayPlan,
    carryForwardItems: [
      {
        id: "carry-forward-export-a",
        taskId: "task-export-carry-forward",
        carriedFromDate: "2026-03-24",
        title: "Finalize referral note",
        remainingMinutes: 35,
        carryForwardReason: "overflow",
        carryForwardStatus: "pending",
        deferCount: 1,
        dueAt: buildScenarioIsoDateTime(plannerDate, "15:30"),
        dueWarningKinds: ["carried_forward_late"],
        unplacedReason: "did_not_fit_today",
        explanation: "Still did not fit after protecting the must-do work.",
        type: "admin",
        priority: "high",
        mustDoToday: true,
        breakEligible: false,
        splittable: false,
        deferrable: false,
        energyLevel: "medium",
        source: "user",
      },
    ],
    carryForwardTaskIds: ["task-export-carry-forward"],
    dueWarnings: [
      {
        taskId: "task-practice-questions",
        taskTitle: "Practice questions",
        kind: "scheduled_late",
        dueAt: buildScenarioIsoDateTime(plannerDate, "10:00"),
        relevantTime: buildScenarioIsoDateTime(plannerDate, "10:35"),
        message: "Practice questions lands after its due time.",
      },
    ],
    oracleAdvice: [
      "Protect the focus block before you absorb any new admin work.",
    ],
    unplacedTasks: [
      {
        taskId: "task-export-unplaced",
        title: "Read nephrology notes",
        reason: "needs_longer_open_slot",
        remainingMinutes: 40,
      },
    ],
    warnings: ["The afternoon route is tight around the appointment anchor."],
  };
  const selectedRouteSource = selectPlannerExportSource({
    draftScheduleResponse: exportDraft,
    replanPreview: null,
    routeWarnings: ["Overflow stayed visible in the built route."],
  });

  assert.ok(selectedRouteSource, "planner export source should exist for a built route");
  assert.equal(
    selectedRouteSource.kind,
    "route",
    "planner export should select the committed route when no preview is open"
  );

  const exportBundle = createPlannerExportBundle(selectedRouteSource);
  const rawText = exportBundle.rawText;
  const warningsIndex = rawText.indexOf("\n\nWarnings\n");
  const carryForwardIndex = rawText.indexOf("\n\nCarry forward\n");
  const unplacedIndex = rawText.indexOf("\n\nUnplaced today\n");
  const oracleAdviceIndex = rawText.indexOf("\n\nOracle guidance\n");

  assert.ok(
    rawText.startsWith("Current route for March 25, 2026"),
    "planner export raw text should start with a source-aware route heading"
  );
  assert.ok(
    rawText.includes("Schedule\n- 8:30 AM - 8:50 AM | Shower and reset [done]"),
    "planner export raw text should include deterministic schedule lines with block status"
  );
  assert.ok(
    rawText.includes(
      "Carry forward\n- Finalize referral note | 35m remaining | Overflow | From 2026-03-24"
    ),
    "planner export raw text should summarize carried-forward work"
  );
  assert.ok(
    rawText.includes(
      "Unplaced today\n- Read nephrology notes | 40m remaining | Needs a longer open slot"
    ),
    "planner export raw text should summarize unplaced work"
  );
  assert.ok(
    warningsIndex > -1 &&
      carryForwardIndex > warningsIndex &&
      unplacedIndex > carryForwardIndex &&
      oracleAdviceIndex > unplacedIndex,
    "planner export raw text should keep sections in the planned deterministic order"
  );
  assert.equal(
    /(?:^|\n)Current time:/m.test(rawText),
    false,
    "planner export raw text should not emit a standalone current-time line"
  );
  assert.ok(
    exportBundle.llmText.endsWith(exportBundle.rawText),
    "planner export LLM text should append the raw export after the prompt instruction"
  );
}

{
  const plannerDate = mockPlannerState.dayPlan.date;
  const minimalExportBundle = createPlannerExportBundle(
    createPlannerExportSourceFromDraftScheduleResponse({
      dayPlan: {
        ...mockPlannerState.dayPlan,
        date: plannerDate,
      },
      carryForwardItems: [],
      carryForwardTaskIds: [],
      dueWarnings: [],
      oracleAdvice: [],
      unplacedTasks: [],
      warnings: [],
    })
  );

  assert.equal(
    minimalExportBundle.rawText.includes("\n\nWarnings\n"),
    false,
    "planner export raw text should omit empty warning sections"
  );
  assert.equal(
    minimalExportBundle.rawText.includes("\n\nCarry forward\n"),
    false,
    "planner export raw text should omit empty carry-forward sections"
  );
  assert.equal(
    minimalExportBundle.rawText.includes("\n\nUnplaced today\n"),
    false,
    "planner export raw text should omit empty unplaced sections"
  );
  assert.equal(
    minimalExportBundle.rawText.includes("\n\nOracle guidance\n"),
    false,
    "planner export raw text should omit empty Oracle guidance sections"
  );
}

{
  const previewOnlyBlockTitle = "Preview-only focus sprint";
  const previewSource = selectPlannerExportSource({
    draftScheduleResponse: {
      dayPlan: mockPlannerState.dayPlan,
      carryForwardItems: [],
      carryForwardTaskIds: [],
      dueWarnings: [],
      oracleAdvice: [],
      unplacedTasks: [],
      warnings: [],
    },
    replanPreview: {
      dayPlan: {
        ...mockPlannerState.dayPlan,
        blocks: mockPlannerState.dayPlan.blocks.map((block, index) =>
          index === 2
            ? {
                ...block,
                title: previewOnlyBlockTitle,
              }
            : block
        ),
      },
      mode: "replan_from_now",
      summary: {
        summaryLines: ["Revised 1 remaining block from the current boundary."],
        deferredOptionalTaskCount: 0,
        forcedUnplacedTaskCount: 0,
        preservedAnchorCount: 1,
        preservedHistoryCount: 2,
        productiveBreaksUsed: false,
        clippedActiveBlock: false,
        revisedBlockCount: 1,
        stayedOutTaskCount: 0,
      },
      carryForwardItems: [],
      carryForwardTaskIds: [],
      dueWarnings: [],
      oracleAdvice: ["The preview protects the active block before admin work."],
      unplacedTasks: [],
      warnings: [],
    },
  });

  assert.ok(
    previewSource,
    "planner export source should exist when a visible replan preview is open"
  );
  assert.equal(
    previewSource.kind,
    "replan_preview",
    "planner export should prefer the visible replan preview over the committed route"
  );
  assert.ok(
    createPlannerExportBundle(previewSource).rawText.includes(previewOnlyBlockTitle),
    "planner export should serialize the visible preview content when a preview is open"
  );
}

{
  const scenario = getScenarioById("late-day-replan-stress-test");
  const { planner, state, context } = buildScenarioState(scenario);
  const draftScheduleResponse = getDraftScheduleResponse(state);
  const localPreview = replanRemainingDay({
    currentTime: planner.currentTime,
    dayPlan: buildPlannerView(planner, state, context).dayPlan,
    replanMode: "replan_from_now",
  });
  const replanPayload = buildPlannerAiReplanPayload({
    currentTime: planner.currentTime,
    dayPlan: buildPlannerView(planner, state, context).dayPlan,
    localScaffold: buildPlannerAiReplanLocalScaffold({
      carryForwardItems: localPreview.carryForwardItems,
      carryForwardTaskIds: localPreview.carryForwardTaskIds,
      dayPlan: localPreview.dayPlan,
      dueWarnings: localPreview.dueWarnings,
      mode: "replan_from_now",
      summary: localPreview.summary,
      unplacedTasks: localPreview.unplacedTasks,
      warnings: localPreview.warnings,
    }),
    replanMode: "replan_from_now",
  });

  const enrichedReplanPayload = buildPlannerAiReplanPayload({
    currentTime: planner.currentTime,
    dayPlan: buildPlannerView(planner, state, context).dayPlan,
    localScaffold: buildPlannerAiReplanLocalScaffold({
      carryForwardItems: localPreview.carryForwardItems,
      carryForwardTaskIds: localPreview.carryForwardTaskIds,
      dayPlan: localPreview.dayPlan,
      dueWarnings: localPreview.dueWarnings,
      mode: "replan_from_now",
      summary: localPreview.summary,
      unplacedTasks: localPreview.unplacedTasks,
      warnings: localPreview.warnings,
    }),
    previousAcceptedAiProposal: {
      blockIds: localPreview.dayPlan.blocks
        .filter((block) => !block.locked)
        .map((block) => block.id),
      carryForwardTaskIds: localPreview.carryForwardTaskIds,
      warnings: localPreview.warnings,
      summary: localPreview.summary.summaryLines.join(" "),
    },
    replanMode: "replan_from_now",
    changedTaskIds: replanPayload.remainingTaskIds.slice(0, 1),
    taskDeltas: [
      {
        taskId: replanPayload.remainingTaskIds[0]!,
        changeType: "updated",
        changedFields: ["estimatedMinutes"],
        before: {
          id: replanPayload.remainingTaskIds[0]!,
          estimatedMinutes: 30,
        },
        after: {
          id: replanPayload.remainingTaskIds[0]!,
          estimatedMinutes: 45,
        },
      },
    ],
    changedBlockIds: replanPayload.currentBlocks.slice(0, 1).map((block) => block.id),
    blockDeltas: replanPayload.currentBlocks.slice(0, 1).map((block) => ({
      blockId: block.id,
      changeType: "updated" as const,
      changedFields: ["status"],
      before: {
        id: block.id,
        status: block.status,
      },
      after: {
        id: block.id,
        status: "active" as const,
      },
    })),
  });

  assert.ok(
    enrichedReplanPayload.localScaffold.summaryLines.length > 0,
    "hybrid AI replan payload should include the local remainder scaffold summary"
  );
  assert.equal(
    enrichedReplanPayload.paceMode,
    buildPlannerView(planner, state, context).dayPlan.paceMode,
    "hybrid AI replan payload should preserve the selected pace mode"
  );
  assert.equal(
    enrichedReplanPayload.previousAcceptedAiProposal?.blockIds.length,
    localPreview.dayPlan.blocks.filter((block) => !block.locked).length,
    "hybrid AI replan payload should include the previously accepted AI remainder proposal when supplied"
  );
  assert.equal(
    enrichedReplanPayload.currentBlocks.some((block) => "title" in block),
    false,
    "hybrid AI replan payload should omit block titles from the current-block transport"
  );
  const replanAcceptedProposalKeys = Object.keys(
    enrichedReplanPayload.previousAcceptedAiProposal ?? {}
  );
  assert.equal(
    replanAcceptedProposalKeys.includes("blockIds"),
    true,
    "hybrid AI replan payload should carry accepted replan block ids"
  );
  assert.equal(
    replanAcceptedProposalKeys.includes("blocks"),
    false,
    "hybrid AI replan payload should not send full accepted replan block objects"
  );
  assert.equal(
    enrichedReplanPayload.taskDeltas?.[0]?.changedFields.includes("estimatedMinutes"),
    true,
    "hybrid AI replan payload should preserve structured task deltas"
  );
  assert.equal(
    enrichedReplanPayload.blockDeltas?.[0]?.changedFields.includes("status"),
    true,
    "hybrid AI replan payload should preserve structured block deltas"
  );

  const noisyReplanPayload = buildPlannerAiReplanPayload({
    currentTime: planner.currentTime,
    dayPlan: buildPlannerView(planner, state, context).dayPlan,
    localScaffold: {
      ...buildPlannerAiReplanLocalScaffold({
        carryForwardItems: localPreview.carryForwardItems,
        carryForwardTaskIds: localPreview.carryForwardTaskIds,
        dayPlan: localPreview.dayPlan,
        dueWarnings: localPreview.dueWarnings,
        mode: "replan_from_now",
        summary: localPreview.summary,
        unplacedTasks: localPreview.unplacedTasks,
        warnings: localPreview.warnings,
      }),
      warnings: ["carry_forward_needed", "carry_forward_needed", "overflow_visible", "due_pressure", "route_flow_fragmented", "dense_fragmentation"],
      summaryLines: ["Keep anchors fixed", "Keep anchors fixed", "Protect lunch", "Carry forward extras", "Warn about due pressure", "Keep clinic time"],
      qualityHints: ["carry_forward_needed", "carry_forward_needed", "overflow_visible", "due_pressure", "route_flow_fragmented", "dense_fragmentation"],
    },
    previousAcceptedAiProposal: {
      blockIds: localPreview.dayPlan.blocks
        .filter((block) => !block.locked)
        .map((block) => block.id),
      droppedTaskIds: replanPayload.remainingTaskIds.slice(0, 1),
      carryForwardTaskIds: localPreview.carryForwardTaskIds,
      warnings: ["w1", "w1", "w2", "w3", "w4", "w5"],
      summary: localPreview.summary.summaryLines.join(" "),
      oracleAdvice: ["o1", "o1", "o2", "o3", "o4", "o5"],
    },
    replanMode: "replan_from_now",
  });

  assert.deepEqual(
    noisyReplanPayload.localScaffold.warnings,
    ["carry_forward_needed", "overflow_visible", "due_pressure", "route_flow_fragmented"],
    "hybrid AI replan payload should dedupe and cap scaffold warnings at four items"
  );
  assert.deepEqual(
    noisyReplanPayload.localScaffold.summaryLines,
    ["Keep anchors fixed", "Protect lunch", "Carry forward extras", "Warn about due pressure"],
    "hybrid AI replan payload should dedupe and cap scaffold summary lines at four items"
  );
  assert.deepEqual(
    noisyReplanPayload.localScaffold.qualityHints,
    ["carry_forward_needed", "overflow_visible", "due_pressure", "route_flow_fragmented"],
    "hybrid AI replan payload should dedupe and cap scaffold quality hints at four items"
  );
  assert.deepEqual(
    noisyReplanPayload.previousAcceptedAiProposal?.warnings,
    ["w1", "w2", "w3", "w4"],
    "hybrid AI replan payload should dedupe and cap accepted-proposal warnings at four items"
  );
  assert.deepEqual(
    noisyReplanPayload.previousAcceptedAiProposal?.oracleAdvice,
    ["o1", "o2", "o3", "o4"],
    "hybrid AI replan payload should dedupe and cap accepted-proposal oracle advice at four items"
  );

  const validReplanResponse = {
    blocks: draftScheduleResponse.dayPlan.blocks
      .filter(
        (block) =>
          !block.locked &&
          block.blockType !== "buffer" &&
          new Date(block.startTime).getTime() >= new Date(planner.currentTime).getTime()
      )
      .map((block) => ({
        ...toPlannerAiBlock(block),
        source: "ai" as const,
      })),
    droppedTaskIds: [],
    carryForwardTaskIds: replanPayload.remainingTaskIds.slice(0, 1),
    warnings: ["Trimmed the remainder to keep the route believable."],
  };
  const invalidReplanResponse = {
    ...validReplanResponse,
    blocks: [
      {
        ...validReplanResponse.blocks[0],
        locked: "yes",
      },
      ...validReplanResponse.blocks.slice(1),
    ],
  };

  assert.equal(
    plannerAiReplanResponseSchema.safeParse(validReplanResponse).success,
    true,
    "planner-ai replan schema should accept structured remainder blocks"
  );
  assert.equal(
    plannerAiReplanResponseSchema.safeParse(invalidReplanResponse).success,
    false,
    "planner-ai replan schema should reject malformed remainder blocks"
  );
}

const activeCountdown = createBlockCountdownSnapshot({
  currentTime: "2026-03-25T10:34:25-08:00",
  endTime: "2026-03-25T10:50:00-08:00",
  startTime: "2026-03-25T10:00:00-08:00",
});

assert(activeCountdown, "active countdown should produce a timer snapshot");
assert.equal(
  activeCountdown.remainingLabel,
  "15m 35s",
  "active countdown should format minute-and-second remaining time"
);
assert.equal(
  activeCountdown.durationLabel,
  "50m",
  "active countdown should format total duration in minutes"
);
assert.equal(
  activeCountdown.labelMaxMinutes,
  50,
  "active countdown should use the block duration as the timer max when it is already a 5-minute increment"
);
assert.deepEqual(
  activeCountdown.labels.slice(0, 3),
  [
    { angle: 0, label: "0" },
    { angle: 36, label: "45" },
    { angle: 72, label: "40" },
  ],
  "active countdown should place 0 at noon and step down from max minus five clockwise"
);

const completedCountdown = createBlockCountdownSnapshot({
  currentTime: "2026-03-25T11:05:00-08:00",
  endTime: "2026-03-25T10:50:00-08:00",
  startTime: "2026-03-25T10:00:00-08:00",
});

assert(completedCountdown, "completed countdown should still render a snapshot");
assert.equal(
  completedCountdown.remainingLabel,
  "0s",
  "completed countdown should clamp remaining time at zero"
);

const longCountdown = createBlockCountdownSnapshot({
  currentTime: "2026-03-25T10:15:00-08:00",
  endTime: "2026-03-25T11:45:00-08:00",
  startTime: "2026-03-25T10:00:00-08:00",
});

assert(longCountdown, "long countdown should render a snapshot");
assert.equal(
  longCountdown.labelStepMinutes,
  15,
  "long countdown should reduce label density over 60 minutes"
);
assert.deepEqual(
  buildCountdownLabels(75, 15).map((label) => label.label),
  ["0", "60", "45", "30", "15"],
  "long countdown labels should stay scan-friendly"
);

console.log("Planner regression checks passed.");

"use client";

import type { FormEvent } from "react";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { PlannerShell } from "@/app/_components/planner-shell";
import {
  SampleDayPreview,
  samplePersonaScenarioIds,
  type SamplePersonaId,
} from "@/app/_components/sample-day-preview";
import { TaskIntakePanel } from "@/app/_components/task-intake-panel";
import { WaykeeperLoadingCard } from "@/app/_components/waykeeper-brand";
import { WelcomeResumeScreen } from "@/app/_components/welcome-resume-screen";
import type { WaykeeperThemeMode } from "@/app/_components/waykeeper-ui";
import {
  buildPreviewPlanningWindow,
  buildPendingFixedEventPreviews,
  getActivePlannerInputText,
  hasBlockingErrors,
  validateDaySetupDraft,
  type DaySetupInputMode,
  type IntakeFlowContext,
} from "@/app/_lib/intake-flow";
import {
  evaluateDraftAiRefinement,
  evaluateReplanAiRefinement,
} from "@/app/_lib/planner/ai-refinement";
import {
  buildDraftPayloadFromParsedTasks,
  buildPlannerAiDraftLocalScaffold,
  buildPlannerAiParseContext,
  buildPlannerAiReplanLocalScaffold,
  buildPlannerAiReplanPayload,
} from "@/app/_lib/planner/ai/context";
import {
  DEFAULT_PLANNER_AI_TIMEOUT_POLICY,
  type PlannerAiTimeoutPolicy,
} from "@/app/_lib/planner/ai/runtime";
import {
  getPlannerAiFailureSummary,
  requestPlannerAiDraft,
  requestPlannerAiParse,
  requestPlannerAiReplan,
} from "@/app/_lib/planner/ai/client";
import type {
  PlannerAiAppliedProviderOptions,
  PlannerAiAcceptedDraftProposal,
  PlannerAiAcceptedReplanProposal,
  PlannerAiBlockDelta,
  PlannerAiFlow,
  PlannerAiDraftPayload,
  PlannerAiParseStrategy,
  PlannerAiReplanPayload,
  PlannerAiScheduleBlockTransport,
  PlannerAiSchedulingTaskTransport,
  PlannerAiServerDiagnostics,
  PlannerAiTaskDelta,
  PlannerAiTimingDiagnostics,
  PlannerAiTokenUsageDiagnostics,
  PlannerDevEngineSettings,
  PlannerEngineMode,
  PlannerFlowDiagnostics,
  PlannerFlowDiagnosticsState,
  PlannerSchemaValidationDiagnostics,
} from "@/app/_lib/planner/ai/types";
import {
  DEFAULT_PLANNER_DEV_ENGINE_SETTINGS,
} from "@/app/_lib/planner/ai/types";
import {
  translateAiDraftResponse,
  translateAiParseResponse,
  translateAiReplanResponse,
} from "@/app/_lib/planner/ai/translate";
import {
  plannerDevScenarios,
  type PlannerDevScenario,
} from "@/app/_lib/planner/dev-scenarios";
import {
  addMinutesWithOffset,
  extractOffset,
  formatLocalIsoDate,
  formatLocalIsoDateTime,
  replaceIsoDatePreservingTime,
  replaceIsoTimePreservingDate,
} from "@/app/_lib/planner/date-time";
import {
  createPlannerExportBundle,
  selectPlannerExportSource,
} from "@/app/_lib/planner/export";
import {
  parsePlannerCsvImport,
  type PlannerCsvImportResult,
} from "@/app/_lib/planner/csv-intake";
import {
  getCarryForwardItemsForIntake,
  loadCarryForwardInbox,
  mergeCarryForwardInboxForDay,
  persistCarryForwardInbox,
  updateCarryForwardItemStatus,
} from "@/app/_lib/planner/carry-forward";
import {
  buildOracleAiRefinementEvent,
  buildOracleBuildEvent,
  buildOracleDraftRefinementSummary,
  buildOracleMutationEvent,
  buildOracleReplanRefinementSummary,
  buildOracleReplanEvent,
  type OraclePanelPreference,
  type OracleRecentEvent,
} from "@/app/_lib/planner/oracle";
import {
  deriveDayPlanExecutionSnapshot,
  replanRemainingDay,
  synchronizeDayPlanToCurrentTime,
} from "@/app/_lib/planner/scheduler";
import {
  acceptDetectedTaskDueDate,
  addCarryForwardItemToIntake,
  addFixedEvent,
  applyPlannerCsvImport,
  applyDraftScheduleResult,
  applyParsedTaskResponse,
  buildDraftRoute,
  buildPlannerView,
  commitReplanPreview,
  createPlannerStoreState,
  delayBlock,
  dismissDetectedTaskDueDate,
  getPlannerStoreContext,
  interpretPlannerDraft,
  keepTaskFlexible,
  lockTaskToDetectedTime,
  loadPlannerDevScenario,
  loadPlannerStoreState,
  markBlockComplete,
  persistPlannerStoreState,
  removeFixedEvent,
  returnToDaySetup,
  returnToInterpretation,
  setBreakCadence,
  setBreakMode,
  setCsvText,
  setDaySetupInputMode,
  setPaceMode,
  setPlannerCurrentTime,
  setPlanningWindowField,
  setProfileField,
  setRawText,
  skipBlock,
  setTaskDueAt,
  setTaskEstimatedMinutes,
  toggleProfilePriority,
  togglePastBlockComplete,
  unlockTaskFromTime,
  updateFixedEvent,
  type PlannerTimeMode,
  type PlannerStoreState,
} from "@/app/_lib/planner/store";
import { validateReplannedDayPlan } from "@/app/_lib/planner/validation";
import type {
  CarryForwardItem,
  DraftScheduleResponse,
  MockPlannerState,
  ReplanChangeSummary,
  ReplanMode,
  ReplanPreview,
  ScheduleBlock,
  Task,
} from "@/app/_lib/planner-types";

interface PlannerClientShellProps {
  planner: MockPlannerState;
}

interface FeedbackToastState {
  message: string;
  placeholderHeight: number;
  taskId: string;
  taskSnapshot: Task;
}

interface PlannerAiSlowPromptState {
  canUseLocalNow: boolean;
  flow: PlannerAiFlow;
  message: string;
  requestId: number;
}

interface PlannerAiActiveRequest {
  controller: AbortController;
  flow: PlannerAiFlow;
  hardTimeoutId: number;
  keepWaiting: () => void;
  requestId: number;
  softTimeoutId: number;
  useLocalNow?: () => void;
}

interface AcceptedAiDraftSession {
  proposal: PlannerAiAcceptedDraftProposal;
  requestPayload: PlannerAiDraftPayload;
}

interface AcceptedAiReplanSession {
  proposal: PlannerAiAcceptedReplanProposal;
  requestPayload: PlannerAiReplanPayload;
}

interface PendingDraftAiRefinementOffer {
  acceptedSession: AcceptedAiDraftSession;
  candidateState: PlannerStoreState;
  routeSignature: string;
  summaryLines: string[];
}

interface PendingReplanAiRefinementOffer {
  acceptedSession: AcceptedAiReplanSession;
  preview: ReplanPreview;
  summaryLines: string[];
  previewSignature: string;
}

interface DraftAiReuseContext {
  changedTaskIds?: string[];
  previousAcceptedAiProposal?: PlannerAiAcceptedDraftProposal;
  taskDeltas?: PlannerAiTaskDelta[];
}

interface ReplanAiReuseContext {
  blockDeltas?: PlannerAiBlockDelta[];
  changedBlockIds?: string[];
  changedTaskIds?: string[];
  previousAcceptedAiProposal?: PlannerAiAcceptedReplanProposal;
  taskDeltas?: PlannerAiTaskDelta[];
}

type PlannerAiInteractiveResolution<TResult> =
  | {
      kind: "ai";
      response: TResult;
    }
  | {
      kind: "use_local_now" | "hard_timeout";
    };

type TimelineViewportReason = "build" | "replan" | "time";
type EntryView = "welcome_resume" | "sample_preview" | "planner";

const DEFAULT_REPLAN_MODE: ReplanMode = "replan_from_now";
const DEV_ENGINE_STORAGE_KEY = "waykeeper-m7-dev-engine-settings";
const DEFAULT_SAMPLE_PERSONA_ID: SamplePersonaId = "professional";
const SHOULD_SKIP_WELCOME =
  process.env.NEXT_PUBLIC_WAYKEEPER_SKIP_WELCOME === "1";
const SHOULD_SHOW_DEV_TOOLS =
  process.env.NEXT_PUBLIC_WAYKEEPER_SHOW_DEV_TOOLS === "1";
const THEME_STORAGE_KEY = "waykeeper-theme-mode";
const SHOULD_REQUEST_AI_DIAGNOSTICS =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_WAYKEEPER_FORCE_AI_DIAGNOSTICS === "1";

function getInitialEntryView(): EntryView {
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("waykeeperWelcome") === "1"
  ) {
    return "welcome_resume";
  }

  return SHOULD_SKIP_WELCOME ? "planner" : "welcome_resume";
}

function loadWaykeeperThemeMode(): WaykeeperThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark"
    ? "dark"
    : "light";
}

export interface TimelineViewportRequest {
  reason: TimelineViewportReason;
  token: number;
}

function createRuntimePlanner(
  planner: MockPlannerState,
  currentTime = planner.currentTime,
  dateOverride = planner.dayPlan.date
): MockPlannerState {
  return {
    ...planner,
    currentTime,
    dayPlan: synchronizeDayPlanToCurrentTime(
      {
        ...planner.dayPlan,
        date: dateOverride,
        planningWindow: {
          startTime: replaceIsoDatePreservingTime(
            planner.dayPlan.planningWindow.startTime,
            dateOverride
          ),
          endTime: replaceIsoDatePreservingTime(
            planner.dayPlan.planningWindow.endTime,
            dateOverride
          ),
        },
        rawInput: {
          ...planner.dayPlan.rawInput,
          createdAt: replaceIsoDatePreservingTime(
            planner.dayPlan.rawInput.createdAt,
            dateOverride
          ),
        },
      },
      currentTime
    ),
  };
}

function createLiveRuntimePlanner(planner: MockPlannerState) {
  const currentTime = formatLocalIsoDateTime();

  return createRuntimePlanner(planner, currentTime, currentTime.slice(0, 10));
}

function shouldRestoreLivePlannerTime(
  session: ReturnType<typeof loadPlannerStoreState>,
  restoredDate: string
) {
  return session?.plannerTimeMode === "live" && restoredDate === formatLocalIsoDate();
}

function inferSelectedScenarioId(draft: PlannerStoreState["intakeDraft"]) {
  return (
    plannerDevScenarios.find((scenario) => {
      if (
        scenario.rawText !== draft.rawText ||
        scenario.planningStart !== draft.planningStart ||
        scenario.planningEnd !== draft.planningEnd ||
        scenario.breakMode !== draft.breakMode ||
        scenario.fixedEvents.length !== draft.fixedEvents.length
      ) {
        return false;
      }

      return scenario.fixedEvents.every((event, index) => {
        const draftEvent = draft.fixedEvents[index];

        return (
          draftEvent?.title === event.title &&
          draftEvent.startTime === event.startTime &&
          draftEvent.endTime === event.endTime &&
          draftEvent.note === (event.note ?? "")
        );
      });
    })?.id ?? plannerDevScenarios[0]?.id ?? ""
  );
}

function getDefaultScenarioId() {
  return plannerDevScenarios[0]?.id ?? "";
}

function normalizeScenarioId(scenarioId?: string | null) {
  if (
    scenarioId &&
    plannerDevScenarios.some((scenario) => scenario.id === scenarioId)
  ) {
    return scenarioId;
  }

  return getDefaultScenarioId();
}

function isPlannerEngineMode(value: unknown): value is PlannerEngineMode {
  return value === "local" || value === "ai";
}

function loadPlannerDevEngineSettings(): PlannerDevEngineSettings {
  if (typeof window === "undefined") {
    return DEFAULT_PLANNER_DEV_ENGINE_SETTINGS;
  }

  try {
    const rawValue = window.localStorage.getItem(DEV_ENGINE_STORAGE_KEY);

    if (!rawValue) {
      return DEFAULT_PLANNER_DEV_ENGINE_SETTINGS;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<PlannerDevEngineSettings>;

    return {
      interpretation: isPlannerEngineMode(parsedValue.interpretation)
        ? parsedValue.interpretation
        : DEFAULT_PLANNER_DEV_ENGINE_SETTINGS.interpretation,
      draft: isPlannerEngineMode(parsedValue.draft)
        ? parsedValue.draft
        : DEFAULT_PLANNER_DEV_ENGINE_SETTINGS.draft,
      replan: isPlannerEngineMode(parsedValue.replan)
        ? parsedValue.replan
        : DEFAULT_PLANNER_DEV_ENGINE_SETTINGS.replan,
    };
  } catch {
    return DEFAULT_PLANNER_DEV_ENGINE_SETTINGS;
  }
}

function dedupeStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function getPlannerAiTimeouts(flow: PlannerAiFlow) {
  if (typeof window === "undefined") {
    return DEFAULT_PLANNER_AI_TIMEOUT_POLICY[flow];
  }

  const overrides = (
    window as Window & {
      __WAYKEEPER_TEST_AI_TIMEOUTS__?: Partial<
        Record<PlannerAiFlow, Partial<PlannerAiTimeoutPolicy>>
      >;
    }
  ).__WAYKEEPER_TEST_AI_TIMEOUTS__;

  return {
    ...DEFAULT_PLANNER_AI_TIMEOUT_POLICY[flow],
    ...(overrides?.[flow] ?? {}),
  };
}

function createPlannerFlowDiagnostics({
  flow,
  engine,
  model,
  payloadBytes,
  providerOptions,
  tokenUsage,
  outputCapHit,
  requestPreview,
  rawResponse,
  schemaValidation,
  repairNotes = [],
  strategy,
  timings,
  fallbackOutcome,
  normalizedSummary = [],
  error,
}: {
  flow: PlannerFlowDiagnostics["flow"];
  engine: PlannerEngineMode;
  model?: string;
  payloadBytes?: number;
  providerOptions?: PlannerAiAppliedProviderOptions;
  tokenUsage?: PlannerAiTokenUsageDiagnostics;
  outputCapHit?: boolean;
  requestPreview: unknown;
  rawResponse: unknown;
  schemaValidation: PlannerSchemaValidationDiagnostics;
  repairNotes?: string[];
  strategy?: PlannerAiParseStrategy;
  timings?: PlannerAiTimingDiagnostics;
  fallbackOutcome?: string;
  normalizedSummary?: string[];
  error?: string;
}): PlannerFlowDiagnostics {
  return {
    flow,
    engine,
    updatedAt: new Date().toISOString(),
    model,
    payloadBytes,
    providerOptions,
    tokenUsage,
    outputCapHit,
    requestPreview,
    rawResponse,
    schemaValidation,
    repairNotes,
    strategy,
    timings,
    fallbackOutcome,
    normalizedSummary,
    error,
  };
}

function getServerDiagnosticsMetadata(
  diagnostics: PlannerAiServerDiagnostics | undefined
) {
  return {
    providerOptions: diagnostics?.providerOptions,
    tokenUsage: diagnostics?.tokenUsage,
    outputCapHit: diagnostics?.outputCapHit,
  };
}

function extendTimingDiagnostics(
  timings: PlannerAiTimingDiagnostics | undefined,
  overrides: Partial<PlannerAiTimingDiagnostics>
): PlannerAiTimingDiagnostics | undefined {
  const normalizeMeasuredMs = (value: number | undefined) =>
    typeof value === "number" ? Math.max(value, 1) : value;
  const nextTimings = {
    openAiFetchMs: timings?.openAiFetchMs ?? 0,
    promptBuildMs: timings?.promptBuildMs ?? 0,
    requestValidationMs: timings?.requestValidationMs ?? 0,
    responseDecodeMs: timings?.responseDecodeMs ?? 0,
    schemaValidationMs: timings?.schemaValidationMs ?? 0,
    structuredOutputParseMs: timings?.structuredOutputParseMs ?? 0,
    aiRoundTripMs: normalizeMeasuredMs(timings?.aiRoundTripMs),
    endToEndMs: normalizeMeasuredMs(timings?.endToEndMs),
    localScaffoldMs: normalizeMeasuredMs(timings?.localScaffoldMs),
    mergeValidationMs: normalizeMeasuredMs(timings?.mergeValidationMs),
    ...overrides,
  };
  nextTimings.aiRoundTripMs = normalizeMeasuredMs(nextTimings.aiRoundTripMs);
  nextTimings.endToEndMs = normalizeMeasuredMs(nextTimings.endToEndMs);
  nextTimings.localScaffoldMs = normalizeMeasuredMs(nextTimings.localScaffoldMs);
  nextTimings.mergeValidationMs = normalizeMeasuredMs(
    nextTimings.mergeValidationMs
  );

  const hasMeaningfulTimings = Object.values(nextTimings).some(
    (value) => typeof value === "number" && value > 0
  );

  return hasMeaningfulTimings ? nextTimings : undefined;
}

const TASK_DELTA_KEYS = [
  "title",
  "type",
  "estimatedMinutes",
  "priority",
  "mustDoToday",
  "breakEligible",
  "splittable",
  "deferrable",
  "energyLevel",
  "dueAt",
  "hardStartTime",
  "hardEndTime",
  "carryForward",
  "carriedFromDate",
  "carryForwardStatus",
  "routeContext",
] as const;

const BLOCK_DELTA_KEYS = [
  "taskId",
  "blockType",
  "startTime",
  "endTime",
  "status",
  "locked",
] as const;

function buildTaskDeltaSnapshot(
  task: Partial<PlannerAiSchedulingTaskTransport> | undefined
) {
  if (!task) {
    return null;
  }

  const snapshot: Partial<PlannerAiSchedulingTaskTransport> = {};
  const mutableSnapshot = snapshot as Record<string, unknown>;

  TASK_DELTA_KEYS.forEach((key) => {
    if (task[key] !== undefined) {
      mutableSnapshot[key] = task[key];
    }
  });

  if (task.id !== undefined) {
    snapshot.id = task.id;
  }

  return snapshot;
}

function buildBlockDeltaSnapshot(
  block: Partial<PlannerAiScheduleBlockTransport> | undefined
) {
  if (!block) {
    return null;
  }

  const snapshot: Partial<PlannerAiScheduleBlockTransport> = {};
  const mutableSnapshot = snapshot as Record<string, unknown>;

  BLOCK_DELTA_KEYS.forEach((key) => {
    if (block[key] !== undefined) {
      mutableSnapshot[key] = block[key];
    }
  });

  if (block.id !== undefined) {
    snapshot.id = block.id;
  }

  return snapshot;
}

function getChangedFields<TValue extends Record<string, unknown>>(
  before: TValue | null,
  after: TValue | null,
  keys: readonly string[]
) {
  return keys.filter((key) => {
    const beforeValue = before?.[key];
    const afterValue = after?.[key];

    return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
  });
}

function buildTaskDeltas(
  previousTasks: PlannerAiSchedulingTaskTransport[],
  nextTasks: PlannerAiSchedulingTaskTransport[]
): PlannerAiTaskDelta[] {
  const previousById = new Map(previousTasks.map((task) => [task.id, task] as const));
  const nextById = new Map(nextTasks.map((task) => [task.id, task] as const));
  const allTaskIds = Array.from(
    new Set([...previousById.keys(), ...nextById.keys()])
  );

  return allTaskIds
    .map((taskId) => {
      const previousTask = previousById.get(taskId);
      const nextTask = nextById.get(taskId);
      const before = buildTaskDeltaSnapshot(previousTask);
      const after = buildTaskDeltaSnapshot(nextTask);

      if (!previousTask && nextTask) {
        return {
          taskId,
          changeType: "added" as const,
          changedFields: Object.keys(after ?? {}).filter((key) => key !== "id"),
          before: null,
          after,
        };
      }

      if (previousTask && !nextTask) {
        return {
          taskId,
          changeType: "removed" as const,
          changedFields: Object.keys(before ?? {}).filter((key) => key !== "id"),
          before,
          after: null,
        };
      }

      const changedFields = getChangedFields(
        before as Record<string, unknown> | null,
        after as Record<string, unknown> | null,
        TASK_DELTA_KEYS
      );

      if (changedFields.length === 0) {
        return null;
      }

      return {
        taskId,
        changeType: "updated" as const,
        changedFields,
        before,
        after,
      };
    })
    .filter(Boolean) as PlannerAiTaskDelta[];
}

function buildBlockDeltas(
  previousBlocks: PlannerAiScheduleBlockTransport[],
  nextBlocks: PlannerAiScheduleBlockTransport[]
): PlannerAiBlockDelta[] {
  const previousById = new Map(previousBlocks.map((block) => [block.id, block] as const));
  const nextById = new Map(nextBlocks.map((block) => [block.id, block] as const));
  const allBlockIds = Array.from(
    new Set([...previousById.keys(), ...nextById.keys()])
  );

  return allBlockIds
    .map((blockId) => {
      const previousBlock = previousById.get(blockId);
      const nextBlock = nextById.get(blockId);
      const before = buildBlockDeltaSnapshot(previousBlock);
      const after = buildBlockDeltaSnapshot(nextBlock);

      if (!previousBlock && nextBlock) {
        return {
          blockId,
          changeType: "added" as const,
          changedFields: Object.keys(after ?? {}).filter((key) => key !== "id"),
          before: null,
          after,
        };
      }

      if (previousBlock && !nextBlock) {
        return {
          blockId,
          changeType: "removed" as const,
          changedFields: Object.keys(before ?? {}).filter((key) => key !== "id"),
          before,
          after: null,
        };
      }

      const changedFields = getChangedFields(
        before as Record<string, unknown> | null,
        after as Record<string, unknown> | null,
        BLOCK_DELTA_KEYS
      );

      if (changedFields.length === 0) {
        return null;
      }

      return {
        blockId,
        changeType: "updated" as const,
        changedFields,
        before,
        after,
      };
    })
    .filter(Boolean) as PlannerAiBlockDelta[];
}

function sameEventSet(previousPayload: PlannerAiDraftPayload, nextPayload: PlannerAiDraftPayload) {
  return (
    previousPayload.breakMode === nextPayload.breakMode &&
    previousPayload.breakCadence === nextPayload.breakCadence &&
    previousPayload.paceMode === nextPayload.paceMode &&
    JSON.stringify(previousPayload.planningWindow) ===
      JSON.stringify(nextPayload.planningWindow) &&
    JSON.stringify(previousPayload.hardEvents) ===
      JSON.stringify(nextPayload.hardEvents)
  );
}

function buildDraftAiReuseContext(
  previousSession: AcceptedAiDraftSession | null,
  nextPayload: PlannerAiDraftPayload
): DraftAiReuseContext {
  if (!previousSession) {
    return {};
  }

  if (!sameEventSet(previousSession.requestPayload, nextPayload)) {
    return {};
  }

  const taskDeltas = buildTaskDeltas(
    previousSession.requestPayload.tasks,
    nextPayload.tasks
  );

  const addedOrRemovedCount = taskDeltas.filter(
    (delta) => delta.changeType !== "updated"
  ).length;
  const overlapCount = nextPayload.tasks.filter((task) =>
    previousSession.requestPayload.tasks.some(
      (previousTask) => previousTask.id === task.id
    )
  ).length;
  const overlapRatio =
    nextPayload.tasks.length > 0 ? overlapCount / nextPayload.tasks.length : 1;

  if (
    addedOrRemovedCount > 1 ||
    taskDeltas.length > 4 ||
    overlapRatio < 0.6
  ) {
    return {};
  }

  return {
    previousAcceptedAiProposal: previousSession.proposal,
    changedTaskIds: taskDeltas.map((delta) => delta.taskId),
    taskDeltas,
  };
}

function buildReplanAiReuseContext(
  previousSession: AcceptedAiReplanSession | null,
  nextPayload: PlannerAiReplanPayload
): ReplanAiReuseContext {
  if (!previousSession) {
    return {};
  }

  if (
    previousSession.requestPayload.breakMode !== nextPayload.breakMode ||
    previousSession.requestPayload.breakCadence !== nextPayload.breakCadence ||
    previousSession.requestPayload.paceMode !== nextPayload.paceMode ||
    previousSession.requestPayload.replanMode !== nextPayload.replanMode ||
    JSON.stringify(previousSession.requestPayload.planningWindow) !==
      JSON.stringify(nextPayload.planningWindow)
  ) {
    return {};
  }

  const taskDeltas = buildTaskDeltas(
    previousSession.requestPayload.tasks,
    nextPayload.tasks
  );
  const blockDeltas = buildBlockDeltas(
    previousSession.requestPayload.currentBlocks,
    nextPayload.currentBlocks
  );

  if (taskDeltas.length > 4 || blockDeltas.length > 4) {
    return {};
  }

  return {
    previousAcceptedAiProposal: previousSession.proposal,
    changedTaskIds: taskDeltas.map((delta) => delta.taskId),
    taskDeltas,
    changedBlockIds: blockDeltas.map((delta) => delta.blockId),
    blockDeltas,
  };
}

function buildAcceptedDraftProposal(
  draftScheduleResponse: DraftScheduleResponse,
  oracleAdvice: string[] | undefined
): PlannerAiAcceptedDraftProposal {
  return {
    taskIds: draftScheduleResponse.dayPlan.tasks.map((task) => task.id),
    blockIds: draftScheduleResponse.dayPlan.blocks.map((block) => block.id),
    warnings: draftScheduleResponse.warnings,
    oracleAdvice,
  };
}

function buildAcceptedReplanProposal(
  preview: ReplanPreview,
  currentTime: string
): PlannerAiAcceptedReplanProposal {
  return {
    blockIds: preview.dayPlan.blocks
      .filter(
        (block) =>
          new Date(block.endTime).getTime() > new Date(currentTime).getTime() &&
          !block.locked
      )
      .map((block) => block.id),
    carryForwardTaskIds: preview.carryForwardTaskIds,
    warnings: preview.warnings,
    oracleAdvice: preview.oracleAdvice,
    summary: preview.summary.summaryLines.join(" "),
  };
}

function createDraftRouteSignature(draftScheduleResponse: DraftScheduleResponse) {
  return JSON.stringify({
    blocks: draftScheduleResponse.dayPlan.blocks.map((block) => ({
      blockType: block.blockType,
      endTime: block.endTime,
      id: block.id,
      locked: block.locked,
      startTime: block.startTime,
      status: block.status,
      taskId: block.taskId ?? null,
      title: block.title,
    })),
    carryForwardItems: draftScheduleResponse.carryForwardItems.map((item) => ({
      remainingMinutes: item.remainingMinutes,
      taskId: item.taskId,
      unplacedReason: item.unplacedReason,
    })),
    unplacedTasks: draftScheduleResponse.unplacedTasks.map((task) => ({
      reason: task.reason,
      remainingMinutes: task.remainingMinutes,
      taskId: task.taskId,
    })),
  });
}

function createReplanPreviewSignature(preview: ReplanPreview) {
  return JSON.stringify({
    blocks: preview.dayPlan.blocks.map((block) => ({
      blockType: block.blockType,
      endTime: block.endTime,
      id: block.id,
      locked: block.locked,
      startTime: block.startTime,
      status: block.status,
      taskId: block.taskId ?? null,
      title: block.title,
    })),
    carryForwardItems: preview.carryForwardItems.map((item) => ({
      remainingMinutes: item.remainingMinutes,
      taskId: item.taskId,
      unplacedReason: item.unplacedReason,
    })),
    mode: preview.mode,
    unplacedTasks: preview.unplacedTasks.map((task) => ({
      reason: task.reason,
      remainingMinutes: task.remainingMinutes,
      taskId: task.taskId,
    })),
  });
}

function buildDraftArtifacts({
  context,
  plannerForBuild,
  workingState,
}: {
  context: IntakeFlowContext;
  plannerForBuild: MockPlannerState;
  workingState: PlannerStoreState;
}) {
  const parsedTaskResponse = workingState.parsedTaskResponse;

  if (!parsedTaskResponse) {
    return null;
  }

  const completedTaskIds =
    workingState.stage === "draft_route" && workingState.draftScheduleResponse
      ? workingState.draftScheduleResponse.dayPlan.completedTaskIds ??
        plannerForBuild.dayPlan.completedTaskIds ??
        []
      : plannerForBuild.dayPlan.completedTaskIds ?? [];
  const plannerForDraftRoute: MockPlannerState = {
    ...plannerForBuild,
    dayPlan: {
      ...plannerForBuild.dayPlan,
      completedTaskIds,
    },
  };
  const draftSeedDayPlan = {
    ...plannerForBuild.dayPlan,
    planningWindow: buildPreviewPlanningWindow(workingState.intakeDraft, context),
    rawInput: {
      ...plannerForBuild.dayPlan.rawInput,
      rawText: getActivePlannerInputText(workingState.intakeDraft),
    },
    tasks: parsedTaskResponse.tasks,
    hardEvents: parsedTaskResponse.hardEvents,
    blocks: [],
    breakMode: workingState.intakeDraft.breakMode,
    breakCadence: workingState.intakeDraft.breakCadence,
    paceMode: workingState.intakeDraft.paceMode,
    completedTaskIds,
    updatedAt: plannerForBuild.currentTime,
  };
  const localDraftStartedAt = Date.now();
  const localDraftState = buildDraftRoute(workingState, plannerForDraftRoute, context);
  const localScaffoldMs = Date.now() - localDraftStartedAt;
  const localDraftIsValid =
    localDraftState.stage === "draft_route" &&
    Boolean(localDraftState.draftScheduleResponse);
  const localScaffold = localDraftState.draftScheduleResponse
    ? buildPlannerAiDraftLocalScaffold(localDraftState.draftScheduleResponse)
    : {
        blocks: [] as ScheduleBlock[],
        unplacedTasks: [],
        carryForwardTaskIds: [],
        dueWarnings: [],
        warnings: localDraftState.plannerWarnings,
        qualityHints: ["local_scaffold_invalid"],
      };

  return {
    draftSeedDayPlan,
    localDraftIsValid,
    localDraftState,
    localScaffold,
    localScaffoldMs,
    parsedTaskResponse,
    plannerForDraftRoute,
  };
}

function getRuntimeRestoreDate(
  planner: MockPlannerState,
  session: ReturnType<typeof loadPlannerStoreState>
) {
  if (!session) {
    return planner.dayPlan.date;
  }

  if (session.plannerState.draftScheduleResponse?.dayPlan.date) {
    return session.plannerState.draftScheduleResponse.dayPlan.date;
  }

  if (session.plannerCurrentTime) {
    return session.plannerCurrentTime.slice(0, 10);
  }

  const selectedScenario = plannerDevScenarios.find(
    (scenario) => scenario.id === session.selectedScenarioId
  );

  return selectedScenario?.date ?? planner.dayPlan.date;
}

export function PlannerClientShell({ planner }: PlannerClientShellProps) {
  const [plannerRuntime, setPlannerRuntime] = useState<MockPlannerState>(() =>
    createRuntimePlanner(planner)
  );
  const plannerContext = getPlannerStoreContext(plannerRuntime);
  const [state, setState] = useState<PlannerStoreState>(() =>
    createPlannerStoreState(planner)
  );
  const [entryView, setEntryView] = useState<EntryView>(() => getInitialEntryView());
  const [themeMode, setThemeMode] = useState<WaykeeperThemeMode>(() =>
    loadWaykeeperThemeMode()
  );
  const [plannerTimeMode, setPlannerTimeMode] =
    useState<PlannerTimeMode>("manual");
  const [selectedSamplePersonaId, setSelectedSamplePersonaId] =
    useState<SamplePersonaId>(DEFAULT_SAMPLE_PERSONA_ID);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<FeedbackToastState | null>(null);
  const [isRouteUpdating, setIsRouteUpdating] = useState(false);
  const [aiSlowPrompt, setAiSlowPrompt] = useState<PlannerAiSlowPromptState | null>(
    null
  );
  const [aiDiagnostics, setAiDiagnostics] = useState<PlannerFlowDiagnosticsState>(
    {}
  );
  const [devEngineSettings, setDevEngineSettings] =
    useState<PlannerDevEngineSettings>(() => loadPlannerDevEngineSettings());
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    plannerDevScenarios[0]?.id ?? ""
  );
  const [carryForwardInbox, setCarryForwardInbox] = useState<CarryForwardItem[]>(
    () => loadCarryForwardInbox()
  );
  const [selectedReplanMode, setSelectedReplanMode] =
    useState<ReplanMode>(DEFAULT_REPLAN_MODE);
  const [replanErrors, setReplanErrors] = useState<string[]>([]);
  const [replanPreview, setReplanPreview] = useState<ReplanPreview | null>(null);
  const [csvImportReport, setCsvImportReport] =
    useState<PlannerCsvImportResult | null>(null);
  const [pendingCsvImport, setPendingCsvImport] =
    useState<PlannerCsvImportResult | null>(null);
  const [pendingDraftAiRefinementOffer, setPendingDraftAiRefinementOffer] =
    useState<PendingDraftAiRefinementOffer | null>(null);
  const [pendingReplanAiRefinementOffer, setPendingReplanAiRefinementOffer] =
    useState<PendingReplanAiRefinementOffer | null>(null);
  const [lastAppliedReplanSummary, setLastAppliedReplanSummary] =
    useState<ReplanChangeSummary | null>(null);
  const [oraclePanelPreference, setOraclePanelPreference] =
    useState<OraclePanelPreference>("auto");
  const [oracleRecentEvent, setOracleRecentEvent] =
    useState<OracleRecentEvent | null>(null);
  const [timelineViewportRequest, setTimelineViewportRequest] =
    useState<TimelineViewportRequest>({
      reason: "build",
      token: 0,
    });
  const feedbackTimeoutRef = useRef<number | null>(null);
  const routeUpdatingTimeoutRef = useRef<number | null>(null);
  const aiRequestSequenceRef = useRef(0);
  const activeAiRequestRef = useRef<PlannerAiActiveRequest | null>(null);
  const acceptedAiDraftRef = useRef<AcceptedAiDraftSession | null>(null);
  const acceptedAiReplanRef = useRef<AcceptedAiReplanSession | null>(null);
  const stateRef = useRef(state);
  const replanPreviewRef = useRef(replanPreview);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    replanPreviewRef.current = replanPreview;
  }, [replanPreview]);

  const restorePersistedSession = useEffectEvent(() => {
    const persistedSession = loadPlannerStoreState(planner);

    if (!persistedSession) {
      return false;
    }

    const restoredDate = getRuntimeRestoreDate(planner, persistedSession);
    const restoreLiveTime = shouldRestoreLivePlannerTime(
      persistedSession,
      restoredDate
    );
    const restoredCurrentTime = restoreLiveTime
      ? formatLocalIsoDateTime()
      : persistedSession.plannerCurrentTime ?? planner.currentTime;

    setPlannerRuntime(
      createRuntimePlanner(
        planner,
        restoredCurrentTime,
        restoredDate
      )
    );
    setPlannerTimeMode(restoreLiveTime ? "live" : "manual");
    setState(persistedSession.plannerState);
    setCarryForwardInbox(loadCarryForwardInbox());
    setDevEngineSettings(loadPlannerDevEngineSettings());
    setSelectedScenarioId(
      normalizeScenarioId(
        persistedSession.selectedScenarioId ??
          inferSelectedScenarioId(persistedSession.plannerState.intakeDraft)
      )
    );

    setSelectedReplanMode(DEFAULT_REPLAN_MODE);

    return true;
  });

  useEffect(() => {
    queueMicrotask(() => {
      startTransition(() => {
        restorePersistedSession();
        setHasHydrated(true);
      });
    });
  }, [planner]);

  useEffect(() => {
    const handleHistoryRestore = () => {
      startTransition(() => {
        if (!restorePersistedSession()) {
          setSelectedScenarioId((currentScenarioId) =>
            normalizeScenarioId(currentScenarioId)
          );
        }
      });
    };

    window.addEventListener("pageshow", handleHistoryRestore);
    window.addEventListener("popstate", handleHistoryRestore);

    return () => {
      window.removeEventListener("pageshow", handleHistoryRestore);
      window.removeEventListener("popstate", handleHistoryRestore);
    };
  }, [planner]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    persistPlannerStoreState(state, {
      plannerCurrentTime: plannerRuntime.currentTime,
      plannerTimeMode,
      selectedScenarioId,
    });
  }, [
    hasHydrated,
    plannerRuntime.currentTime,
    plannerTimeMode,
    selectedScenarioId,
    state,
  ]);

  const tickLivePlannerTime = useEffectEvent(() => {
    const liveTime = formatLocalIsoDateTime();

    if (plannerRuntime.dayPlan.date !== liveTime.slice(0, 10)) {
      setPlannerTimeMode("manual");
      return;
    }

    applyPlannerTime(liveTime, {
      clearReplanUi: false,
      timeMode: "live",
    });
  });
  const hasDraftScheduleResponse = Boolean(state.draftScheduleResponse);

  useEffect(() => {
    if (
      !hasHydrated ||
      plannerTimeMode !== "live" ||
      !hasDraftScheduleResponse
    ) {
      return;
    }

    tickLivePlannerTime();
    const intervalId = window.setInterval(tickLivePlannerTime, 1000);

    return () => window.clearInterval(intervalId);
  }, [
    hasHydrated,
    hasDraftScheduleResponse,
    plannerRuntime.dayPlan.date,
    plannerTimeMode,
  ]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    persistCarryForwardInbox(carryForwardInbox);
  }, [carryForwardInbox, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      DEV_ENGINE_STORAGE_KEY,
      JSON.stringify(devEngineSettings)
    );
  }, [devEngineSettings, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [hasHydrated, themeMode]);

  const syncCarryForwardInbox = useEffectEvent(
    (draftScheduleResponse: PlannerStoreState["draftScheduleResponse"]) => {
      if (!draftScheduleResponse) {
        return;
      }

      const { carryForwardItems, dayPlan } = draftScheduleResponse;

      setCarryForwardInbox((currentInbox) =>
        mergeCarryForwardInboxForDay(
          currentInbox,
          carryForwardItems,
          dayPlan.date
        )
      );
    }
  );

  useEffect(() => {
    if (state.stage !== "draft_route" || !state.draftScheduleResponse) {
      return;
    }

    syncCarryForwardInbox(state.draftScheduleResponse);
  }, [
    state.draftScheduleResponse,
    state.stage,
  ]);

  useEffect(() => {
    return () => {
      const activeRequest = activeAiRequestRef.current;

      if (activeRequest) {
        window.clearTimeout(activeRequest.softTimeoutId);
        window.clearTimeout(activeRequest.hardTimeoutId);
        activeRequest.controller.abort();
        activeAiRequestRef.current = null;
      }

      if (feedbackTimeoutRef.current) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }

      if (routeUpdatingTimeoutRef.current) {
        window.clearTimeout(routeUpdatingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!oracleRecentEvent || oraclePanelPreference === "adjust") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setOracleRecentEvent((currentEvent) =>
        currentEvent?.eventId === oracleRecentEvent.eventId ? null : currentEvent
      );
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [oraclePanelPreference, oracleRecentEvent]);

  const plannerView = buildPlannerView(plannerRuntime, state, plannerContext);
  const pendingFixedEventPreviews = buildPendingFixedEventPreviews(
    state.intakeDraft,
    plannerContext
  );

  function clearReplanUi(options?: {
    keepAppliedSummary?: boolean;
  }) {
    cancelActiveAiRequest();
    setReplanErrors([]);
    setReplanPreview(null);
    setPendingDraftAiRefinementOffer(null);
    setPendingReplanAiRefinementOffer(null);

    if (!options?.keepAppliedSummary) {
      setLastAppliedReplanSummary(null);
    }
  }

  function showOracleEvent(
    event: OracleRecentEvent,
    options?: { keepPanelPreference?: boolean }
  ) {
    if (!options?.keepPanelPreference) {
      setOraclePanelPreference("auto");
    }
    setOracleRecentEvent(event);
  }

  function requestTimelineViewport(reason: TimelineViewportReason) {
    setTimelineViewportRequest((previousRequest) => ({
      reason,
      token: previousRequest.token + 1,
    }));
  }

  function resetSelectedReplanMode() {
    setSelectedReplanMode(DEFAULT_REPLAN_MODE);
  }

  function applyPlannerTime(
    currentTime: string,
    options?: {
      clearReplanUi?: boolean;
      requestViewport?: boolean;
      timeMode?: PlannerTimeMode;
    }
  ) {
    setPlannerTimeMode(options?.timeMode ?? "manual");

    if (options?.clearReplanUi !== false) {
      clearReplanUi();
    }

    if (options?.requestViewport && state.draftScheduleResponse) {
      requestTimelineViewport("time");
    }

    setPlannerRuntime((previousPlanner) =>
      createRuntimePlanner(previousPlanner, currentTime)
    );
    setState((previousState) =>
      setPlannerCurrentTime(previousState, currentTime)
    );
  }

  function handleAdjustPlannerTime(minutes: number) {
    applyPlannerTime(
      addMinutesWithOffset(
        plannerRuntime.currentTime,
        minutes,
        extractOffset(plannerRuntime.currentTime)
      ),
      {
        requestViewport: true,
      }
    );
  }

  function handleSetPlannerTime(time: string) {
    if (!time) {
      return;
    }

    applyPlannerTime(
      replaceIsoTimePreservingDate(plannerRuntime.currentTime, time),
      {
        requestViewport: true,
      }
    );
  }

  function handleResetPlannerTime() {
    applyPlannerTime(planner.currentTime, {
      requestViewport: true,
    });
  }

  function showFeedbackToast(
    task: Task,
    message: string,
    placeholderHeight: number
  ) {
    setFeedbackToast({
      taskId: task.id,
      message,
      placeholderHeight,
      taskSnapshot: task,
    });

    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }

    feedbackTimeoutRef.current = window.setTimeout(() => {
      setFeedbackToast(null);
      feedbackTimeoutRef.current = null;
    }, 2600);
  }

  function setPlannerFlowDiagnostics(diagnostics: PlannerFlowDiagnostics) {
    setAiDiagnostics((currentDiagnostics) => ({
      ...currentDiagnostics,
      [diagnostics.flow]: diagnostics,
    }));
  }

  function clearAiSlowPrompt(requestId?: number) {
    setAiSlowPrompt((currentPrompt) => {
      if (!currentPrompt) {
        return currentPrompt;
      }

      if (
        typeof requestId === "number" &&
        currentPrompt.requestId !== requestId
      ) {
        return currentPrompt;
      }

      return null;
    });
  }

  function clearActiveAiRequest(requestId?: number) {
    const activeRequest = activeAiRequestRef.current;

    if (!activeRequest) {
      clearAiSlowPrompt(requestId);
      return;
    }

    if (
      typeof requestId === "number" &&
      activeRequest.requestId !== requestId
    ) {
      clearAiSlowPrompt(requestId);
      return;
    }

    window.clearTimeout(activeRequest.softTimeoutId);
    window.clearTimeout(activeRequest.hardTimeoutId);
    activeAiRequestRef.current = null;
    clearAiSlowPrompt(activeRequest.requestId);
  }

  function cancelActiveAiRequest() {
    const activeRequest = activeAiRequestRef.current;

    if (!activeRequest) {
      return;
    }

    activeRequest.controller.abort();
    clearActiveAiRequest(activeRequest.requestId);
  }

  async function runInteractivePlannerAiRequest<TResult>({
    canUseLocalNow,
    flow,
    message,
    run,
    showSlowPrompt = true,
  }: {
    canUseLocalNow: boolean;
    flow: PlannerAiFlow;
    message: string;
    run: (options: { signal: AbortSignal }) => Promise<TResult>;
    showSlowPrompt?: boolean;
  }): Promise<PlannerAiInteractiveResolution<TResult>> {
    cancelActiveAiRequest();

    const { hardMs, softMs } = getPlannerAiTimeouts(flow);
    const requestId = aiRequestSequenceRef.current + 1;
    aiRequestSequenceRef.current = requestId;

    const controller = new AbortController();
    let resolveUseLocalNow: (() => void) | null = null;
    const useLocalNowPromise = new Promise<"use_local_now">((resolve) => {
      resolveUseLocalNow = () => resolve("use_local_now");
    });
    const hardTimeoutPromise = new Promise<"hard_timeout">((resolve) => {
      const hardTimeoutId = window.setTimeout(() => resolve("hard_timeout"), hardMs);
      const softTimeoutId = window.setTimeout(() => {
        if (
          !showSlowPrompt ||
          activeAiRequestRef.current?.requestId !== requestId
        ) {
          return;
        }

        setAiSlowPrompt({
          canUseLocalNow,
          flow,
          message,
          requestId,
        });
      }, softMs);

      activeAiRequestRef.current = {
        controller,
        flow,
        hardTimeoutId,
        keepWaiting: () => clearAiSlowPrompt(requestId),
        requestId,
        softTimeoutId,
        useLocalNow: canUseLocalNow ? resolveUseLocalNow ?? undefined : undefined,
      };
    });

    try {
      const resolution = await Promise.race([
        run({ signal: controller.signal }).then(
          (response) =>
            ({
              kind: "ai",
              response,
            }) satisfies PlannerAiInteractiveResolution<TResult>
        ),
        useLocalNowPromise.then(
          () =>
            ({
              kind: "use_local_now",
            }) satisfies PlannerAiInteractiveResolution<TResult>
        ),
        hardTimeoutPromise.then(
          () =>
            ({
              kind: "hard_timeout",
            }) satisfies PlannerAiInteractiveResolution<TResult>
        ),
      ]);

      if (resolution.kind !== "ai") {
        controller.abort();
      }

      return resolution;
    } finally {
      clearActiveAiRequest(requestId);
    }
  }

  function handleKeepWaitingForAi() {
    activeAiRequestRef.current?.keepWaiting();
  }

  function handleUseLocalNowForAi() {
    activeAiRequestRef.current?.useLocalNow?.();
  }

  function setRouteUpdatingIndicator(active: boolean) {
    if (routeUpdatingTimeoutRef.current) {
      window.clearTimeout(routeUpdatingTimeoutRef.current);
      routeUpdatingTimeoutRef.current = null;
    }

    setIsRouteUpdating(active);
  }

  function pulseRouteUpdating() {
    setRouteUpdatingIndicator(true);

    routeUpdatingTimeoutRef.current = window.setTimeout(() => {
      setIsRouteUpdating(false);
      routeUpdatingTimeoutRef.current = null;
    }, 700);
  }

  function clearEphemeralUiState() {
    cancelActiveAiRequest();

    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }

    if (routeUpdatingTimeoutRef.current) {
      window.clearTimeout(routeUpdatingTimeoutRef.current);
      routeUpdatingTimeoutRef.current = null;
    }

    setFeedbackToast(null);
    setCsvImportReport(null);
    setPendingCsvImport(null);
    setRouteUpdatingIndicator(false);
    clearReplanUi();
  }

  function clearAcceptedAiSessions() {
    acceptedAiDraftRef.current = null;
    acceptedAiReplanRef.current = null;
  }

  function buildDraftRebuildState(
    previousState: PlannerStoreState,
    nextState: PlannerStoreState
  ) {
    if (
      previousState.stage !== "draft_route" ||
      !previousState.draftScheduleResponse
    ) {
      return nextState;
    }

    return {
      ...nextState,
      stage: "draft_route" as const,
      draftScheduleResponse: previousState.draftScheduleResponse,
    };
  }

  function hasAnyDraftFixedEventContent(sourceState: PlannerStoreState) {
    return sourceState.intakeDraft.fixedEvents.some((event) =>
      Boolean(
        event.title.trim() || event.startTime || event.endTime || event.note.trim()
      )
    );
  }

  function shouldConfirmCsvImportReplacement(sourceState: PlannerStoreState) {
    return Boolean(
      sourceState.parsedTaskResponse ||
        sourceState.draftScheduleResponse ||
        sourceState.intakeCarryForwardItems.length > 0 ||
        sourceState.intakeDraft.rawText.trim() ||
        hasAnyDraftFixedEventContent(sourceState)
    );
  }

  function applyCsvImportResult(importResult: PlannerCsvImportResult) {
    clearAcceptedAiSessions();
    setAiDiagnostics({});
    setCsvImportReport(importResult);
    setPendingCsvImport(null);
    setFeedbackToast(null);
    startTransition(() => {
      setState((previousState) =>
        applyPlannerCsvImport(previousState, plannerContext, importResult)
      );
    });
  }

  function buildPlannerFailureState({
    baseState,
    plannerWarning,
    validation,
  }: {
    baseState: PlannerStoreState;
    plannerWarning: string;
    validation: ReturnType<typeof validateDaySetupDraft>;
  }) {
    return {
      ...baseState,
      errors: validation.errors,
      warnings: validation.warnings,
      plannerWarnings: dedupeStrings([
        ...baseState.plannerWarnings,
        plannerWarning,
      ]),
    };
  }

  async function continueDraftAiRefinement({
    currentTime,
    draftBuildStartedAt,
    draftPayload,
    draftSeedDayPlan,
    localDraftState,
    localScaffold,
    localScaffoldMs,
    parsedTaskResponse,
    plannerForDraftRoute,
    requestSignature,
    validation,
    workingState,
  }: {
    currentTime: string;
    draftBuildStartedAt: number;
    draftPayload: PlannerAiDraftPayload;
    draftSeedDayPlan: MockPlannerState["dayPlan"];
    localDraftState: PlannerStoreState;
    localScaffold: ReturnType<typeof buildPlannerAiDraftLocalScaffold>;
    localScaffoldMs: number;
    parsedTaskResponse: NonNullable<PlannerStoreState["parsedTaskResponse"]>;
    plannerForDraftRoute: MockPlannerState;
    requestSignature: string;
    validation: ReturnType<typeof validateDaySetupDraft>;
    workingState: PlannerStoreState;
  }) {
    const aiDraftRoundTripStartedAt = Date.now();
    const aiDraftResolution = await runInteractivePlannerAiRequest({
      canUseLocalNow: false,
      flow: "draft",
      message: "AI is taking longer than usual.",
      run: ({ signal }) =>
        requestPlannerAiDraft(
          {
            flow: "draft",
            includeDiagnostics: SHOULD_REQUEST_AI_DIAGNOSTICS,
            payload: draftPayload,
          },
          { signal }
        ),
      showSlowPrompt: false,
    });
    const aiRoundTripMs = Date.now() - aiDraftRoundTripStartedAt;
    const currentDraftScheduleResponse = stateRef.current.draftScheduleResponse;

    if (
      !currentDraftScheduleResponse ||
      createDraftRouteSignature(currentDraftScheduleResponse) !== requestSignature
    ) {
      return;
    }

    if (aiDraftResolution.kind !== "ai") {
      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "draft",
          engine: "ai",
          requestPreview: draftPayload,
          rawResponse: {
            localScaffold,
            visibleRoute: localDraftState.draftScheduleResponse,
          },
          schemaValidation: {
            passed: true,
            issues: [],
          },
          fallbackOutcome:
            "The visible route stayed local because the background AI review did not finish in time.",
          normalizedSummary: [
            `Built ${currentDraftScheduleResponse.dayPlan.blocks.length} canonical blocks locally before the AI review finished.`,
          ],
          timings: extendTimingDiagnostics(undefined, {
            endToEndMs: Date.now() - draftBuildStartedAt,
            localScaffoldMs,
            aiRoundTripMs,
          }),
        })
      );
      return;
    }

    const aiDraftResult = aiDraftResolution.response;

    if (!aiDraftResult.ok) {
      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "draft",
          engine: "ai",
          model: aiDraftResult.diagnostics?.model,
          payloadBytes: aiDraftResult.diagnostics?.payloadBytes,
          ...getServerDiagnosticsMetadata(aiDraftResult.diagnostics),
          requestPreview:
            aiDraftResult.diagnostics?.requestPreview ?? draftPayload,
          rawResponse:
            aiDraftResult.diagnostics?.rawResponse ??
            {
              localScaffold,
              visibleRoute: localDraftState.draftScheduleResponse,
            },
          schemaValidation:
            aiDraftResult.diagnostics?.schemaValidation ?? {
              passed: false,
              issues: [aiDraftResult.error],
            },
          repairNotes: aiDraftResult.diagnostics?.repairNotes ?? [],
          timings: extendTimingDiagnostics(aiDraftResult.diagnostics?.timings, {
            endToEndMs: Date.now() - draftBuildStartedAt,
            localScaffoldMs,
            aiRoundTripMs,
          }),
          fallbackOutcome:
            "The visible route stayed local because the background AI review failed.",
          normalizedSummary: [
            `Built ${currentDraftScheduleResponse.dayPlan.blocks.length} canonical blocks locally before the AI review failed.`,
          ],
          error: getPlannerAiFailureSummary("draft", aiDraftResult.error),
        })
      );
      return;
    }

    const mergeValidationStartedAt = Date.now();
    const translatedDraft = translateAiDraftResponse({
      currentTime,
      dayPlan: draftSeedDayPlan,
      hardEvents: parsedTaskResponse.hardEvents,
      rawText: getActivePlannerInputText(workingState.intakeDraft),
      response: aiDraftResult.result,
    });
    const candidateState = applyDraftScheduleResult({
      state: localDraftState,
      planner: plannerForDraftRoute,
      draftScheduleResponse: translatedDraft.value,
      parsedTaskResponse: {
        ...parsedTaskResponse,
        tasks: translatedDraft.value.dayPlan.tasks,
        hardEvents: translatedDraft.value.dayPlan.hardEvents,
        warnings: parsedTaskResponse.warnings,
      },
      errors: validation.errors,
      warnings: validation.warnings,
    });
    const mergeValidationMs = Date.now() - mergeValidationStartedAt;
    const candidateDraftScheduleResponse = candidateState.draftScheduleResponse;

    if (!candidateDraftScheduleResponse) {
      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "draft",
          engine: "ai",
          model: aiDraftResult.diagnostics?.model,
          payloadBytes: aiDraftResult.diagnostics?.payloadBytes,
          ...getServerDiagnosticsMetadata(aiDraftResult.diagnostics),
          requestPreview:
            aiDraftResult.diagnostics?.requestPreview ?? draftPayload,
          rawResponse:
            aiDraftResult.diagnostics?.rawResponse ?? aiDraftResult.result,
          schemaValidation:
            aiDraftResult.diagnostics?.schemaValidation ?? {
              passed: true,
              issues: [],
            },
          repairNotes: dedupeStrings([
            ...(aiDraftResult.diagnostics?.repairNotes ?? []),
            ...translatedDraft.repairNotes,
          ]),
          timings: extendTimingDiagnostics(aiDraftResult.diagnostics?.timings, {
            endToEndMs: Date.now() - draftBuildStartedAt,
            localScaffoldMs,
            aiRoundTripMs,
            mergeValidationMs,
          }),
          fallbackOutcome:
            "The visible route stayed local because the AI second pass failed app-side validation.",
          normalizedSummary: translatedDraft.normalizedSummary,
          error:
            "AI draft proposal failed app-side validation, so the visible local route stayed in place.",
        })
      );
      return;
    }

    if (
      !stateRef.current.draftScheduleResponse ||
      createDraftRouteSignature(stateRef.current.draftScheduleResponse) !==
        requestSignature
    ) {
      return;
    }

    const refinementEvaluation = evaluateDraftAiRefinement({
      candidateCarryForwardItems: candidateDraftScheduleResponse.carryForwardItems,
      candidateDayPlan: candidateDraftScheduleResponse.dayPlan,
      candidateUnplacedTasks: candidateDraftScheduleResponse.unplacedTasks,
      currentCarryForwardItems: currentDraftScheduleResponse.carryForwardItems,
      currentDayPlan: currentDraftScheduleResponse.dayPlan,
      currentTime,
      currentUnplacedTasks: currentDraftScheduleResponse.unplacedTasks,
    });

    if (refinementEvaluation.outcome === "no_change") {
      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "draft",
          engine: "ai",
          model: aiDraftResult.diagnostics?.model,
          payloadBytes: aiDraftResult.diagnostics?.payloadBytes,
          ...getServerDiagnosticsMetadata(aiDraftResult.diagnostics),
          requestPreview:
            aiDraftResult.diagnostics?.requestPreview ?? draftPayload,
          rawResponse:
            aiDraftResult.diagnostics?.rawResponse ?? {
              refinementEvaluation,
              result: aiDraftResult.result,
            },
          schemaValidation:
            aiDraftResult.diagnostics?.schemaValidation ?? {
              passed: true,
              issues: [],
            },
          repairNotes: dedupeStrings([
            ...(aiDraftResult.diagnostics?.repairNotes ?? []),
            ...translatedDraft.repairNotes,
          ]),
          timings: extendTimingDiagnostics(aiDraftResult.diagnostics?.timings, {
            endToEndMs: Date.now() - draftBuildStartedAt,
            localScaffoldMs,
            aiRoundTripMs,
            mergeValidationMs,
          }),
          fallbackOutcome:
            "The visible route stayed local because the AI second pass found no materially better validated route.",
          normalizedSummary: dedupeStrings([
            ...translatedDraft.normalizedSummary,
            ...refinementEvaluation.reasons,
          ]),
        })
      );
      showOracleEvent(
        buildOracleAiRefinementEvent({
          currentTime,
          outcome: "no_change",
          target: "route",
        })
      );
      return;
    }

    const acceptedSession = {
      proposal: buildAcceptedDraftProposal(
        candidateDraftScheduleResponse,
        candidateDraftScheduleResponse.oracleAdvice
      ),
      requestPayload: draftPayload,
    } satisfies AcceptedAiDraftSession;

    setPendingDraftAiRefinementOffer({
      acceptedSession,
      candidateState,
      routeSignature: requestSignature,
      summaryLines: buildOracleDraftRefinementSummary({
        currentDraft: currentDraftScheduleResponse,
        evaluation: refinementEvaluation,
        refinedDraft: candidateDraftScheduleResponse,
      }),
    });
    setPlannerFlowDiagnostics(
      createPlannerFlowDiagnostics({
        flow: "draft",
        engine: "ai",
        model: aiDraftResult.diagnostics?.model,
        payloadBytes: aiDraftResult.diagnostics?.payloadBytes,
        ...getServerDiagnosticsMetadata(aiDraftResult.diagnostics),
        requestPreview:
          aiDraftResult.diagnostics?.requestPreview ?? draftPayload,
        rawResponse:
          aiDraftResult.diagnostics?.rawResponse ?? {
            refinementEvaluation,
            result: aiDraftResult.result,
          },
        schemaValidation:
          aiDraftResult.diagnostics?.schemaValidation ?? {
            passed: true,
            issues: [],
          },
        repairNotes: dedupeStrings([
          ...(aiDraftResult.diagnostics?.repairNotes ?? []),
          ...translatedDraft.repairNotes,
        ]),
        timings: extendTimingDiagnostics(aiDraftResult.diagnostics?.timings, {
          endToEndMs: Date.now() - draftBuildStartedAt,
          localScaffoldMs,
          aiRoundTripMs,
          mergeValidationMs,
        }),
        fallbackOutcome:
          "The visible route stayed local while Oracle held a different validated AI refinement for review.",
        normalizedSummary: dedupeStrings([
          ...translatedDraft.normalizedSummary,
          ...refinementEvaluation.reasons,
          "Oracle is holding the AI second pass as an explicit compare/apply refinement instead of replacing the visible route.",
        ]),
      })
    );
  showOracleEvent(
      buildOracleAiRefinementEvent({
        currentTime,
        outcome: "ready",
        target: "route",
      })
    );
  }

  async function continueDraftAiParseReview({
    context,
    currentTime,
    draftBuildStartedAt,
    localDraftArtifacts,
    localDraftPayload,
    parseContext,
    plannerForBuild,
    requestSignature,
    validation,
    workingState,
  }: {
    context: IntakeFlowContext;
    currentTime: string;
    draftBuildStartedAt: number;
    localDraftArtifacts: NonNullable<ReturnType<typeof buildDraftArtifacts>>;
    localDraftPayload: PlannerAiDraftPayload;
    parseContext: ReturnType<typeof buildPlannerAiParseContext>;
    plannerForBuild: MockPlannerState;
    requestSignature: string;
    validation: ReturnType<typeof validateDaySetupDraft>;
    workingState: PlannerStoreState;
  }) {
    const aiParseRoundTripStartedAt = Date.now();
    const aiParseResolution = await runInteractivePlannerAiRequest({
      canUseLocalNow: false,
      flow: "parse",
      message: "AI is taking longer than usual.",
      run: ({ signal }) =>
        requestPlannerAiParse(
          {
            flow: "parse",
            includeDiagnostics: SHOULD_REQUEST_AI_DIAGNOSTICS,
            strategy: parseContext.strategy,
            payload: parseContext.payload,
          },
          { signal }
        ),
      showSlowPrompt: false,
    });
    const aiRoundTripMs = Date.now() - aiParseRoundTripStartedAt;
    const currentDraftScheduleResponse = stateRef.current.draftScheduleResponse;

    if (
      !currentDraftScheduleResponse ||
      createDraftRouteSignature(currentDraftScheduleResponse) !== requestSignature
    ) {
      return;
    }

    const continueWithLocalDraftAiReview = () =>
      devEngineSettings.draft === "ai"
        ? continueDraftAiRefinement({
            currentTime,
            draftBuildStartedAt,
            draftPayload: localDraftPayload,
            draftSeedDayPlan: localDraftArtifacts.draftSeedDayPlan,
            localDraftState: localDraftArtifacts.localDraftState,
            localScaffold: localDraftArtifacts.localScaffold,
            localScaffoldMs: localDraftArtifacts.localScaffoldMs,
            parsedTaskResponse: localDraftArtifacts.parsedTaskResponse,
            plannerForDraftRoute: localDraftArtifacts.plannerForDraftRoute,
            requestSignature,
            validation,
            workingState,
          })
        : Promise.resolve();

    if (aiParseResolution.kind !== "ai") {
      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "parse",
          engine: "ai",
          requestPreview: parseContext.payload,
          rawResponse: parseContext.baselineResponse,
          schemaValidation: {
            passed: true,
            issues: [],
          },
          strategy: parseContext.strategy,
          fallbackOutcome:
            "The build used the visible local interpretation because the background AI parse did not finish in time.",
          normalizedSummary: [
            `Interpreted ${parseContext.baselineResponse.tasks.length} tasks locally before the background AI parse timed out.`,
            `Preserved ${parseContext.baselineResponse.hardEvents.length} inferred anchors locally.`,
          ],
          timings: extendTimingDiagnostics(undefined, {
            aiRoundTripMs,
            endToEndMs: Date.now() - draftBuildStartedAt,
            localScaffoldMs: localDraftArtifacts.localScaffoldMs,
          }),
        })
      );
      await continueWithLocalDraftAiReview();
      return;
    }

    const aiParseResult = aiParseResolution.response;

    if (!aiParseResult.ok) {
      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "parse",
          engine: "ai",
          model: aiParseResult.diagnostics?.model,
          payloadBytes: aiParseResult.diagnostics?.payloadBytes,
          ...getServerDiagnosticsMetadata(aiParseResult.diagnostics),
          requestPreview:
            aiParseResult.diagnostics?.requestPreview ?? parseContext.payload,
          rawResponse:
            aiParseResult.diagnostics?.rawResponse ?? parseContext.baselineResponse,
          schemaValidation:
            aiParseResult.diagnostics?.schemaValidation ?? {
              passed: false,
              issues: [aiParseResult.error],
            },
          repairNotes: aiParseResult.diagnostics?.repairNotes ?? [],
          strategy: aiParseResult.diagnostics?.strategy ?? parseContext.strategy,
          timings: extendTimingDiagnostics(aiParseResult.diagnostics?.timings, {
            aiRoundTripMs,
            endToEndMs: Date.now() - draftBuildStartedAt,
            localScaffoldMs: localDraftArtifacts.localScaffoldMs,
          }),
          fallbackOutcome:
            "The build used the visible local interpretation because the background AI parse failed.",
          normalizedSummary: [
            `Interpreted ${parseContext.baselineResponse.tasks.length} tasks locally before the AI parse failed.`,
            `Preserved ${parseContext.baselineResponse.hardEvents.length} inferred anchors locally.`,
          ],
          error: getPlannerAiFailureSummary("parse", aiParseResult.error),
        })
      );
      await continueWithLocalDraftAiReview();
      return;
    }

    const translatedParse = translateAiParseResponse({
      baselineResponse: parseContext.baselineResponse,
      response: aiParseResult.result,
    });

    setPlannerFlowDiagnostics(
      createPlannerFlowDiagnostics({
        flow: "parse",
        engine: "ai",
        model: aiParseResult.diagnostics?.model,
        payloadBytes: aiParseResult.diagnostics?.payloadBytes,
        ...getServerDiagnosticsMetadata(aiParseResult.diagnostics),
        requestPreview:
          aiParseResult.diagnostics?.requestPreview ?? parseContext.payload,
        rawResponse: aiParseResult.diagnostics?.rawResponse ?? aiParseResult.result,
        schemaValidation:
          aiParseResult.diagnostics?.schemaValidation ?? {
            passed: true,
            issues: [],
          },
        repairNotes: dedupeStrings([
          ...(aiParseResult.diagnostics?.repairNotes ?? []),
          ...translatedParse.repairNotes,
        ]),
        strategy: aiParseResult.diagnostics?.strategy ?? parseContext.strategy,
        timings: extendTimingDiagnostics(aiParseResult.diagnostics?.timings, {
          aiRoundTripMs,
          endToEndMs: Date.now() - draftBuildStartedAt,
          localScaffoldMs: localDraftArtifacts.localScaffoldMs,
        }),
        normalizedSummary: translatedParse.normalizedSummary,
      })
    );

    const aiParsedWorkingState = applyParsedTaskResponse(
      workingState,
      translatedParse.value,
      {
        errors: validation.errors,
        warnings: validation.warnings,
      }
    );
    const aiParsedDraftArtifacts = buildDraftArtifacts({
      context,
      plannerForBuild,
      workingState: aiParsedWorkingState,
    });

    if (!aiParsedDraftArtifacts) {
      return;
    }

    if (devEngineSettings.draft === "local") {
      if (!aiParsedDraftArtifacts.localDraftIsValid) {
        setPlannerFlowDiagnostics(
          createPlannerFlowDiagnostics({
            flow: "draft",
            engine: "ai",
            requestPreview: {
              parsePayload: parseContext.payload,
              rebuiltFromAiParse: true,
            },
            rawResponse: {
              aiParsedScaffold: aiParsedDraftArtifacts.localScaffold,
              parseResult: aiParseResult.result,
            },
            schemaValidation: {
              passed: false,
              issues: aiParsedDraftArtifacts.localDraftState.plannerWarnings,
            },
            normalizedSummary: [],
            timings: extendTimingDiagnostics(undefined, {
              aiRoundTripMs,
              endToEndMs: Date.now() - draftBuildStartedAt,
              localScaffoldMs:
                localDraftArtifacts.localScaffoldMs +
                aiParsedDraftArtifacts.localScaffoldMs,
            }),
            error:
              "The AI-reviewed interpretation did not produce a validated second-pass route.",
          })
        );
        return;
      }

      const candidateDraftScheduleResponse =
        aiParsedDraftArtifacts.localDraftState.draftScheduleResponse!;
      const refinementEvaluation = evaluateDraftAiRefinement({
        candidateCarryForwardItems: candidateDraftScheduleResponse.carryForwardItems,
        candidateDayPlan: candidateDraftScheduleResponse.dayPlan,
        candidateUnplacedTasks: candidateDraftScheduleResponse.unplacedTasks,
        currentCarryForwardItems: currentDraftScheduleResponse.carryForwardItems,
        currentDayPlan: currentDraftScheduleResponse.dayPlan,
        currentTime,
        currentUnplacedTasks: currentDraftScheduleResponse.unplacedTasks,
      });

      if (refinementEvaluation.outcome === "offer") {
        const acceptedSession = {
          proposal: buildAcceptedDraftProposal(
            candidateDraftScheduleResponse,
            candidateDraftScheduleResponse.oracleAdvice
          ),
          requestPayload: buildDraftPayloadFromParsedTasks({
            context,
            currentTime,
            draft: aiParsedWorkingState.intakeDraft,
            hardEvents: translatedParse.value.hardEvents,
            localScaffold: aiParsedDraftArtifacts.localScaffold,
            parsedTaskResponse: translatedParse.value,
          }),
        } satisfies AcceptedAiDraftSession;

        setPendingDraftAiRefinementOffer({
          acceptedSession,
          candidateState: aiParsedDraftArtifacts.localDraftState,
          routeSignature: requestSignature,
          summaryLines: buildOracleDraftRefinementSummary({
            currentDraft: currentDraftScheduleResponse,
            evaluation: refinementEvaluation,
            refinedDraft: candidateDraftScheduleResponse,
          }),
        });
        setPlannerFlowDiagnostics(
          createPlannerFlowDiagnostics({
            flow: "draft",
            engine: "ai",
            requestPreview: {
              parsePayload: parseContext.payload,
              rebuiltFromAiParse: true,
            },
            rawResponse: {
              parseResult: aiParseResult.result,
              refinementEvaluation,
            },
            schemaValidation: {
              passed: true,
              issues: [],
            },
            repairNotes: translatedParse.repairNotes,
            normalizedSummary: dedupeStrings([
              ...translatedParse.normalizedSummary,
              ...refinementEvaluation.reasons,
              "Oracle is holding the AI-reviewed interpretation as an explicit compare/apply refinement instead of replacing the visible route.",
            ]),
            fallbackOutcome:
              "The visible route stayed local while Oracle held a different validated route rebuilt from the AI-reviewed interpretation.",
            timings: extendTimingDiagnostics(undefined, {
              aiRoundTripMs,
              endToEndMs: Date.now() - draftBuildStartedAt,
              localScaffoldMs:
                localDraftArtifacts.localScaffoldMs +
                aiParsedDraftArtifacts.localScaffoldMs,
            }),
          })
        );
        showOracleEvent(
          buildOracleAiRefinementEvent({
            currentTime,
            outcome: "ready",
            target: "route",
          })
        );
        return;
      }

      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "draft",
          engine: "ai",
          requestPreview: {
            parsePayload: parseContext.payload,
            rebuiltFromAiParse: true,
          },
          rawResponse: {
            parseResult: aiParseResult.result,
            refinementEvaluation,
          },
          schemaValidation: {
            passed: true,
            issues: [],
          },
          repairNotes: translatedParse.repairNotes,
          normalizedSummary: dedupeStrings([
            ...translatedParse.normalizedSummary,
            ...refinementEvaluation.reasons,
          ]),
          fallbackOutcome:
            "The visible route stayed local because the AI-reviewed interpretation did not produce a materially better validated route.",
          timings: extendTimingDiagnostics(undefined, {
            aiRoundTripMs,
            endToEndMs: Date.now() - draftBuildStartedAt,
            localScaffoldMs:
              localDraftArtifacts.localScaffoldMs +
              aiParsedDraftArtifacts.localScaffoldMs,
          }),
        })
      );
      showOracleEvent(
        buildOracleAiRefinementEvent({
          currentTime,
          outcome: "no_change",
          target: "route",
        })
      );
      return;
    }

    const draftPayloadBase = buildDraftPayloadFromParsedTasks({
      context,
      currentTime,
      draft: aiParsedWorkingState.intakeDraft,
      hardEvents: translatedParse.value.hardEvents,
      localScaffold: aiParsedDraftArtifacts.localScaffold,
      parsedTaskResponse: translatedParse.value,
    });
    const reuseDraftContext = buildDraftAiReuseContext(
      acceptedAiDraftRef.current,
      draftPayloadBase
    );
    const draftPayload = buildDraftPayloadFromParsedTasks({
      context,
      currentTime,
      draft: aiParsedWorkingState.intakeDraft,
      hardEvents: translatedParse.value.hardEvents,
      localScaffold: aiParsedDraftArtifacts.localScaffold,
      parsedTaskResponse: translatedParse.value,
      previousAcceptedAiProposal: reuseDraftContext.previousAcceptedAiProposal,
      changedTaskIds: reuseDraftContext.changedTaskIds,
      taskDeltas: reuseDraftContext.taskDeltas,
    });

    await continueDraftAiRefinement({
      currentTime,
      draftBuildStartedAt,
      draftPayload,
      draftSeedDayPlan: aiParsedDraftArtifacts.draftSeedDayPlan,
      localDraftState: localDraftArtifacts.localDraftState,
      localScaffold: aiParsedDraftArtifacts.localScaffold,
      localScaffoldMs:
        localDraftArtifacts.localScaffoldMs + aiParsedDraftArtifacts.localScaffoldMs,
      parsedTaskResponse: translatedParse.value,
      plannerForDraftRoute: aiParsedDraftArtifacts.plannerForDraftRoute,
      requestSignature,
      validation,
      workingState: aiParsedWorkingState,
    });
  }

  async function continueReplanAiRefinement({
    currentTime,
    localScaffold,
    localScaffoldMs,
    replanPayload,
    replanStartedAt,
    requestSignature,
    validatedLocalPreview,
  }: {
    currentTime: string;
    localScaffold: ReturnType<typeof buildPlannerAiReplanLocalScaffold>;
    localScaffoldMs: number;
    replanPayload: PlannerAiReplanPayload;
    replanStartedAt: number;
    requestSignature: string;
    validatedLocalPreview: ReplanPreview;
  }) {
    const aiReplanRoundTripStartedAt = Date.now();
    const aiResolution = await runInteractivePlannerAiRequest({
      canUseLocalNow: false,
      flow: "replan",
      message: "AI is taking longer than usual.",
      run: ({ signal }) =>
        requestPlannerAiReplan(
          {
            flow: "replan",
            includeDiagnostics: SHOULD_REQUEST_AI_DIAGNOSTICS,
            payload: replanPayload,
          },
          { signal }
        ),
      showSlowPrompt: false,
    });
    const aiRoundTripMs = Date.now() - aiReplanRoundTripStartedAt;
    const currentPreview = replanPreviewRef.current;

    if (
      !currentPreview ||
      createReplanPreviewSignature(currentPreview) !== requestSignature
    ) {
      return;
    }

    if (aiResolution.kind !== "ai") {
      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "replan",
          engine: "ai",
          requestPreview: replanPayload,
          rawResponse: {
            localScaffold,
            visiblePreview: validatedLocalPreview,
          },
          schemaValidation: {
            passed: true,
            issues: [],
          },
          fallbackOutcome:
            "The visible local replan preview stayed in place because the background AI review did not finish in time.",
          normalizedSummary: validatedLocalPreview.summary.summaryLines,
          timings: extendTimingDiagnostics(undefined, {
            endToEndMs: Date.now() - replanStartedAt,
            localScaffoldMs,
            aiRoundTripMs,
          }),
        })
      );
      return;
    }

    const aiResult = aiResolution.response;

    if (!aiResult.ok) {
      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "replan",
          engine: "ai",
          model: aiResult.diagnostics?.model,
          payloadBytes: aiResult.diagnostics?.payloadBytes,
          ...getServerDiagnosticsMetadata(aiResult.diagnostics),
          requestPreview:
            aiResult.diagnostics?.requestPreview ?? replanPayload,
          rawResponse:
            aiResult.diagnostics?.rawResponse ??
            {
              localScaffold,
              visiblePreview: validatedLocalPreview,
            },
          schemaValidation:
            aiResult.diagnostics?.schemaValidation ?? {
              passed: false,
              issues: [aiResult.error],
            },
          repairNotes: aiResult.diagnostics?.repairNotes ?? [],
          timings: extendTimingDiagnostics(aiResult.diagnostics?.timings, {
            endToEndMs: Date.now() - replanStartedAt,
            localScaffoldMs,
            aiRoundTripMs,
          }),
          fallbackOutcome:
            "The visible local replan preview stayed in place because the background AI review failed.",
          normalizedSummary: validatedLocalPreview.summary.summaryLines,
          error: getPlannerAiFailureSummary("replan", aiResult.error),
        })
      );
      return;
    }

    const mergeValidationStartedAt = Date.now();
    const translated = translateAiReplanResponse({
      currentTime,
      dayPlan: plannerView.dayPlan,
      response: aiResult.result,
      replanMode: selectedReplanMode,
    });
    const validation = validateReplannedDayPlan({
      currentTime,
      nextDayPlan: translated.value.dayPlan,
      previousDayPlan: plannerView.dayPlan,
      allowProductiveBreaks:
        plannerView.dayPlan.breakMode === "productive" ||
        selectedReplanMode === "use_productive_breaks",
      carryForwardItems: translated.value.carryForwardItems,
      dueWarnings: translated.value.dueWarnings,
      unplacedTasks: translated.value.unplacedTasks,
    });
    const mergeValidationMs = Date.now() - mergeValidationStartedAt;

    if (!validation.isValid) {
      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "replan",
          engine: "ai",
          model: aiResult.diagnostics?.model,
          payloadBytes: aiResult.diagnostics?.payloadBytes,
          ...getServerDiagnosticsMetadata(aiResult.diagnostics),
          requestPreview:
            aiResult.diagnostics?.requestPreview ?? replanPayload,
          rawResponse: aiResult.diagnostics?.rawResponse ?? aiResult.result,
          schemaValidation:
            aiResult.diagnostics?.schemaValidation ?? {
              passed: true,
              issues: [],
            },
          repairNotes: dedupeStrings([
            ...(aiResult.diagnostics?.repairNotes ?? []),
            ...translated.repairNotes,
          ]),
          timings: extendTimingDiagnostics(aiResult.diagnostics?.timings, {
            endToEndMs: Date.now() - replanStartedAt,
            localScaffoldMs,
            aiRoundTripMs,
            mergeValidationMs,
          }),
          fallbackOutcome:
            "The visible local replan preview stayed in place because the AI second pass failed app-side validation.",
          normalizedSummary: translated.normalizedSummary,
          error: "AI replan proposal failed app-side validation and was not surfaced as an option.",
        })
      );
      return;
    }

    if (
      !replanPreviewRef.current ||
      createReplanPreviewSignature(replanPreviewRef.current) !== requestSignature
    ) {
      return;
    }

    const refinementEvaluation = evaluateReplanAiRefinement({
      candidateCarryForwardItems: translated.value.carryForwardItems,
      candidateDayPlan: translated.value.dayPlan,
      candidateUnplacedTasks: translated.value.unplacedTasks,
      currentCarryForwardItems: validatedLocalPreview.carryForwardItems,
      currentDayPlan: validatedLocalPreview.dayPlan,
      currentTime,
      currentUnplacedTasks: validatedLocalPreview.unplacedTasks,
    });

    if (refinementEvaluation.outcome === "no_change") {
      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "replan",
          engine: "ai",
          model: aiResult.diagnostics?.model,
          payloadBytes: aiResult.diagnostics?.payloadBytes,
          ...getServerDiagnosticsMetadata(aiResult.diagnostics),
          requestPreview:
            aiResult.diagnostics?.requestPreview ?? replanPayload,
          rawResponse: aiResult.diagnostics?.rawResponse ?? {
            refinementEvaluation,
            result: aiResult.result,
          },
          schemaValidation:
            aiResult.diagnostics?.schemaValidation ?? {
              passed: true,
              issues: [],
            },
            repairNotes: dedupeStrings([
            ...(aiResult.diagnostics?.repairNotes ?? []),
            ...translated.repairNotes,
          ]),
          timings: extendTimingDiagnostics(aiResult.diagnostics?.timings, {
            endToEndMs: Date.now() - replanStartedAt,
            localScaffoldMs,
            aiRoundTripMs,
            mergeValidationMs,
          }),
          fallbackOutcome:
            "The visible local replan preview stayed in place because the AI second pass found no materially better validated remainder.",
          normalizedSummary: dedupeStrings([
            ...translated.normalizedSummary,
            ...refinementEvaluation.reasons,
          ]),
        })
      );
      showOracleEvent(
        buildOracleAiRefinementEvent({
          currentTime,
          outcome: "no_change",
          target: "remainder",
        }),
        { keepPanelPreference: true }
      );
      return;
    }

    const acceptedSession = {
      proposal: buildAcceptedReplanProposal(translated.value, currentTime),
      requestPayload: replanPayload,
    } satisfies AcceptedAiReplanSession;

    setPendingReplanAiRefinementOffer({
      acceptedSession,
      preview: translated.value,
      previewSignature: requestSignature,
      summaryLines: buildOracleReplanRefinementSummary({
        currentPreview: validatedLocalPreview,
        evaluation: refinementEvaluation,
        refinedPreview: translated.value,
      }),
    });
    setPlannerFlowDiagnostics(
      createPlannerFlowDiagnostics({
        flow: "replan",
        engine: "ai",
        model: aiResult.diagnostics?.model,
        payloadBytes: aiResult.diagnostics?.payloadBytes,
        ...getServerDiagnosticsMetadata(aiResult.diagnostics),
        requestPreview:
          aiResult.diagnostics?.requestPreview ?? replanPayload,
        rawResponse: aiResult.diagnostics?.rawResponse ?? {
          refinementEvaluation,
          result: aiResult.result,
        },
        schemaValidation:
          aiResult.diagnostics?.schemaValidation ?? {
            passed: true,
            issues: [],
          },
        repairNotes: dedupeStrings([
          ...(aiResult.diagnostics?.repairNotes ?? []),
          ...translated.repairNotes,
        ]),
        timings: extendTimingDiagnostics(aiResult.diagnostics?.timings, {
          endToEndMs: Date.now() - replanStartedAt,
          localScaffoldMs,
          aiRoundTripMs,
          mergeValidationMs,
        }),
        fallbackOutcome:
          "The visible local replan preview stayed in place while Oracle held a different validated AI remainder for review.",
        normalizedSummary: dedupeStrings([
          ...translated.value.summary.summaryLines,
          ...refinementEvaluation.reasons,
          "Oracle is holding the AI second pass as an explicit compare/apply remainder option instead of replacing the visible preview.",
        ]),
      })
    );
  }

  function handleApplyDraftAiRefinementOffer() {
    const refinementOffer = pendingDraftAiRefinementOffer;
    const currentDraftScheduleResponse = stateRef.current.draftScheduleResponse;

    if (
      !refinementOffer ||
      !currentDraftScheduleResponse ||
      createDraftRouteSignature(currentDraftScheduleResponse) !==
        refinementOffer.routeSignature
    ) {
      setPendingDraftAiRefinementOffer(null);
      return;
    }

    pulseRouteUpdating();
    acceptedAiDraftRef.current = refinementOffer.acceptedSession;
    acceptedAiReplanRef.current = null;
    setPendingDraftAiRefinementOffer(null);
    setState(refinementOffer.candidateState);
    requestTimelineViewport("build");
    showOracleEvent(
      buildOracleAiRefinementEvent({
        currentTime: plannerRuntime.currentTime,
        outcome: "applied",
        target: "route",
      })
    );
  }

  function handleDismissDraftAiRefinementOffer() {
    setPendingDraftAiRefinementOffer(null);
  }

  function handleApplyReplanAiRefinementOffer() {
    const refinementOffer = pendingReplanAiRefinementOffer;
    const currentPreview = replanPreviewRef.current;

    if (
      !refinementOffer ||
      !currentPreview ||
      createReplanPreviewSignature(currentPreview) !==
        refinementOffer.previewSignature
    ) {
      setPendingReplanAiRefinementOffer(null);
      return;
    }

    acceptedAiReplanRef.current = refinementOffer.acceptedSession;
    setPendingReplanAiRefinementOffer(null);
    setReplanErrors([]);
    setReplanPreview(refinementOffer.preview);
    showOracleEvent(
      buildOracleAiRefinementEvent({
        currentTime: plannerRuntime.currentTime,
        outcome: "applied",
        target: "remainder",
      }),
      { keepPanelPreference: true }
    );
  }

  function handleDismissReplanAiRefinementOffer() {
    setPendingReplanAiRefinementOffer(null);
  }

  async function runDraftBuild({
    sourceState,
    plannerForBuild,
    context,
    failureStateOnDraftFailure,
  }: {
    sourceState: PlannerStoreState;
    plannerForBuild: MockPlannerState;
    context: typeof plannerContext;
    failureStateOnDraftFailure: PlannerStoreState;
  }) {
    const draftBuildStartedAt = Date.now();
    const validation = validateDaySetupDraft(sourceState.intakeDraft, context);

    if (hasBlockingErrors(validation.errors)) {
      setState({
        ...failureStateOnDraftFailure,
        errors: validation.errors,
        warnings: validation.warnings,
      });
      return;
    }

    const shouldRunBackgroundParseReview =
      !sourceState.parsedTaskResponse &&
      devEngineSettings.interpretation === "ai";
    const usesAiDuringBuild =
      devEngineSettings.draft === "ai" || shouldRunBackgroundParseReview;

    if (usesAiDuringBuild) {
      setRouteUpdatingIndicator(true);
    } else {
      pulseRouteUpdating();
    }

    try {
      let workingState = sourceState;
      let parseContext: ReturnType<typeof buildPlannerAiParseContext> | null = null;

      if (!workingState.parsedTaskResponse) {
        parseContext = buildPlannerAiParseContext({
          draft: workingState.intakeDraft,
          context,
          hasBlockingErrors: false,
        });
        workingState = applyParsedTaskResponse(
          workingState,
          parseContext.baselineResponse,
          {
            errors: validation.errors,
            warnings: validation.warnings,
          }
        );

        if (devEngineSettings.interpretation === "local") {
          setPlannerFlowDiagnostics(
            createPlannerFlowDiagnostics({
              flow: "parse",
              engine: "local",
              strategy: parseContext.strategy,
              requestPreview: parseContext.payload,
              rawResponse: workingState.parsedTaskResponse,
              schemaValidation: {
                passed: true,
                issues: [],
              },
              normalizedSummary: workingState.parsedTaskResponse
                ? [
                    `Interpreted ${workingState.parsedTaskResponse.tasks.length} tasks locally.`,
                    `Preserved ${workingState.parsedTaskResponse.hardEvents.length} inferred anchors locally.`,
                  ]
                : ["Local interpretation did not return a parsed task response."],
            })
          );
        } else {
          setPlannerFlowDiagnostics(
            createPlannerFlowDiagnostics({
              flow: "parse",
              engine: "ai",
              strategy: parseContext.strategy,
              requestPreview: parseContext.payload,
              rawResponse: parseContext.baselineResponse,
              schemaValidation: {
                passed: true,
                issues: [],
              },
              normalizedSummary: [
                `Interpreted ${parseContext.baselineResponse.tasks.length} tasks locally so the route could build immediately.`,
                `Preserved ${parseContext.baselineResponse.hardEvents.length} inferred anchors locally while AI reviews the interpretation in the background.`,
              ],
            })
          );
        }
      }

      let draftArtifacts = buildDraftArtifacts({
        context,
        plannerForBuild,
        workingState,
      });

      if (!draftArtifacts) {
        setState(
          buildPlannerFailureState({
            baseState: failureStateOnDraftFailure,
            plannerWarning:
              "Draft generation could not start because no interpreted task set was available.",
            validation,
          })
        );
        return;
      }

      if (
        !draftArtifacts.localDraftIsValid &&
        parseContext &&
        devEngineSettings.interpretation === "ai"
      ) {
        const aiParseRoundTripStartedAt = Date.now();
        const aiParseResolution = await runInteractivePlannerAiRequest({
          canUseLocalNow: false,
          flow: "parse",
          message: "AI is taking longer than usual.",
          run: ({ signal }) =>
            requestPlannerAiParse(
              {
                flow: "parse",
                includeDiagnostics: SHOULD_REQUEST_AI_DIAGNOSTICS,
                strategy: parseContext.strategy,
                payload: parseContext.payload,
              },
              { signal }
            ),
        });
        const aiRoundTripMs = Date.now() - aiParseRoundTripStartedAt;

        if (aiParseResolution.kind === "ai" && aiParseResolution.response.ok) {
          const translatedParse = translateAiParseResponse({
            baselineResponse: parseContext.baselineResponse,
            response: aiParseResolution.response.result,
          });

          setPlannerFlowDiagnostics(
            createPlannerFlowDiagnostics({
              flow: "parse",
              engine: "ai",
              model: aiParseResolution.response.diagnostics?.model,
              payloadBytes: aiParseResolution.response.diagnostics?.payloadBytes,
              ...getServerDiagnosticsMetadata(
                aiParseResolution.response.diagnostics
              ),
              requestPreview:
                aiParseResolution.response.diagnostics?.requestPreview ??
                parseContext.payload,
              rawResponse:
                aiParseResolution.response.diagnostics?.rawResponse ??
                aiParseResolution.response.result,
              schemaValidation:
                aiParseResolution.response.diagnostics?.schemaValidation ?? {
                  passed: true,
                  issues: [],
                },
              repairNotes: dedupeStrings([
                ...(aiParseResolution.response.diagnostics?.repairNotes ?? []),
                ...translatedParse.repairNotes,
              ]),
              strategy:
                aiParseResolution.response.diagnostics?.strategy ??
                parseContext.strategy,
              timings: extendTimingDiagnostics(
                aiParseResolution.response.diagnostics?.timings,
                {
                  aiRoundTripMs,
                  endToEndMs: Date.now() - draftBuildStartedAt,
                }
              ),
              normalizedSummary: translatedParse.normalizedSummary,
            })
          );

          workingState = applyParsedTaskResponse(
            workingState,
            translatedParse.value,
            {
              errors: validation.errors,
              warnings: validation.warnings,
            }
          );
          draftArtifacts = buildDraftArtifacts({
            context,
            plannerForBuild,
            workingState,
          });
        }
      }

      if (!draftArtifacts) {
        setState(
          buildPlannerFailureState({
            baseState: failureStateOnDraftFailure,
            plannerWarning:
              "Draft generation could not start because no interpreted task set was available.",
            validation,
          })
        );
        return;
      }

      const {
        draftSeedDayPlan,
        localDraftIsValid,
        localDraftState,
        localScaffold,
        localScaffoldMs,
        parsedTaskResponse,
        plannerForDraftRoute,
      } = draftArtifacts;
      const draftPayloadBase = buildDraftPayloadFromParsedTasks({
        currentTime: plannerForBuild.currentTime,
        draft: workingState.intakeDraft,
        hardEvents: parsedTaskResponse.hardEvents,
        localScaffold,
        parsedTaskResponse,
        context,
      });
      const reuseDraftContext = buildDraftAiReuseContext(
        acceptedAiDraftRef.current,
        draftPayloadBase
      );
      const draftPayload = buildDraftPayloadFromParsedTasks({
        currentTime: plannerForBuild.currentTime,
        draft: workingState.intakeDraft,
        hardEvents: parsedTaskResponse.hardEvents,
        localScaffold,
        parsedTaskResponse,
        previousAcceptedAiProposal: reuseDraftContext.previousAcceptedAiProposal,
        changedTaskIds: reuseDraftContext.changedTaskIds,
        taskDeltas: reuseDraftContext.taskDeltas,
        context,
      });

      if (devEngineSettings.draft === "local") {
        const nextState = localDraftState;
        const endToEndMs = Date.now() - draftBuildStartedAt;
        const buildEventKind =
          workingState.stage === "draft_route" && workingState.draftScheduleResponse
            ? "manual_edit_applied"
            : "plan_built";

        setPlannerFlowDiagnostics(
          createPlannerFlowDiagnostics({
            flow: "draft",
            engine: "local",
            requestPreview: draftPayload,
            rawResponse: {
              localScaffold,
              draftScheduleResponse: nextState.draftScheduleResponse,
            },
            schemaValidation: {
              passed: Boolean(nextState.draftScheduleResponse),
              issues:
                nextState.stage === "draft_route"
                  ? []
                  : nextState.plannerWarnings,
            },
            normalizedSummary: nextState.draftScheduleResponse
              ? [
                  `Built ${nextState.draftScheduleResponse.dayPlan.blocks.length} canonical blocks locally.`,
                  `Tracked ${nextState.draftScheduleResponse.carryForwardItems.length} carry-forward items locally.`,
                ]
              : [],
            timings: extendTimingDiagnostics(undefined, {
              endToEndMs,
              localScaffoldMs,
              mergeValidationMs: Math.max(endToEndMs - localScaffoldMs, 0),
            }),
            error: localDraftIsValid
              ? undefined
              : "Local draft generation did not produce a valid route.",
          })
        );

        acceptedAiReplanRef.current = null;
        if (localDraftIsValid) {
          acceptedAiDraftRef.current = null;
        }

        setState(
          localDraftIsValid || failureStateOnDraftFailure === workingState
            ? nextState
            : buildPlannerFailureState({
                baseState: failureStateOnDraftFailure,
                plannerWarning:
                  "Local draft generation did not produce a valid route.",
                validation,
              })
        );

        if (localDraftIsValid) {
          requestTimelineViewport("build");
          showOracleEvent(
            buildOracleBuildEvent({
              currentTime: plannerForBuild.currentTime,
              kind: buildEventKind,
              nextDayPlan: nextState.draftScheduleResponse!.dayPlan,
              previousDayPlan: workingState.draftScheduleResponse?.dayPlan ?? null,
              routeCarryForwardItems: nextState.draftScheduleResponse!.carryForwardItems,
              routeUnplacedTasks: nextState.draftScheduleResponse!.unplacedTasks,
            })
          );

          if (parseContext && devEngineSettings.interpretation === "ai") {
            void continueDraftAiParseReview({
              context,
              currentTime: plannerForBuild.currentTime,
              draftBuildStartedAt,
              localDraftArtifacts: draftArtifacts,
              localDraftPayload: draftPayload,
              parseContext,
              plannerForBuild,
              requestSignature: createDraftRouteSignature(
                nextState.draftScheduleResponse!
              ),
              validation,
              workingState,
            });
          }
        }

        return;
      }
      if (localDraftIsValid) {
        const nextState = localDraftState;
        const buildEventKind =
          workingState.stage === "draft_route" && workingState.draftScheduleResponse
            ? "manual_edit_applied"
            : "plan_built";
        const routeSignature = createDraftRouteSignature(
          nextState.draftScheduleResponse!
        );

        acceptedAiDraftRef.current = null;
        acceptedAiReplanRef.current = null;
        setPendingDraftAiRefinementOffer(null);
        setPendingReplanAiRefinementOffer(null);
        setPlannerFlowDiagnostics(
          createPlannerFlowDiagnostics({
            flow: "draft",
            engine: "ai",
            requestPreview: draftPayload,
            rawResponse: {
              localScaffold,
              draftScheduleResponse: nextState.draftScheduleResponse,
            },
            schemaValidation: {
              passed: true,
              issues: [],
            },
            normalizedSummary: [
              `Built ${nextState.draftScheduleResponse!.dayPlan.blocks.length} canonical blocks locally.`,
              "The route is already usable while AI reviews it for a possible second-pass improvement.",
            ],
            timings: extendTimingDiagnostics(undefined, {
              endToEndMs: Date.now() - draftBuildStartedAt,
              localScaffoldMs,
              mergeValidationMs: Math.max(
                Date.now() - draftBuildStartedAt - localScaffoldMs,
                0
              ),
            }),
          })
        );
        requestTimelineViewport("build");
        setState(nextState);
        showOracleEvent(
          buildOracleBuildEvent({
            currentTime: plannerForBuild.currentTime,
            kind: buildEventKind,
            nextDayPlan: nextState.draftScheduleResponse!.dayPlan,
            previousDayPlan: workingState.draftScheduleResponse?.dayPlan ?? null,
            routeCarryForwardItems: nextState.draftScheduleResponse!.carryForwardItems,
              routeUnplacedTasks: nextState.draftScheduleResponse!.unplacedTasks,
            })
          );

        if (parseContext && devEngineSettings.interpretation === "ai") {
          void continueDraftAiParseReview({
            context,
            currentTime: plannerForBuild.currentTime,
            draftBuildStartedAt,
            localDraftArtifacts: draftArtifacts,
            localDraftPayload: draftPayload,
            parseContext,
            plannerForBuild,
            requestSignature: routeSignature,
            validation,
            workingState,
          });
        } else {
          void continueDraftAiRefinement({
            currentTime: plannerForBuild.currentTime,
            draftBuildStartedAt,
            draftPayload,
            draftSeedDayPlan,
            localDraftState,
            localScaffold,
            localScaffoldMs,
            parsedTaskResponse,
            plannerForDraftRoute,
            requestSignature: routeSignature,
            validation,
            workingState,
          });
        }
        return;
      }

      const aiDraftRoundTripStartedAt = Date.now();
      const aiDraftResolution = await runInteractivePlannerAiRequest({
        canUseLocalNow: false,
        flow: "draft",
        message: "AI is taking longer than usual.",
        run: ({ signal }) =>
          requestPlannerAiDraft(
            {
              flow: "draft",
              includeDiagnostics: SHOULD_REQUEST_AI_DIAGNOSTICS,
              payload: draftPayload,
            },
            { signal }
          ),
      });
      const aiRoundTripMs = Date.now() - aiDraftRoundTripStartedAt;

      if (aiDraftResolution.kind !== "ai") {
        const fallbackOutcome =
          "AI draft scheduling took too long, and no validated local fallback was available, so interpreted tasks were preserved.";

        setPlannerFlowDiagnostics(
          createPlannerFlowDiagnostics({
            flow: "draft",
            engine: "ai",
            requestPreview: draftPayload,
            rawResponse: {
              localScaffold,
              fallbackDraftScheduleResponse: null,
            },
            schemaValidation: {
              passed: false,
              issues: ["Validated local draft fallback was unavailable."],
            },
            fallbackOutcome,
            normalizedSummary: [],
            timings: extendTimingDiagnostics(undefined, {
              endToEndMs: Date.now() - draftBuildStartedAt,
              localScaffoldMs,
              aiRoundTripMs,
            }),
          })
        );
        setState(
          buildPlannerFailureState({
            baseState: failureStateOnDraftFailure,
            plannerWarning: fallbackOutcome,
            validation,
          })
        );
        return;
      }

      const aiDraftResult = aiDraftResolution.response;

      if (!aiDraftResult.ok) {
        const errorSummary = getPlannerAiFailureSummary(
          "draft",
          aiDraftResult.error
        );

        setPlannerFlowDiagnostics(
          createPlannerFlowDiagnostics({
            flow: "draft",
            engine: "ai",
            model: aiDraftResult.diagnostics?.model,
            payloadBytes: aiDraftResult.diagnostics?.payloadBytes,
            ...getServerDiagnosticsMetadata(aiDraftResult.diagnostics),
            requestPreview:
              aiDraftResult.diagnostics?.requestPreview ?? draftPayload,
            rawResponse: aiDraftResult.diagnostics?.rawResponse ?? null,
            schemaValidation:
              aiDraftResult.diagnostics?.schemaValidation ?? {
                passed: false,
                issues: [aiDraftResult.error],
              },
            repairNotes: aiDraftResult.diagnostics?.repairNotes ?? [],
            timings: extendTimingDiagnostics(aiDraftResult.diagnostics?.timings, {
              endToEndMs: Date.now() - draftBuildStartedAt,
              localScaffoldMs,
              aiRoundTripMs,
            }),
            normalizedSummary: [],
            error: errorSummary,
          })
        );
        setState(
          buildPlannerFailureState({
            baseState: failureStateOnDraftFailure,
            plannerWarning: errorSummary,
            validation,
          })
        );
        return;
      }

      const mergeValidationStartedAt = Date.now();
      const translatedDraft = translateAiDraftResponse({
        currentTime: plannerForBuild.currentTime,
        dayPlan: draftSeedDayPlan,
        hardEvents: parsedTaskResponse.hardEvents,
        rawText: getActivePlannerInputText(workingState.intakeDraft),
        response: aiDraftResult.result,
      });
      const nextState = applyDraftScheduleResult({
        state: workingState,
        planner: plannerForDraftRoute,
        draftScheduleResponse: translatedDraft.value,
        parsedTaskResponse: {
          ...parsedTaskResponse,
          tasks: translatedDraft.value.dayPlan.tasks,
          hardEvents: translatedDraft.value.dayPlan.hardEvents,
          warnings: parsedTaskResponse.warnings,
        },
        errors: validation.errors,
        warnings: validation.warnings,
      });
      const mergeValidationMs = Date.now() - mergeValidationStartedAt;
      const didApply =
        Boolean(nextState.draftScheduleResponse) &&
        nextState.draftScheduleResponse !== workingState.draftScheduleResponse;

      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "draft",
          engine: "ai",
          model: aiDraftResult.diagnostics?.model,
          payloadBytes: aiDraftResult.diagnostics?.payloadBytes,
          ...getServerDiagnosticsMetadata(aiDraftResult.diagnostics),
          requestPreview:
            aiDraftResult.diagnostics?.requestPreview ?? draftPayload,
          rawResponse:
            aiDraftResult.diagnostics?.rawResponse ?? aiDraftResult.result,
          schemaValidation:
            aiDraftResult.diagnostics?.schemaValidation ?? {
              passed: true,
              issues: [],
            },
          repairNotes: dedupeStrings([
            ...(aiDraftResult.diagnostics?.repairNotes ?? []),
            ...translatedDraft.repairNotes,
          ]),
          timings: extendTimingDiagnostics(aiDraftResult.diagnostics?.timings, {
            endToEndMs: Date.now() - draftBuildStartedAt,
            localScaffoldMs,
            aiRoundTripMs,
            mergeValidationMs,
          }),
          normalizedSummary: translatedDraft.normalizedSummary,
          error: didApply
            ? undefined
            : "AI draft proposal failed app-side validation, so the interpreted tasks were preserved and no route was applied.",
        })
      );

      if (!didApply) {
        setState(
          buildPlannerFailureState({
            baseState: failureStateOnDraftFailure,
            plannerWarning:
              "AI draft proposal failed app-side validation, so the interpreted tasks were preserved and no route was applied.",
            validation,
          })
        );
        return;
      }

      acceptedAiDraftRef.current = {
        proposal: buildAcceptedDraftProposal(
          translatedDraft.value,
          translatedDraft.value.oracleAdvice
        ),
        requestPayload: draftPayload,
      };
      acceptedAiReplanRef.current = null;
      requestTimelineViewport("build");
      setState(nextState);
      showOracleEvent(
        buildOracleBuildEvent({
          currentTime: plannerForBuild.currentTime,
          kind:
            workingState.stage === "draft_route" && workingState.draftScheduleResponse
              ? "manual_edit_applied"
              : "plan_built",
          nextDayPlan: nextState.draftScheduleResponse!.dayPlan,
          previousDayPlan: workingState.draftScheduleResponse?.dayPlan ?? null,
          routeCarryForwardItems: nextState.draftScheduleResponse!.carryForwardItems,
          routeUnplacedTasks: nextState.draftScheduleResponse!.unplacedTasks,
        })
      );
    } finally {
      if (usesAiDuringBuild) {
        setRouteUpdatingIndicator(false);
      }
    }
  }

  async function handleInterpret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearReplanUi();
    const validation = validateDaySetupDraft(state.intakeDraft, plannerContext);

    if (hasBlockingErrors(validation.errors)) {
      setState((previousState) => ({
        ...previousState,
        errors: validation.errors,
        warnings: validation.warnings,
      }));
      return;
    }

    if (state.intakeDraft.inputMode === "csv") {
      const importResult = parsePlannerCsvImport({
        csvText: state.intakeDraft.csvText,
        date: plannerContext.date,
        offset: plannerContext.offset,
      });

      setCsvImportReport(importResult);

      if (
        importResult.parsedTaskResponse.tasks.length === 0 &&
        importResult.parsedTaskResponse.hardEvents.length === 0
      ) {
        return;
      }

      if (shouldConfirmCsvImportReplacement(state)) {
        setPendingCsvImport(importResult);
        return;
      }

      applyCsvImportResult(importResult);
      return;
    }

    const parseContext = buildPlannerAiParseContext({
      draft: state.intakeDraft,
      context: plannerContext,
      hasBlockingErrors: false,
    });

    if (devEngineSettings.interpretation === "local") {
      const nextState = interpretPlannerDraft(state, plannerContext);

      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "parse",
          engine: "local",
          strategy: parseContext.strategy,
          requestPreview: parseContext.payload,
          rawResponse: nextState.parsedTaskResponse,
          schemaValidation: {
            passed: true,
            issues: [],
          },
          normalizedSummary: nextState.parsedTaskResponse
            ? [
                `Interpreted ${nextState.parsedTaskResponse.tasks.length} tasks locally.`,
                `Preserved ${nextState.parsedTaskResponse.hardEvents.length} inferred anchors locally.`,
              ]
            : ["Local interpretation did not return a parsed task response."],
        })
      );
      setState(nextState);
      return;
    }

    setRouteUpdatingIndicator(true);

    const aiResolution = await runInteractivePlannerAiRequest({
      canUseLocalNow: true,
      flow: "parse",
      message: "AI is taking longer than usual.",
      run: ({ signal }) =>
        requestPlannerAiParse(
          {
            flow: "parse",
            includeDiagnostics: SHOULD_REQUEST_AI_DIAGNOSTICS,
            strategy: parseContext.strategy,
            payload: parseContext.payload,
          },
          { signal }
        ),
    });

    if (aiResolution.kind !== "ai") {
      const fallbackOutcome =
        aiResolution.kind === "use_local_now"
          ? "Used the local interpretation while the AI request was still running."
          : "AI interpretation took too long, so the local interpretation was used.";
      const nextState = applyParsedTaskResponse(
        state,
        parseContext.baselineResponse,
        {
          errors: validation.errors,
          warnings: validation.warnings,
        }
      );

      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "parse",
          engine: "ai",
          requestPreview: parseContext.payload,
          rawResponse: parseContext.baselineResponse,
          schemaValidation: {
            passed: true,
            issues: [],
          },
          strategy: parseContext.strategy,
          fallbackOutcome,
          normalizedSummary: [
            `Interpreted ${parseContext.baselineResponse.tasks.length} tasks locally after the AI request was interrupted.`,
            `Preserved ${parseContext.baselineResponse.hardEvents.length} inferred anchors locally.`,
          ],
        })
      );
      setState({
        ...nextState,
        plannerWarnings: dedupeStrings([
          ...nextState.plannerWarnings,
          fallbackOutcome,
        ]),
      });
      setRouteUpdatingIndicator(false);
      return;
    }

    const aiResult = aiResolution.response;

    if (!aiResult.ok && aiResult.aborted) {
      const fallbackOutcome =
        "AI interpretation timed out upstream, so the local interpretation was used.";
      const nextState = applyParsedTaskResponse(
        state,
        parseContext.baselineResponse,
        {
          errors: validation.errors,
          warnings: validation.warnings,
        }
      );

      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "parse",
          engine: "ai",
          model: aiResult.diagnostics?.model,
          payloadBytes: aiResult.diagnostics?.payloadBytes,
          ...getServerDiagnosticsMetadata(aiResult.diagnostics),
          requestPreview:
            aiResult.diagnostics?.requestPreview ?? parseContext.payload,
          rawResponse:
            aiResult.diagnostics?.rawResponse ?? parseContext.baselineResponse,
          schemaValidation:
            aiResult.diagnostics?.schemaValidation ?? {
              passed: true,
              issues: [],
            },
          repairNotes: aiResult.diagnostics?.repairNotes ?? [],
          strategy: aiResult.diagnostics?.strategy ?? parseContext.strategy,
          timings: aiResult.diagnostics?.timings,
          fallbackOutcome,
          normalizedSummary: [
            `Interpreted ${parseContext.baselineResponse.tasks.length} tasks locally after the AI request timed out.`,
            `Preserved ${parseContext.baselineResponse.hardEvents.length} inferred anchors locally.`,
          ],
        })
      );
      setState({
        ...nextState,
        plannerWarnings: dedupeStrings([
          ...nextState.plannerWarnings,
          fallbackOutcome,
        ]),
      });
      setRouteUpdatingIndicator(false);
      return;
    }

    if (!aiResult.ok) {
      const errorSummary = getPlannerAiFailureSummary("parse", aiResult.error);

      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "parse",
          engine: "ai",
          model: aiResult.diagnostics?.model,
          payloadBytes: aiResult.diagnostics?.payloadBytes,
          ...getServerDiagnosticsMetadata(aiResult.diagnostics),
          requestPreview:
            aiResult.diagnostics?.requestPreview ?? parseContext.payload,
          rawResponse: aiResult.diagnostics?.rawResponse ?? null,
          schemaValidation:
            aiResult.diagnostics?.schemaValidation ?? {
              passed: false,
              issues: [aiResult.error],
            },
          repairNotes: aiResult.diagnostics?.repairNotes ?? [],
          strategy: aiResult.diagnostics?.strategy ?? parseContext.strategy,
          timings: aiResult.diagnostics?.timings,
          normalizedSummary: [],
          error: errorSummary,
        })
      );
      setState((previousState) => ({
        ...previousState,
        errors: validation.errors,
        warnings: validation.warnings,
        plannerWarnings: dedupeStrings([
          ...previousState.plannerWarnings,
          errorSummary,
        ]),
      }));
      setRouteUpdatingIndicator(false);
      return;
    }

    const translated = translateAiParseResponse({
      baselineResponse: parseContext.baselineResponse,
      response: aiResult.result,
    });

    setPlannerFlowDiagnostics(
      createPlannerFlowDiagnostics({
        flow: "parse",
        engine: "ai",
        model: aiResult.diagnostics?.model,
        payloadBytes: aiResult.diagnostics?.payloadBytes,
        ...getServerDiagnosticsMetadata(aiResult.diagnostics),
        requestPreview:
          aiResult.diagnostics?.requestPreview ?? parseContext.payload,
        rawResponse: aiResult.diagnostics?.rawResponse ?? aiResult.result,
        schemaValidation:
          aiResult.diagnostics?.schemaValidation ?? {
            passed: true,
            issues: [],
          },
        repairNotes: dedupeStrings([
          ...(aiResult.diagnostics?.repairNotes ?? []),
          ...translated.repairNotes,
        ]),
        strategy: aiResult.diagnostics?.strategy ?? parseContext.strategy,
        timings: aiResult.diagnostics?.timings,
        normalizedSummary: translated.normalizedSummary,
      })
    );
    startTransition(() => {
      setState((previousState) =>
        applyParsedTaskResponse(previousState, translated.value, {
          errors: validation.errors,
          warnings: validation.warnings,
        })
      );
    });
    setRouteUpdatingIndicator(false);
  }

  function getScenarioCurrentTime(scenario: PlannerDevScenario) {
    const scenarioDate = scenario.date ?? planner.dayPlan.date;
    const scenarioBaseTime = replaceIsoDatePreservingTime(
      planner.currentTime,
      scenarioDate
    );

    return scenario.currentTime
      ? replaceIsoTimePreservingDate(scenarioBaseTime, scenario.currentTime)
      : scenarioBaseTime;
  }

  async function handleLoadScenario(
    scenarioId: string,
    buildAfterLoad: boolean
  ) {
    const scenario = plannerDevScenarios.find((entry) => entry.id === scenarioId);

    if (!scenario) {
      return;
    }

    clearEphemeralUiState();
    clearAcceptedAiSessions();
    resetSelectedReplanMode();

    const nextPlannerRuntime = createRuntimePlanner(
      planner,
      getScenarioCurrentTime(scenario),
      scenario.date ?? planner.dayPlan.date
    );
    const nextContext = getPlannerStoreContext(nextPlannerRuntime);
    const loadedState = loadPlannerDevScenario(state, nextContext, scenario);

    setSelectedScenarioId(scenario.id);
    setPlannerTimeMode("manual");
    setAiDiagnostics({});
    setCarryForwardInbox(scenario.seedCarryForwardItems ?? loadCarryForwardInbox());
    setPlannerRuntime(nextPlannerRuntime);
    setState(loadedState);

    if (!buildAfterLoad) {
      return;
    }

    await runDraftBuild({
      sourceState: loadedState,
      plannerForBuild: nextPlannerRuntime,
      context: nextContext,
      failureStateOnDraftFailure: loadedState,
    });
  }

  function handleStartTodayFromWelcome() {
    handleResetBlankDay({ timeMode: "live" });
    setEntryView("planner");
  }

  function handleResumeFromWelcome() {
    setEntryView("planner");
    requestTimelineViewport("time");
  }

  function handleSampleDayFromWelcome() {
    setEntryView("sample_preview");
  }

  async function handleSampleDayFromPreview() {
    setEntryView("planner");
    await handleLoadScenario(
      samplePersonaScenarioIds[selectedSamplePersonaId],
      true
    );
  }

  function handleImportPlanFromWelcome() {
    clearEphemeralUiState();
    clearAcceptedAiSessions();

    const nextPlannerRuntime = createLiveRuntimePlanner(planner);
    const nextContext = getPlannerStoreContext(nextPlannerRuntime);
    const nextState = setDaySetupInputMode(
      createPlannerStoreState(nextPlannerRuntime),
      nextContext,
      "csv"
    );

    startTransition(() => {
      setPlannerRuntime(nextPlannerRuntime);
      setPlannerTimeMode("live");
      setState(nextState);
      setAiDiagnostics({});
      setDevEngineSettings(loadPlannerDevEngineSettings());
      setSelectedReplanMode(DEFAULT_REPLAN_MODE);
      setSelectedScenarioId(getDefaultScenarioId());
    });
    setEntryView("planner");
  }

  function handleResetBlankDay(
    options: { timeMode?: PlannerTimeMode } = { timeMode: "manual" }
  ) {
    clearEphemeralUiState();
    clearAcceptedAiSessions();
    const nextPlannerRuntime =
      options.timeMode === "live"
        ? createLiveRuntimePlanner(planner)
        : createRuntimePlanner(planner);

    startTransition(() => {
      setPlannerRuntime(nextPlannerRuntime);
      setPlannerTimeMode(options.timeMode ?? "manual");
      setState(createPlannerStoreState(nextPlannerRuntime));
      setAiDiagnostics({});
      setDevEngineSettings(loadPlannerDevEngineSettings());
      setSelectedReplanMode(DEFAULT_REPLAN_MODE);
      setSelectedScenarioId(getDefaultScenarioId());
    });
  }

  async function handleBuildDayPlan() {
    clearReplanUi();
    resetSelectedReplanMode();
    const liveCurrentTime =
      plannerTimeMode === "live" ? formatLocalIsoDateTime() : null;
    const plannerForBuild = liveCurrentTime
      ? createRuntimePlanner(plannerRuntime, liveCurrentTime, liveCurrentTime.slice(0, 10))
      : plannerRuntime;
    const contextForBuild = liveCurrentTime
      ? getPlannerStoreContext(plannerForBuild)
      : plannerContext;

    if (liveCurrentTime) {
      setPlannerRuntime(plannerForBuild);
    }

    await runDraftBuild({
      sourceState: state,
      plannerForBuild,
      context: contextForBuild,
      failureStateOnDraftFailure: state,
    });
  }

  function handleConfirmCsvImportReplacement() {
    if (!pendingCsvImport) {
      return;
    }

    clearReplanUi();
    applyCsvImportResult(pendingCsvImport);
  }

  function handleCancelCsvImportReplacement() {
    setPendingCsvImport(null);
  }

  async function handleGenerateReplanPreview() {
    if (state.stage !== "draft_route" || !state.draftScheduleResponse) {
      return;
    }

    setPendingDraftAiRefinementOffer(null);
    setPendingReplanAiRefinementOffer(null);
    const replanStartedAt = Date.now();
    const localPreviewResult = replanRemainingDay({
      currentTime: plannerRuntime.currentTime,
      dayPlan: plannerView.dayPlan,
      replanMode: selectedReplanMode,
    });
    const localPreviewValidation = validateReplannedDayPlan({
      currentTime: plannerRuntime.currentTime,
      nextDayPlan: localPreviewResult.dayPlan,
      previousDayPlan: plannerView.dayPlan,
      allowProductiveBreaks:
        plannerView.dayPlan.breakMode === "productive" ||
        selectedReplanMode === "use_productive_breaks",
      carryForwardItems: localPreviewResult.carryForwardItems,
      dueWarnings: localPreviewResult.dueWarnings,
      unplacedTasks: localPreviewResult.unplacedTasks,
    });
    const validatedLocalPreview: ReplanPreview | null = localPreviewValidation.isValid
      ? {
          carryForwardItems: localPreviewResult.carryForwardItems,
          carryForwardTaskIds: localPreviewResult.carryForwardTaskIds,
          dayPlan: localPreviewResult.dayPlan,
          dueWarnings: localPreviewResult.dueWarnings,
          mode: selectedReplanMode,
          summary: localPreviewResult.summary,
          unplacedTasks: localPreviewResult.unplacedTasks,
          warnings: localPreviewResult.warnings,
        }
      : null;
    const localScaffold = buildPlannerAiReplanLocalScaffold(
      validatedLocalPreview ?? {
        carryForwardItems: localPreviewResult.carryForwardItems,
        carryForwardTaskIds: localPreviewResult.carryForwardTaskIds,
        dayPlan: localPreviewResult.dayPlan,
        dueWarnings: localPreviewResult.dueWarnings,
        mode: selectedReplanMode,
        summary: localPreviewResult.summary,
        unplacedTasks: localPreviewResult.unplacedTasks,
        warnings: localPreviewResult.warnings,
      }
    );
    const localScaffoldMs = Date.now() - replanStartedAt;
    const replanPayloadBase = buildPlannerAiReplanPayload({
      currentTime: plannerRuntime.currentTime,
      dayPlan: plannerView.dayPlan,
      localScaffold,
      replanMode: selectedReplanMode,
    });
    const reuseReplanContext = buildReplanAiReuseContext(
      acceptedAiReplanRef.current,
      replanPayloadBase
    );
    const replanPayload = buildPlannerAiReplanPayload({
      currentTime: plannerRuntime.currentTime,
      dayPlan: plannerView.dayPlan,
      localScaffold,
      previousAcceptedAiProposal: reuseReplanContext.previousAcceptedAiProposal,
      replanMode: selectedReplanMode,
      changedTaskIds: reuseReplanContext.changedTaskIds,
      taskDeltas: reuseReplanContext.taskDeltas,
      changedBlockIds: reuseReplanContext.changedBlockIds,
      blockDeltas: reuseReplanContext.blockDeltas,
    });

    if (devEngineSettings.replan === "local") {
      if (!localPreviewValidation.isValid) {
        setPlannerFlowDiagnostics(
          createPlannerFlowDiagnostics({
            flow: "replan",
            engine: "local",
            requestPreview: replanPayload,
            rawResponse: {
              localScaffold,
              localPreviewResult,
            },
            schemaValidation: {
              passed: false,
              issues: localPreviewValidation.warnings,
            },
            normalizedSummary: [],
            timings: extendTimingDiagnostics(undefined, {
              endToEndMs: Date.now() - replanStartedAt,
              localScaffoldMs,
              mergeValidationMs: Math.max(
                Date.now() - replanStartedAt - localScaffoldMs,
                0
              ),
            }),
            error: "Local replan preview failed app-side validation.",
          })
        );
        setReplanPreview(null);
        setReplanErrors(localPreviewValidation.warnings);
        setLastAppliedReplanSummary(null);
        return;
      }

      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "replan",
          engine: "local",
          requestPreview: replanPayload,
          rawResponse: {
            localScaffold,
            localPreviewResult,
          },
          schemaValidation: {
            passed: true,
            issues: [],
          },
          timings: extendTimingDiagnostics(undefined, {
            endToEndMs: Date.now() - replanStartedAt,
            localScaffoldMs,
            mergeValidationMs: Math.max(
              Date.now() - replanStartedAt - localScaffoldMs,
              0
            ),
          }),
          normalizedSummary: localPreviewResult.summary.summaryLines,
        })
      );
      setReplanErrors([]);
      setLastAppliedReplanSummary(null);
      requestTimelineViewport("replan");
      setReplanPreview(validatedLocalPreview);
      setOraclePanelPreference("adjust");
      showOracleEvent(
        buildOracleReplanEvent({
          currentTime: plannerRuntime.currentTime,
          kind: "replan_generated",
          preview: validatedLocalPreview!,
        }),
        { keepPanelPreference: true }
      );
      return;
    }

    if (!validatedLocalPreview) {
      setRouteUpdatingIndicator(true);
      const aiReplanRoundTripStartedAt = Date.now();
      const aiResolution = await runInteractivePlannerAiRequest({
        canUseLocalNow: false,
        flow: "replan",
        message: "AI is taking longer than usual.",
        run: ({ signal }) =>
          requestPlannerAiReplan(
            {
              flow: "replan",
              includeDiagnostics: SHOULD_REQUEST_AI_DIAGNOSTICS,
              payload: replanPayload,
            },
            { signal }
          ),
      });
      const aiRoundTripMs = Date.now() - aiReplanRoundTripStartedAt;

      if (aiResolution.kind !== "ai") {
        const fallbackOutcome =
          "AI replanning took too long, so the current route was preserved.";

        setPlannerFlowDiagnostics(
          createPlannerFlowDiagnostics({
            flow: "replan",
            engine: "ai",
            requestPreview: replanPayload,
            rawResponse: {
              localScaffold,
              validatedLocalPreview: null,
            },
            schemaValidation: {
              passed: false,
              issues: localPreviewValidation.warnings,
            },
            fallbackOutcome,
            normalizedSummary: [],
            timings: extendTimingDiagnostics(undefined, {
              endToEndMs: Date.now() - replanStartedAt,
              localScaffoldMs,
              aiRoundTripMs,
            }),
          })
        );
        setReplanPreview(null);
        setReplanErrors([fallbackOutcome]);
        setLastAppliedReplanSummary(null);
        setRouteUpdatingIndicator(false);
        return;
      }

      const aiResult = aiResolution.response;

      if (!aiResult.ok) {
        const errorSummary = getPlannerAiFailureSummary("replan", aiResult.error);

        setPlannerFlowDiagnostics(
          createPlannerFlowDiagnostics({
            flow: "replan",
            engine: "ai",
            model: aiResult.diagnostics?.model,
            payloadBytes: aiResult.diagnostics?.payloadBytes,
            ...getServerDiagnosticsMetadata(aiResult.diagnostics),
            requestPreview:
              aiResult.diagnostics?.requestPreview ?? replanPayload,
            rawResponse: aiResult.diagnostics?.rawResponse ?? null,
            schemaValidation:
              aiResult.diagnostics?.schemaValidation ?? {
                passed: false,
                issues: [aiResult.error],
              },
            repairNotes: aiResult.diagnostics?.repairNotes ?? [],
            timings: extendTimingDiagnostics(aiResult.diagnostics?.timings, {
              endToEndMs: Date.now() - replanStartedAt,
              localScaffoldMs,
              aiRoundTripMs,
            }),
            normalizedSummary: [],
            error: errorSummary,
          })
        );
        setReplanPreview(null);
        setReplanErrors([errorSummary]);
        setLastAppliedReplanSummary(null);
        setRouteUpdatingIndicator(false);
        return;
      }

      const mergeValidationStartedAt = Date.now();
      const translated = translateAiReplanResponse({
        currentTime: plannerRuntime.currentTime,
        dayPlan: plannerView.dayPlan,
        response: aiResult.result,
        replanMode: selectedReplanMode,
      });
      const validation = validateReplannedDayPlan({
        currentTime: plannerRuntime.currentTime,
        nextDayPlan: translated.value.dayPlan,
        previousDayPlan: plannerView.dayPlan,
        allowProductiveBreaks:
          plannerView.dayPlan.breakMode === "productive" ||
          selectedReplanMode === "use_productive_breaks",
        carryForwardItems: translated.value.carryForwardItems,
        dueWarnings: translated.value.dueWarnings,
        unplacedTasks: translated.value.unplacedTasks,
      });
      const mergeValidationMs = Date.now() - mergeValidationStartedAt;

      if (!validation.isValid) {
        setPlannerFlowDiagnostics(
          createPlannerFlowDiagnostics({
            flow: "replan",
            engine: "ai",
            model: aiResult.diagnostics?.model,
            payloadBytes: aiResult.diagnostics?.payloadBytes,
            ...getServerDiagnosticsMetadata(aiResult.diagnostics),
            requestPreview:
              aiResult.diagnostics?.requestPreview ?? replanPayload,
            rawResponse: aiResult.diagnostics?.rawResponse ?? aiResult.result,
            schemaValidation:
              aiResult.diagnostics?.schemaValidation ?? {
                passed: true,
                issues: [],
              },
            repairNotes: dedupeStrings([
              ...(aiResult.diagnostics?.repairNotes ?? []),
              ...translated.repairNotes,
            ]),
            timings: extendTimingDiagnostics(aiResult.diagnostics?.timings, {
              endToEndMs: Date.now() - replanStartedAt,
              localScaffoldMs,
              aiRoundTripMs,
              mergeValidationMs,
            }),
            normalizedSummary: translated.normalizedSummary,
            error: "AI replan proposal failed app-side validation and was not applied.",
          })
        );
        setReplanPreview(null);
        setReplanErrors(validation.warnings);
        setLastAppliedReplanSummary(null);
        setRouteUpdatingIndicator(false);
        return;
      }

      setPlannerFlowDiagnostics(
        createPlannerFlowDiagnostics({
          flow: "replan",
          engine: "ai",
          model: aiResult.diagnostics?.model,
          payloadBytes: aiResult.diagnostics?.payloadBytes,
          ...getServerDiagnosticsMetadata(aiResult.diagnostics),
          requestPreview:
            aiResult.diagnostics?.requestPreview ?? replanPayload,
          rawResponse: aiResult.diagnostics?.rawResponse ?? aiResult.result,
          schemaValidation:
            aiResult.diagnostics?.schemaValidation ?? {
              passed: true,
              issues: [],
            },
          repairNotes: dedupeStrings([
            ...(aiResult.diagnostics?.repairNotes ?? []),
            ...translated.repairNotes,
          ]),
          timings: extendTimingDiagnostics(aiResult.diagnostics?.timings, {
            endToEndMs: Date.now() - replanStartedAt,
            localScaffoldMs,
            aiRoundTripMs,
            mergeValidationMs,
          }),
          normalizedSummary: translated.value.summary.summaryLines,
        })
      );
      acceptedAiReplanRef.current = {
        proposal: buildAcceptedReplanProposal(
          translated.value,
          plannerRuntime.currentTime
        ),
        requestPayload: replanPayload,
      };
      setReplanErrors([]);
      setLastAppliedReplanSummary(null);
      requestTimelineViewport("replan");
      setReplanPreview(translated.value);
      setOraclePanelPreference("adjust");
      showOracleEvent(
        buildOracleReplanEvent({
          currentTime: plannerRuntime.currentTime,
          kind: "replan_generated",
          preview: translated.value,
        }),
        { keepPanelPreference: true }
      );
      setRouteUpdatingIndicator(false);
      return;
    }

    setPendingReplanAiRefinementOffer(null);
    setReplanErrors([]);
    setLastAppliedReplanSummary(null);
    requestTimelineViewport("replan");
    setReplanPreview(validatedLocalPreview);
    setOraclePanelPreference("adjust");
    setPlannerFlowDiagnostics(
      createPlannerFlowDiagnostics({
        flow: "replan",
        engine: "ai",
        requestPreview: replanPayload,
        rawResponse: {
          localScaffold,
          localPreviewResult,
        },
        schemaValidation: {
          passed: true,
          issues: [],
        },
        timings: extendTimingDiagnostics(undefined, {
          endToEndMs: Date.now() - replanStartedAt,
          localScaffoldMs,
          mergeValidationMs: Math.max(
            Date.now() - replanStartedAt - localScaffoldMs,
            0
          ),
        }),
        normalizedSummary: [
          ...validatedLocalPreview.summary.summaryLines,
          "The local remainder preview is visible while AI reviews it for a possible second-pass improvement.",
        ],
      })
    );
    showOracleEvent(
      buildOracleReplanEvent({
        currentTime: plannerRuntime.currentTime,
        kind: "replan_generated",
        preview: validatedLocalPreview,
      }),
      { keepPanelPreference: true }
    );
    void continueReplanAiRefinement({
      currentTime: plannerRuntime.currentTime,
      localScaffold,
      localScaffoldMs,
      replanPayload,
      replanStartedAt,
      requestSignature: createReplanPreviewSignature(validatedLocalPreview),
      validatedLocalPreview,
    });
  }

  function handleCancelReplanPreview() {
    setReplanErrors([]);
    setReplanPreview(null);
    setPendingReplanAiRefinementOffer(null);
  }

  function handleApplyReplanPreview() {
    if (!replanPreview) {
      return;
    }

    const validation = validateReplannedDayPlan({
      currentTime: plannerRuntime.currentTime,
      nextDayPlan: replanPreview.dayPlan,
      previousDayPlan: plannerView.dayPlan,
      allowProductiveBreaks:
        plannerView.dayPlan.breakMode === "productive" ||
        replanPreview.mode === "use_productive_breaks",
      carryForwardItems: replanPreview.carryForwardItems,
      dueWarnings: replanPreview.dueWarnings,
      unplacedTasks: replanPreview.unplacedTasks,
    });

    if (!validation.isValid) {
      setReplanErrors(validation.warnings);
      return;
    }

    pulseRouteUpdating();
    requestTimelineViewport("replan");
    startTransition(() => {
      setState((previousState) => {
        const nextState = commitReplanPreview(
          previousState,
          replanPreview,
          plannerRuntime.currentTime
        );

        persistPlannerStoreState(nextState, {
          plannerCurrentTime: plannerRuntime.currentTime,
          selectedScenarioId,
        });

        return nextState;
      });
      setLastAppliedReplanSummary(replanPreview.summary);
      setReplanErrors([]);
      setReplanPreview(null);
      setPendingReplanAiRefinementOffer(null);
      showOracleEvent(
        buildOracleReplanEvent({
          currentTime: plannerRuntime.currentTime,
          kind: "replan_applied",
          preview: replanPreview,
        })
      );
    });
  }

  function handleKeepTaskFlexible(taskId: string, placeholderHeight: number) {
    const targetTask = state.parsedTaskResponse?.tasks.find((task) => task.id === taskId);

    if (!targetTask) {
      return;
    }

    clearReplanUi();

    if (state.stage === "draft_route") {
      pulseRouteUpdating();
      resetSelectedReplanMode();
    }

    showFeedbackToast(
      targetTask,
      "Kept flexible — stays in interpreted tasks.",
      placeholderHeight
    );
    const nextState = keepTaskFlexible(state, taskId);

    if (state.stage !== "draft_route" || !state.draftScheduleResponse) {
      startTransition(() => {
        setState(nextState);
      });
      return;
    }

    void runDraftBuild({
      sourceState: buildDraftRebuildState(state, nextState),
      plannerForBuild: plannerRuntime,
      context: plannerContext,
      failureStateOnDraftFailure: state,
    });
  }

  function handleLockTaskToDetectedTime(taskId: string, placeholderHeight: number) {
    const targetTask = state.parsedTaskResponse?.tasks.find((task) => task.id === taskId);

    if (!targetTask) {
      return;
    }

    clearReplanUi();

    if (state.stage === "draft_route") {
      pulseRouteUpdating();
      resetSelectedReplanMode();
    }

    showFeedbackToast(
      targetTask,
      "Locked to time — moved into locked anchors.",
      placeholderHeight
    );
    const nextState = lockTaskToDetectedTime(state, plannerContext, taskId);

    if (
      nextState === state ||
      state.stage !== "draft_route" ||
      !state.draftScheduleResponse
    ) {
      startTransition(() => {
        setState(nextState);
      });
      return;
    }

    void runDraftBuild({
      sourceState: buildDraftRebuildState(state, nextState),
      plannerForBuild: plannerRuntime,
      context: plannerContext,
      failureStateOnDraftFailure: state,
    });
  }

  function handleUnlockTaskFromTime(taskId: string) {
    clearReplanUi();

    if (state.stage === "draft_route") {
      pulseRouteUpdating();
      resetSelectedReplanMode();
    }

    const nextState = unlockTaskFromTime(state, taskId);

    if (state.stage !== "draft_route" || !state.draftScheduleResponse) {
      startTransition(() => {
        setState(nextState);
      });
      return;
    }

    void runDraftBuild({
      sourceState: buildDraftRebuildState(state, nextState),
      plannerForBuild: plannerRuntime,
      context: plannerContext,
      failureStateOnDraftFailure: state,
    });
  }

  function handleAddCarryForwardToToday(
    carryForwardItem: CarryForwardItem,
    status: "accepted" | "review"
  ) {
    clearReplanUi();
    const nextInbox = updateCarryForwardItemStatus(
      carryForwardInbox,
      carryForwardItem.id,
      status === "accepted" ? "consumed" : "review"
    );

    persistCarryForwardInbox(nextInbox);
    setCarryForwardInbox(nextInbox);
    startTransition(() => {
      setState((previousState) =>
        addCarryForwardItemToIntake(previousState, carryForwardItem, status)
      );
    });
  }

  function handleIgnoreCarryForward(carryForwardItemId: string) {
    clearReplanUi();
    const nextInbox = updateCarryForwardItemStatus(
      carryForwardInbox,
      carryForwardItemId,
      "ignored"
    );

    persistCarryForwardInbox(nextInbox);
    setCarryForwardInbox(nextInbox);
  }

  const carryForwardItemsForIntake = getCarryForwardItemsForIntake(
    carryForwardInbox,
    plannerView.dayPlan.date
  );
  const preRouteAiSlowPrompt =
    aiSlowPrompt &&
    (aiSlowPrompt.flow === "parse" || aiSlowPrompt.flow === "draft")
      ? {
          canUseLocalNow: aiSlowPrompt.canUseLocalNow,
          message: aiSlowPrompt.message,
        }
      : null;
  const replanAiSlowPrompt =
    aiSlowPrompt?.flow === "replan"
      ? {
          canUseLocalNow: aiSlowPrompt.canUseLocalNow,
          message: aiSlowPrompt.message,
        }
      : null;
  const plannerExportSource = selectPlannerExportSource({
    currentTime: plannerRuntime.currentTime,
    draftScheduleResponse: state.draftScheduleResponse,
    profile: {
      name: state.intakeDraft.profileName,
      journey: state.intakeDraft.profileJourney,
      priorities: state.intakeDraft.profilePriorities,
      rhythm: state.intakeDraft.profileRhythm,
      preference: state.intakeDraft.profilePreference,
    },
    replanPreview,
    routeWarnings: state.routeHonestyWarnings,
  });
  const plannerExportBundle = plannerExportSource
    ? createPlannerExportBundle(plannerExportSource)
    : null;
  const routeExists =
    state.stage === "draft_route" && Boolean(state.draftScheduleResponse);
  const resumeExecution = routeExists
    ? deriveDayPlanExecutionSnapshot(plannerView.dayPlan, plannerRuntime.currentTime)
    : null;
  const currentDateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(
    new Date(
      routeExists
        ? plannerView.dayPlan.planningWindow.startTime
        : formatLocalIsoDateTime()
      )
  );

  function handleFloatingBackStep() {
    clearReplanUi();

    if (state.stage === "draft_route" && routeExists) {
      setState((previousState) => returnToInterpretation(previousState));
      return;
    }

    if (state.stage === "interpretation") {
      setState((previousState) => returnToDaySetup(previousState));
      return;
    }

    setEntryView("welcome_resume");
  }

  if (!hasHydrated) {
    return (
      <main className="waykeeper-welcome flex min-h-screen items-center justify-center px-6 py-10">
        <WaykeeperLoadingCard className="w-full max-w-3xl" />
      </main>
    );
  }

  if (entryView === "welcome_resume") {
    return (
      <WelcomeResumeScreen
        currentDateLabel={currentDateLabel}
        hasResumePlan={routeExists}
        nextBlockTitle={resumeExecution?.nextBlock?.title}
        onImportPlan={handleImportPlanFromWelcome}
        onResumePlan={handleResumeFromWelcome}
        onSampleDay={handleSampleDayFromWelcome}
        onStartToday={handleStartTodayFromWelcome}
        progressLabel={
          resumeExecution
            ? `${resumeExecution.doneBlocks.length} complete`
            : undefined
        }
        resumeBlockTitle={resumeExecution?.currentDisplayBlock?.title}
      />
    );
  }

  if (entryView === "sample_preview") {
    return (
      <SampleDayPreview
        onBack={() => setEntryView("welcome_resume")}
        onSelectPersona={setSelectedSamplePersonaId}
        onTrySampleDay={handleSampleDayFromPreview}
        selectedPersonaId={selectedSamplePersonaId}
      />
    );
  }

  return (
    <PlannerShell
      aiDiagnostics={aiDiagnostics}
      devEngineSettings={devEngineSettings}
      onAdjustPlannerTime={handleAdjustPlannerTime}
      onApplyReplanPreview={handleApplyReplanPreview}
      onApplyDraftAiRefinementOffer={handleApplyDraftAiRefinementOffer}
      onApplyReplanAiRefinementOffer={handleApplyReplanAiRefinementOffer}
      onCancelReplanPreview={handleCancelReplanPreview}
      onOracleCloseAdjust={() => setOraclePanelPreference("auto")}
      onDelayBlock={(blockId, minutes) => {
        clearReplanUi();
        pulseRouteUpdating();
        const nextState = delayBlock(
          state,
          plannerRuntime.currentTime,
          blockId,
          minutes
        );

        setState(nextState);

        if (nextState !== state && nextState.draftScheduleResponse && state.draftScheduleResponse) {
          showOracleEvent(
            buildOracleMutationEvent({
              blockId,
              currentTime: plannerRuntime.currentTime,
              delayMinutes: minutes,
              kind: "block_delayed",
              nextDayPlan: nextState.draftScheduleResponse.dayPlan,
              previousDayPlan: state.draftScheduleResponse.dayPlan,
            })
          );
        }
      }}
      onGenerateReplanPreview={handleGenerateReplanPreview}
      onKeepWaitingForAi={handleKeepWaitingForAi}
      onMarkBlockComplete={(blockId) => {
        clearReplanUi();
        pulseRouteUpdating();
        const nextState = markBlockComplete(
          state,
          plannerRuntime.currentTime,
          blockId
        );

        setState(nextState);

        if (nextState !== state && nextState.draftScheduleResponse && state.draftScheduleResponse) {
          showOracleEvent(
            buildOracleMutationEvent({
              blockId,
              currentTime: plannerRuntime.currentTime,
              kind: "block_completed",
              nextDayPlan: nextState.draftScheduleResponse.dayPlan,
              previousDayPlan: state.draftScheduleResponse.dayPlan,
            })
          );
        }
      }}
      onOracleOpenAdjust={() => setOraclePanelPreference("adjust")}
      onResetPlannerTime={handleResetPlannerTime}
      onLoadDevScenario={(scenarioId) => handleLoadScenario(scenarioId, false)}
      onLoadAndBuildDevScenario={(scenarioId) =>
        handleLoadScenario(scenarioId, true)
      }
      onBackToDaySetup={() => {
        clearReplanUi();
        setState((previousState) => returnToDaySetup(previousState));
      }}
      onBackStep={handleFloatingBackStep}
      onGoHome={() => setEntryView("welcome_resume")}
      onResetBlankDay={handleResetBlankDay}
      onSetPlannerTime={handleSetPlannerTime}
      onSelectDevScenario={(scenarioId) =>
        setSelectedScenarioId(normalizeScenarioId(scenarioId))
      }
      onSetDevEngineMode={(flow, mode) => {
        setDevEngineSettings((currentSettings) => ({
          ...currentSettings,
          [flow]: mode,
        }));
      }}
      devScenarios={plannerDevScenarios}
      planner={plannerView}
      lastAppliedReplanSummary={lastAppliedReplanSummary}
      onUseLocalNowForAi={handleUseLocalNowForAi}
      onDismissDraftAiRefinementOffer={handleDismissDraftAiRefinementOffer}
      onDismissReplanAiRefinementOffer={handleDismissReplanAiRefinementOffer}
      pendingDraftAiRefinementOffer={
        pendingDraftAiRefinementOffer
          ? {
              summaryLines: pendingDraftAiRefinementOffer.summaryLines,
            }
          : null
      }
      pendingReplanAiRefinementOffer={
        pendingReplanAiRefinementOffer
          ? {
              summaryLines: pendingReplanAiRefinementOffer.summaryLines,
            }
          : null
      }
      preRouteHardEvents={state.parsedTaskResponse?.hardEvents ?? []}
      replanAiSlowPrompt={replanAiSlowPrompt}
      replanErrors={replanErrors}
      replanPreview={replanPreview}
      routeCarryForwardItems={state.draftScheduleResponse?.carryForwardItems ?? []}
      routeWarnings={state.routeHonestyWarnings}
      routeOracleAdvice={state.oracleAdvice}
      routeUnplacedTasks={state.draftScheduleResponse?.unplacedTasks ?? []}
      plannerExportBundle={plannerExportBundle}
      oraclePanelPreference={oraclePanelPreference}
      oracleRecentEvent={oracleRecentEvent}
      selectedReplanMode={selectedReplanMode}
      selectedDevScenarioId={selectedScenarioId}
      seededCurrentTime={planner.currentTime}
      showDevTools={SHOULD_SHOW_DEV_TOOLS}
      onSelectReplanMode={(mode) => {
        setSelectedReplanMode(mode);
        setReplanErrors([]);
        setReplanPreview(null);
      }}
      onSkipBlock={(blockId) => {
        clearReplanUi();
        pulseRouteUpdating();
        const nextState = skipBlock(state, plannerRuntime.currentTime, blockId);

        setState(nextState);

        if (nextState !== state && nextState.draftScheduleResponse && state.draftScheduleResponse) {
          showOracleEvent(
            buildOracleMutationEvent({
              blockId,
              currentTime: plannerRuntime.currentTime,
              kind: "block_skipped",
              nextDayPlan: nextState.draftScheduleResponse.dayPlan,
              previousDayPlan: state.draftScheduleResponse.dayPlan,
            })
          );
        }
      }}
      onToggleTaskBlockComplete={(blockId) => {
        clearReplanUi();
        pulseRouteUpdating();
        setState((previousState) =>
          togglePastBlockComplete(
            previousState,
            plannerRuntime.currentTime,
            blockId
          )
        );
      }}
      leftRail={
        <TaskIntakePanel
          aiSlowPrompt={preRouteAiSlowPrompt}
          csvImportReport={csvImportReport}
          draft={state.intakeDraft}
          draftScheduleResponse={state.draftScheduleResponse}
          intakeCarryForwardItems={carryForwardItemsForIntake}
          errors={state.errors}
          isCsvImportReplacePending={Boolean(pendingCsvImport)}
          onAddFixedEvent={() => {
            clearReplanUi();
            setState((previousState) =>
              addFixedEvent(previousState, plannerContext)
            );
          }}
          onCancelCsvImportReplace={handleCancelCsvImportReplacement}
          onBackToDaySetup={() => {
            clearReplanUi();
            setState((previousState) => returnToDaySetup(previousState));
          }}
          onBackToReview={() => {
            clearReplanUi();
            setState((previousState) => returnToInterpretation(previousState));
          }}
          onBreakModeChange={(breakMode) => {
            clearReplanUi();
            setState((previousState) =>
              setBreakMode(previousState, plannerContext, breakMode)
            );
          }}
          onConfirmCsvImportReplace={handleConfirmCsvImportReplacement}
          onCsvTextChange={(csvText) => {
            clearReplanUi();
            setCsvImportReport(null);
            setPendingCsvImport(null);
            setState((previousState) =>
              setCsvText(previousState, plannerContext, csvText)
            );
          }}
          onInputModeChange={(inputMode: DaySetupInputMode) => {
            clearReplanUi();
            setCsvImportReport(null);
            setPendingCsvImport(null);
            setState((previousState) =>
              setDaySetupInputMode(previousState, plannerContext, inputMode)
            );
          }}
          onBreakCadenceChange={(breakCadence) => {
            clearReplanUi();
            setState((previousState) =>
              setBreakCadence(previousState, plannerContext, breakCadence)
            );
          }}
          onPaceModeChange={(paceMode) => {
            clearReplanUi();
            setState((previousState) =>
              setPaceMode(previousState, plannerContext, paceMode)
            );
          }}
          onBuildDayPlan={handleBuildDayPlan}
          onDurationChange={(taskId, minutes) => {
            clearReplanUi();
            setState((previousState) =>
              setTaskEstimatedMinutes(previousState, taskId, minutes)
            );
          }}
          onDueAtChange={(taskId, dueAt) => {
            clearReplanUi();
            setState((previousState) =>
              setTaskDueAt(previousState, taskId, dueAt, plannerContext.offset)
            );
          }}
          onAcceptDetectedDueDate={(taskId) => {
            clearReplanUi();
            setState((previousState) =>
              acceptDetectedTaskDueDate(previousState, taskId)
            );
          }}
          onDismissDetectedDueDate={(taskId) => {
            clearReplanUi();
            setState((previousState) =>
              dismissDetectedTaskDueDate(previousState, taskId)
            );
          }}
          onAddCarryForwardToToday={handleAddCarryForwardToToday}
          onIgnoreCarryForward={handleIgnoreCarryForward}
          feedbackToast={feedbackToast}
          isRouteUpdating={isRouteUpdating}
          onKeepTaskFlexible={handleKeepTaskFlexible}
          onKeepWaitingForAi={handleKeepWaitingForAi}
          onLockTaskToDetectedTime={handleLockTaskToDetectedTime}
          onUnlockTaskFromTime={handleUnlockTaskFromTime}
          onPlanningWindowChange={(field, value) => {
            clearReplanUi();
            setState((previousState) =>
              setPlanningWindowField(previousState, plannerContext, field, value)
            );
          }}
          onProfileFieldChange={(field, value) => {
            clearReplanUi();
            setState((previousState) =>
              setProfileField(previousState, plannerContext, field, value)
            );
          }}
          onProfilePriorityToggle={(priority) => {
            clearReplanUi();
            setState((previousState) =>
              toggleProfilePriority(previousState, plannerContext, priority)
            );
          }}
          onRawTextChange={(rawText) => {
            clearReplanUi();
            setCsvImportReport(null);
            setPendingCsvImport(null);
            setState((previousState) =>
              setRawText(previousState, plannerContext, rawText)
            );
          }}
          onRemoveFixedEvent={(eventId) => {
            clearReplanUi();
            setState((previousState) =>
              removeFixedEvent(previousState, plannerContext, eventId)
            );
          }}
          onSubmit={handleInterpret}
          onUseLocalNowForAi={handleUseLocalNowForAi}
          onUpdateFixedEvent={(eventId, field, value) => {
            clearReplanUi();
            setState((previousState) =>
              updateFixedEvent(previousState, plannerContext, eventId, field, value)
            );
          }}
          parsedTaskResponse={state.parsedTaskResponse}
          pendingFixedEventPreviews={pendingFixedEventPreviews}
          plannerWarnings={state.plannerWarnings}
          stage={state.stage}
          warnings={state.warnings}
        />
      }
      routeExists={routeExists}
      stage={state.stage}
      showPlannerTimeReset={plannerRuntime.currentTime !== planner.currentTime}
      themeMode={themeMode}
      onThemeModeChange={setThemeMode}
      timelineViewportRequest={timelineViewportRequest}
    />
  );
}

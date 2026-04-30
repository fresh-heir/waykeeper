import {
  applyCarryForwardStateToTasks,
  buildCarryForwardProjection,
  deriveScheduledDueWarnings,
} from "@/app/_lib/planner/carry-forward";
import { extractOffset, formatIsoWithOffset } from "@/app/_lib/planner/date-time";
import { normalizeTaskChunkPresentation, normalizeUnplacedTasksForDayPlan, synchronizeDayPlanToCurrentTime } from "@/app/_lib/planner/scheduler";
import type {
  PlannerAiDraftResponse,
  PlannerAiParseResponse,
  PlannerAiReplanResponse,
  PlannerAiResponseScheduleBlock,
  PlannerTranslationResult,
} from "@/app/_lib/planner/ai/types";
import type {
  DayPlan,
  DraftScheduleResponse,
  HardEvent,
  ParsedTaskResponse,
  ReplanPreview,
  ScheduleBlock,
  Task,
  UnplacedTask,
} from "@/app/_lib/planner-types";

const TERMINAL_STATUSES = new Set(["deferred", "done", "skipped"]);

interface TranslateDraftArgs {
  currentTime: string;
  dayPlan: DayPlan;
  hardEvents: HardEvent[];
  rawText: string;
  response: PlannerAiDraftResponse;
}

interface TranslateReplanArgs {
  currentTime: string;
  dayPlan: DayPlan;
  response: PlannerAiReplanResponse;
  replanMode: ReplanPreview["mode"];
}

export function translateAiParseResponse({
  baselineResponse,
  response,
}: {
  baselineResponse: ParsedTaskResponse;
  response: PlannerAiParseResponse;
}): PlannerTranslationResult<ParsedTaskResponse> {
  const repairNotes: string[] = [];
  const tasks = alignTaskRefinements({
    baseTasks: baselineResponse.tasks,
    candidateTasks: response.tasks,
    preserveUserOwnedFields: true,
    repairNotes,
  });

  return {
    value: {
      tasks,
      hardEvents: baselineResponse.hardEvents,
      warnings: dedupeStrings([
        ...baselineResponse.warnings,
        ...(response.warnings ?? []),
      ]),
      followUpQuestions: response.followUpQuestions ?? [],
    },
    normalizedSummary: [
      `Refined ${tasks.length} tasks and preserved ${baselineResponse.hardEvents.length} inferred anchors.`,
      ...(response.followUpQuestions?.length
        ? [`Flagged ${response.followUpQuestions.length} targeted follow-up questions.`]
        : []),
    ],
    repairNotes,
  };
}

export function translateAiDraftResponse({
  currentTime,
  dayPlan,
  hardEvents,
  rawText,
  response,
}: TranslateDraftArgs): PlannerTranslationResult<DraftScheduleResponse> {
  const repairNotes: string[] = [];
  const tasks = alignTaskRefinements({
    baseTasks: dayPlan.tasks,
    candidateTasks: response.tasks ?? [],
    preserveUserOwnedFields: true,
    repairNotes,
  });
  const blocks = buildCanonicalDraftBlocks({
    currentTime,
    planningWindow: dayPlan.planningWindow,
    tasks,
    hardEvents,
    responseBlocks: response.blocks,
    repairNotes,
  });
  const provisionalDayPlan = synchronizeDayPlanToCurrentTime(
    {
      ...dayPlan,
      rawInput: {
        ...dayPlan.rawInput,
        rawText,
      },
      tasks,
      hardEvents,
      blocks,
      updatedAt: currentTime,
    },
    currentTime
  );
  const candidateUnplacedTasks = normalizeUnplacedTasksForDayPlan(
    provisionalDayPlan,
    []
  );
  const carryForwardProjection = buildCarryForwardProjection({
    carryForwardReason: "overflow",
    carriedFromDate: provisionalDayPlan.date,
    dayPlan: provisionalDayPlan,
    sourceTasks: tasks,
    unplacedTasks: candidateUnplacedTasks,
  });
  const nextDayPlan = synchronizeDayPlanToCurrentTime(
    {
      ...provisionalDayPlan,
      tasks: applyCarryForwardStateToTasks({
        carryForwardItems: carryForwardProjection.carryForwardItems,
        carriedFromDate: provisionalDayPlan.date,
        sourceTasks: provisionalDayPlan.tasks,
      }),
    },
    currentTime
  );
  const dueWarnings = [
    ...deriveScheduledDueWarnings(nextDayPlan),
    ...carryForwardProjection.dueWarnings,
  ];
  const warnings = dedupeStrings([
    ...(carryForwardProjection.carryForwardItems.length > 0
      ? [
          "Not everything fit inside this planning window, so overflow was carried forward explicitly.",
        ]
      : []),
    ...dueWarnings.map((warning) => warning.message),
  ]);

  return {
    value: {
      dayPlan: nextDayPlan,
      unplacedTasks: carryForwardProjection.unplacedTasks,
      carryForwardItems: carryForwardProjection.carryForwardItems,
      carryForwardTaskIds: carryForwardProjection.carryForwardTaskIds,
      dueWarnings,
      warnings,
      oracleAdvice: dedupeStrings([
        ...(response.oracleAdvice ?? []),
        ...(response.warnings ?? []),
        ...(response.summary ? [response.summary] : []),
      ]),
    },
    normalizedSummary: [
      `Accepted ${countFlexibleBlocks(response.blocks, tasks)} proposed flexible blocks across a one-day route.`,
      ...(response.summary ? [response.summary] : []),
      ...(carryForwardProjection.carryForwardItems.length > 0
        ? [`Carried forward ${carryForwardProjection.carryForwardItems.length} tasks after app-side overflow accounting.`]
        : []),
    ],
    repairNotes,
  };
}

export function translateAiReplanResponse({
  currentTime,
  dayPlan,
  response,
  replanMode,
}: TranslateReplanArgs): PlannerTranslationResult<ReplanPreview> {
  const repairNotes: string[] = [];
  const currentMs = new Date(currentTime).getTime();
  const synchronizedDayPlan = synchronizeDayPlanToCurrentTime(dayPlan, currentTime);
  const completedTaskIds = new Set(synchronizedDayPlan.completedTaskIds ?? []);
  const skippedTaskIds = new Set(
    synchronizedDayPlan.blocks
      .filter((block) => block.status === "skipped" && Boolean(block.taskId))
      .map((block) => block.taskId!)
  );
  const suppressedTaskIds = new Set([...completedTaskIds, ...skippedTaskIds]);
  const historyBlocks: ScheduleBlock[] = [];
  const futureLockedBlocks: ScheduleBlock[] = [];
  let clippedActiveBlock = false;

  [...synchronizedDayPlan.blocks]
    .sort(
      (left, right) =>
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    )
    .forEach((block) => {
      const startMs = new Date(block.startTime).getTime();
      const endMs = new Date(block.endTime).getTime();

      if (TERMINAL_STATUSES.has(block.status)) {
        if (endMs <= currentMs || startMs <= currentMs) {
          historyBlocks.push(block);
        }
        return;
      }

      if (block.status === "expired" && endMs <= currentMs) {
        historyBlocks.push(block);
        return;
      }

      if (block.locked && endMs > currentMs) {
        futureLockedBlocks.push(block);
        return;
      }

      if (endMs <= currentMs) {
        if (!block.taskId || block.locked) {
          historyBlocks.push(block);
        }
        return;
      }

      if (!block.locked && startMs < currentMs && currentMs < endMs) {
        historyBlocks.push({
          ...block,
          endTime: currentTime,
          status: "expired",
        });
        clippedActiveBlock = true;
      }
    });

  const rebuiltBlocks = buildCanonicalReplanBlocks({
    currentTime,
    planningWindow: synchronizedDayPlan.planningWindow,
    tasks: synchronizedDayPlan.tasks,
    responseBlocks: response.blocks,
    suppressedTaskIds,
    repairNotes,
  });
  const provisionalDayPlan = synchronizeDayPlanToCurrentTime(
    {
      ...synchronizedDayPlan,
      blocks: normalizeTaskChunkPresentation(
        [...historyBlocks, ...futureLockedBlocks, ...rebuiltBlocks].sort(
          (left, right) =>
            new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
        ),
        synchronizedDayPlan.tasks
      ),
      updatedAt: currentTime,
    },
    currentTime
  );
  const candidateUnplacedTasks = normalizeUnplacedTasksForDayPlan(
    provisionalDayPlan,
    buildCandidateReplanUnplacedTasks(
      synchronizedDayPlan.tasks,
      response.droppedTaskIds ?? [],
      response.carryForwardTaskIds ?? []
    )
  );
  const carryForwardProjection = buildCarryForwardProjection({
    carryForwardReason: "replan_overflow",
    carriedFromDate: provisionalDayPlan.date,
    dayPlan: provisionalDayPlan,
    sourceTasks: synchronizedDayPlan.tasks,
    unplacedTasks: candidateUnplacedTasks,
  });
  const nextDayPlan = synchronizeDayPlanToCurrentTime(
    {
      ...provisionalDayPlan,
      tasks: applyCarryForwardStateToTasks({
        carryForwardItems: carryForwardProjection.carryForwardItems,
        carriedFromDate: provisionalDayPlan.date,
        sourceTasks: provisionalDayPlan.tasks,
      }),
    },
    currentTime
  );
  const usedProductiveBreaks = rebuiltBlocks.some(
    (block) => block.blockType === "break" && block.isBreakEligibleTaskPlacement
  );
  const dueWarnings = [
    ...deriveScheduledDueWarnings(nextDayPlan),
    ...carryForwardProjection.dueWarnings,
  ];
  const summary = buildReplanSummary({
    clippedActiveBlock,
    currentTime,
    dayPlan: nextDayPlan,
    carryForwardItems: carryForwardProjection.carryForwardItems,
    preservedAnchorCount: futureLockedBlocks.length,
    preservedHistoryCount: historyBlocks.length,
    replanMode,
    usedProductiveBreaks,
  });
  const warnings = dedupeStrings([
    ...(carryForwardProjection.carryForwardItems.length > 0
      ? [
          "Some work was carried forward explicitly to keep today's revised remainder believable.",
        ]
      : []),
    ...(clippedActiveBlock
      ? [
          "The current block was clipped at the time boundary before the remainder was rebuilt.",
        ]
      : []),
    ...(usedProductiveBreaks
      ? ["Low-effort work was allowed inside some productive-break windows."]
      : []),
    ...dueWarnings.map((warning) => warning.message),
  ]);

  return {
    value: {
      dayPlan: nextDayPlan,
      mode: replanMode,
      summary,
      unplacedTasks: carryForwardProjection.unplacedTasks,
      carryForwardItems: carryForwardProjection.carryForwardItems,
      carryForwardTaskIds: carryForwardProjection.carryForwardTaskIds,
      dueWarnings,
      warnings,
      oracleAdvice: dedupeStrings([
        ...(response.oracleAdvice ?? []),
        ...(response.warnings ?? []),
        ...(response.summary ? [response.summary] : []),
      ]),
    },
    normalizedSummary: [
      `Preserved ${historyBlocks.length} history blocks and ${futureLockedBlocks.length} locked anchors before merging the revised remainder.`,
      ...(response.summary ? [response.summary] : []),
      ...(carryForwardProjection.carryForwardItems.length > 0
        ? [`Carried forward ${carryForwardProjection.carryForwardItems.length} tasks after the revised remainder was validated.`]
        : []),
    ],
    repairNotes,
  };
}

function alignTaskRefinements({
  baseTasks,
  candidateTasks,
  preserveUserOwnedFields,
  repairNotes,
}: {
  baseTasks: Task[];
  candidateTasks: Task[];
  preserveUserOwnedFields: boolean;
  repairNotes: string[];
}) {
  const baseTaskIds = new Set(baseTasks.map((task) => task.id));
  const alignedCandidates = candidateTasks.map((task, index) => {
    if (baseTaskIds.has(task.id)) {
      return task;
    }

    const fallbackTask = baseTasks[index];

    if (!fallbackTask) {
      return task;
    }

    repairNotes.push(
      `Reassigned the invalid task id "${task.id}" to "${fallbackTask.id}" by position.`
    );

    return {
      ...task,
      id: fallbackTask.id,
    };
  });
  const candidateTaskById = new Map(
    alignedCandidates.map((task) => [task.id, task] as const)
  );

  return baseTasks.map((baseTask) => {
    const candidateTask = candidateTaskById.get(baseTask.id);

    if (!candidateTask) {
      repairNotes.push(
        `Preserved the existing task "${baseTask.title}" because the model did not return a matching refinement.`
      );
      return baseTask;
    }

    const nextTask: Task = {
      ...baseTask,
      rawText: candidateTask.rawText ?? baseTask.rawText,
      title: candidateTask.title || baseTask.title,
      type: candidateTask.type,
      estimatedMinutes: Math.max(5, Math.round(candidateTask.estimatedMinutes)),
      priority: candidateTask.priority,
      mustDoToday: candidateTask.mustDoToday,
      breakEligible: candidateTask.breakEligible,
      splittable: candidateTask.splittable,
      deferrable: candidateTask.deferrable,
      deferCount: candidateTask.deferCount ?? baseTask.deferCount,
      delayedCount: candidateTask.delayedCount ?? baseTask.delayedCount,
      energyLevel: candidateTask.energyLevel,
      notes: candidateTask.notes ?? baseTask.notes,
      source: candidateTask.source ?? "ai",
    };

    if (!preserveUserOwnedFields) {
      nextTask.dueAt = candidateTask.dueAt ?? baseTask.dueAt;
      nextTask.hardStartTime = candidateTask.hardStartTime ?? baseTask.hardStartTime;
      nextTask.hardEndTime = candidateTask.hardEndTime ?? baseTask.hardEndTime;
    }

    return {
      ...nextTask,
      dueAt: preserveUserOwnedFields
        ? baseTask.dueAt
        : candidateTask.dueAt ?? baseTask.dueAt,
      dueDatePreference: baseTask.dueDatePreference,
      hardStartTime: preserveUserOwnedFields
        ? baseTask.hardStartTime
        : candidateTask.hardStartTime ?? baseTask.hardStartTime,
      hardEndTime: preserveUserOwnedFields
        ? baseTask.hardEndTime
        : candidateTask.hardEndTime ?? baseTask.hardEndTime,
      timingPreference: baseTask.timingPreference,
      carryForward: baseTask.carryForward,
      carriedFromDate: baseTask.carriedFromDate,
      carryForwardReason: baseTask.carryForwardReason,
      carryForwardStatus: baseTask.carryForwardStatus,
    };
  });
}

function buildCanonicalDraftBlocks({
  currentTime,
  planningWindow,
  tasks,
  hardEvents,
  responseBlocks,
  repairNotes,
}: {
  currentTime: string;
  planningWindow: DayPlan["planningWindow"];
  tasks: Task[];
  hardEvents: HardEvent[];
  responseBlocks: PlannerAiResponseScheduleBlock[];
  repairNotes: string[];
}) {
  const offset = extractOffset(planningWindow.startTime);
  const anchorBlocks = hardEvents
    .flatMap((hardEvent) => clampHardEventToPlanningWindow(hardEvent, planningWindow))
    .map((hardEvent) => ({
      id: `block-anchor-${hardEvent.id}`,
      title: hardEvent.title,
      blockType: "appointment" as const,
      startTime: hardEvent.startTime,
      endTime: hardEvent.endTime,
      status: "upcoming" as const,
      locked: true,
      source: hardEvent.source,
      notes: hardEvent.notes,
    }));
  const fixedTaskBlocks = tasks
    .filter((task) => Boolean(task.hardStartTime && task.hardEndTime))
    .map((task) => ({
      id: `block-fixed-task-${task.id}`,
      taskId: task.id,
      title: task.title,
      blockType: mapTaskToBlockType(task),
      startTime: task.hardStartTime!,
      endTime: task.hardEndTime!,
      status: "upcoming" as const,
      locked: true,
      source: task.source,
      notes: "Fixed-time task constraint.",
    }));

  return normalizeTaskChunkPresentation(
    [...anchorBlocks, ...fixedTaskBlocks, ...normalizeAiFlexibleBlocks({
      currentTime,
      offset,
      planningWindow,
      tasks,
      responseBlocks,
      repairNotes,
      suppressedTaskIds: new Set(
        tasks
          .filter((task) => Boolean(task.hardStartTime && task.hardEndTime))
          .map((task) => task.id)
      ),
      dropAppointments: true,
    })].sort(
      (left, right) =>
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    ),
    tasks
  );
}

function buildCanonicalReplanBlocks({
  currentTime,
  planningWindow,
  tasks,
  responseBlocks,
  suppressedTaskIds,
  repairNotes,
}: {
  currentTime: string;
  planningWindow: DayPlan["planningWindow"];
  tasks: Task[];
  responseBlocks: PlannerAiResponseScheduleBlock[];
  suppressedTaskIds: Set<string>;
  repairNotes: string[];
}) {
  return normalizeAiFlexibleBlocks({
    currentTime,
    offset: extractOffset(planningWindow.startTime),
    planningWindow,
    tasks,
    responseBlocks,
    repairNotes,
    suppressedTaskIds,
    dropAppointments: true,
  });
}

function normalizeAiFlexibleBlocks({
  currentTime,
  offset,
  planningWindow,
  tasks,
  responseBlocks,
  repairNotes,
  suppressedTaskIds,
  dropAppointments,
}: {
  currentTime: string;
  offset: string;
  planningWindow: DayPlan["planningWindow"];
  tasks: Task[];
  responseBlocks: PlannerAiResponseScheduleBlock[];
  repairNotes: string[];
  suppressedTaskIds: Set<string>;
  dropAppointments: boolean;
}) {
  const taskById = new Map(tasks.map((task) => [task.id, task] as const));
  const seenBlockIds = new Set<string>();
  const planningStartMs = new Date(planningWindow.startTime).getTime();
  const planningEndMs = new Date(planningWindow.endTime).getTime();
  const currentMs = new Date(currentTime).getTime();

  return responseBlocks.flatMap((block, index) => {
    const task = block.taskId ? taskById.get(block.taskId) : undefined;
    const blockLabel = describeAiResponseBlock(block, task);

    if (
      dropAppointments &&
      (block.blockType === "appointment" || block.locked)
    ) {
      repairNotes.push(
        `Dropped the model-owned locked block "${blockLabel}" so canonical anchors stay app-owned.`
      );
      return [];
    }

    if (block.taskId && suppressedTaskIds.has(block.taskId)) {
      repairNotes.push(
        `Dropped "${blockLabel}" because it targeted a completed, skipped, or fixed-time task.`
      );
      return [];
    }

    if (block.taskId && !task) {
      repairNotes.push(
        `Dropped "${blockLabel}" because it referenced an unknown task id "${block.taskId}".`
      );
      return [];
    }

    const startMs = new Date(block.startTime).getTime();
    const endMs = new Date(block.endTime).getTime();

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      repairNotes.push(`Dropped "${blockLabel}" because its time range could not be parsed.`);
      return [];
    }

    const normalizedId =
      !block.id || seenBlockIds.has(block.id)
        ? buildFallbackBlockId(block, index)
        : block.id;

    if (normalizedId !== block.id) {
      repairNotes.push(`Regenerated a duplicate or empty block id for "${blockLabel}".`);
    }

    seenBlockIds.add(normalizedId);

    return [
      {
        id: normalizedId,
        taskId: block.taskId ?? undefined,
        title: task?.title || block.title || describeAiResponseBlock(block, task),
        blockType: task ? mapTaskToBlockType(task) : block.blockType,
        startTime:
          startMs < planningStartMs || startMs > planningEndMs
            ? formatIsoWithOffset(startMs, offset)
            : block.startTime,
        endTime:
          endMs < planningStartMs || endMs > planningEndMs
            ? formatIsoWithOffset(endMs, offset)
            : block.endTime,
        status: startMs < currentMs ? "upcoming" : "upcoming",
        locked: false,
        source: "ai",
        isBreakEligibleTaskPlacement: block.isBreakEligibleTaskPlacement ?? undefined,
        notes: block.notes ?? undefined,
      } satisfies ScheduleBlock,
    ];
  });
}

function buildCandidateReplanUnplacedTasks(
  tasks: Task[],
  droppedTaskIds: string[],
  carryForwardTaskIds: string[]
) {
  const candidateTaskIds = new Set([...droppedTaskIds, ...carryForwardTaskIds]);

  return tasks.flatMap((task) => {
    if (!candidateTaskIds.has(task.id)) {
      return [];
    }

    return [
      {
        taskId: task.id,
        title: task.title,
        remainingMinutes: task.estimatedMinutes,
        reason: task.deferrable ? "lower_priority_deferred" : "did_not_fit_today",
      } satisfies UnplacedTask,
    ];
  });
}

function buildReplanSummary({
  clippedActiveBlock,
  currentTime,
  dayPlan,
  carryForwardItems,
  preservedAnchorCount,
  preservedHistoryCount,
  replanMode,
  usedProductiveBreaks,
}: {
  clippedActiveBlock: boolean;
  currentTime: string;
  dayPlan: DayPlan;
  carryForwardItems: DraftScheduleResponse["carryForwardItems"];
  preservedAnchorCount: number;
  preservedHistoryCount: number;
  replanMode: ReplanPreview["mode"];
  usedProductiveBreaks: boolean;
}): ReplanPreview["summary"] {
  const currentMs = new Date(currentTime).getTime();
  const revisedBlockCount = dayPlan.blocks.filter(
    (block) => !block.locked && new Date(block.startTime).getTime() >= currentMs
  ).length;
  const stayedOutTaskCount = carryForwardItems.length;
  const deferredOptionalTaskCount = carryForwardItems.filter(
    (item) => item.unplacedReason === "lower_priority_deferred"
  ).length;
  const forcedUnplacedTaskCount =
    stayedOutTaskCount - deferredOptionalTaskCount;
  const summaryLines = [
    `Preserved ${preservedHistoryCount} history blocks and ${preservedAnchorCount} locked anchors.`,
    `Revised ${revisedBlockCount} remaining blocks from the current time boundary.`,
  ];

  if (clippedActiveBlock) {
    summaryLines.push("The active block was clipped before the rest of the day was rebuilt.");
  }

  if (stayedOutTaskCount > 0) {
    if (deferredOptionalTaskCount > 0 && forcedUnplacedTaskCount > 0) {
      summaryLines.push(
        `${deferredOptionalTaskCount} optional tasks were carried forward first and ${forcedUnplacedTaskCount} tasks still could not stay in today.`
      );
    } else if (deferredOptionalTaskCount > 0) {
      summaryLines.push(
        `${deferredOptionalTaskCount} optional tasks were carried forward out of the revised remainder.`
      );
    } else {
      summaryLines.push(
        `${forcedUnplacedTaskCount} tasks were carried forward because they no longer plausibly fit inside the revised remainder.`
      );
    }
  }

  if (usedProductiveBreaks) {
    summaryLines.push("Some low-effort work was placed inside productive-break windows.");
  }

  if (replanMode === "keep_essentials_only") {
    summaryLines.push("Optional and lower-priority work was deferred before essential work.");
  } else if (replanMode === "gentler_remainder") {
    summaryLines.push("The remainder was rebuilt more conservatively with extra breathing room.");
  } else if (replanMode === "preserve_focus_first") {
    summaryLines.push("Remaining focus work was protected ahead of lighter tasks.");
  }

  return {
    clippedActiveBlock,
    deferredOptionalTaskCount,
    forcedUnplacedTaskCount,
    preservedAnchorCount,
    preservedHistoryCount,
    productiveBreaksUsed: usedProductiveBreaks,
    revisedBlockCount,
    stayedOutTaskCount,
    summaryLines,
  };
}

function clampHardEventToPlanningWindow(
  hardEvent: HardEvent,
  planningWindow: DayPlan["planningWindow"]
) {
  const planningStartMs = new Date(planningWindow.startTime).getTime();
  const planningEndMs = new Date(planningWindow.endTime).getTime();
  const startMs = new Date(hardEvent.startTime).getTime();
  const endMs = new Date(hardEvent.endTime).getTime();

  if (endMs <= planningStartMs || startMs >= planningEndMs) {
    return [] as HardEvent[];
  }

  return [
    {
      ...hardEvent,
      startTime:
        startMs < planningStartMs ? planningWindow.startTime : hardEvent.startTime,
      endTime:
        endMs > planningEndMs ? planningWindow.endTime : hardEvent.endTime,
    },
  ];
}

function buildFallbackBlockId(block: PlannerAiResponseScheduleBlock, index: number) {
  const fallbackSlug = slugify(block.title ?? "") || "free";
  return `block-ai-${block.taskId ?? fallbackSlug}-${index + 1}`;
}

function mapTaskToBlockType(task: Task): ScheduleBlock["blockType"] {
  switch (task.type) {
    case "deep_work":
      return "focus";
    case "admin":
      return "admin";
    case "chore":
    case "errand":
      return "chore";
    case "self_care":
      return "self_care";
    default:
      return "other";
  }
}

function countFlexibleBlocks(
  blocks: Array<Pick<PlannerAiResponseScheduleBlock, "blockType" | "locked" | "taskId">>,
  tasks: Task[]
) {
  const fixedTaskIds = new Set(
    tasks
      .filter((task) => Boolean(task.hardStartTime && task.hardEndTime))
      .map((task) => task.id)
  );

  return blocks.filter(
    (block) =>
      block.blockType !== "appointment" &&
      !block.locked &&
      (!block.taskId || !fixedTaskIds.has(block.taskId))
  ).length;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function describeAiResponseBlock(
  block: PlannerAiResponseScheduleBlock,
  task?: Task
) {
  if (task?.title) {
    return task.title;
  }

  if (block.title) {
    return block.title;
  }

  if (block.taskId) {
    return block.taskId;
  }

  return block.blockType.replace(/_/g, " ");
}

function dedupeStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

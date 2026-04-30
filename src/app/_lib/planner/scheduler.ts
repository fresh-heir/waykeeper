import type {
  BreakCadence,
  BreakMode,
  CarryForwardItem,
  DayPlan,
  DraftScheduleResponse,
  DueWarning,
  HardEvent,
  MockPlannerState,
  PaceMode,
  PlanningWindow,
  Priority,
  ReplanChangeSummary,
  ReplanMode,
  ScheduleBlock,
  ScheduleBlockStatus,
  Task,
  UnplacedTask,
} from "@/app/_lib/planner-types";
import { DEFAULT_BREAK_CADENCE } from "@/app/_lib/planner-types";
import {
  applyCarryForwardStateToTasks,
  buildCarryForwardProjection,
  deriveScheduledDueWarnings,
} from "@/app/_lib/planner/carry-forward";
import {
  extractOffset,
  formatIsoWithOffset,
} from "@/app/_lib/planner/date-time";
import {
  inferTaskRouteFlowContext,
} from "@/app/_lib/planner/route-flow";

interface GenerateDraftScheduleInput {
  breakCadence: BreakCadence;
  breakMode: BreakMode;
  paceMode: PaceMode;
  currentTime: string;
  hardEvents: HardEvent[];
  planner: MockPlannerState;
  planningWindow: PlanningWindow;
  rawText: string;
  tasks: Task[];
}

interface Slot {
  startMs: number;
  endMs: number;
}

interface VisibleAnchor {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  notes?: string;
  source: HardEvent["source"];
}

interface FixedTaskConstraint {
  endMs: number;
  startMs: number;
  task: Task;
}

interface BusyWindow {
  endMs: number;
  startMs: number;
}

interface PendingTask {
  originalIndex: number;
  remainingMinutes: number;
  task: Task;
  chunksPlaced: number;
}

interface PlacementCandidate {
  chunkMinutes: number;
  taskState: PendingTask;
}

interface BreakWindowPlacement {
  block: ScheduleBlock;
  consumedTaskId?: string;
}

interface TimelineWindow {
  endMs: number;
  startMs: number;
}

interface DayPlanMutationResult {
  changed: boolean;
  dayPlan: DayPlan;
  warning?: string;
}

interface ReplanModeOptions {
  allowProductiveBreaks: boolean;
  breakMode: BreakMode;
  focusBlocksBeforeBreak: number;
  focusMinutesBeforeBreak: number;
  maxBreakMinutes: number;
  minBreakMinutes: number;
  minChunkMinutes: number;
}

interface BreakCadenceSettings {
  focusBlocksBeforeBreak: number;
  focusMinutesBeforeBreak: number;
  maxBreakMinutes: number;
  minBreakMinutes: number;
  minChunkMinutes: number;
}

interface ReplanRemainingDayInput {
  currentTime: string;
  dayPlan: DayPlan;
  replanMode: ReplanMode;
}

interface ReplanRemainingDayResult {
  dayPlan: DayPlan;
  summary: ReplanChangeSummary;
  unplacedTasks: UnplacedTask[];
  carryForwardItems: CarryForwardItem[];
  carryForwardTaskIds: string[];
  dueWarnings: DueWarning[];
  warnings: string[];
}

interface SplitRouteAtCurrentTimeResult {
  activeTaskId: string | null;
  clippedActiveBlock: boolean;
  completedTaskIds: Set<string>;
  suppressedTaskIds: Set<string>;
  futureLockedBlocks: ScheduleBlock[];
  historyBlocks: ScheduleBlock[];
  preservedAnchorCount: number;
  preservedHistoryCount: number;
  queuedTasks: PendingTask[];
}

interface RebuildRemainingFlexibleBlocksResult {
  rebuiltBlocks: ScheduleBlock[];
  unplacedTasks: UnplacedTask[];
  usedProductiveBreaks: boolean;
}

interface RouteFlowSummary {
  cognitiveCounts: Map<ReturnType<typeof inferTaskRouteFlowContext>["cognitiveMode"], number>;
  locationCounts: Map<ReturnType<typeof inferTaskRouteFlowContext>["locationContext"], number>;
}

export type DayPlanCurrentTimeState =
  | "scheduled_block"
  | "before_first_block"
  | "between_blocks"
  | "after_last_block"
  | "terminal_history_overlap"
  | "outside_planning_window"
  | "no_route";

export interface DayPlanExecutionSnapshot {
  aheadBlocks: ScheduleBlock[];
  currentActionableBlock: ScheduleBlock | null;
  currentDisplayBlock: ScheduleBlock | null;
  currentTimeState: DayPlanCurrentTimeState;
  currentScheduledBlock: ScheduleBlock | null;
  doneBlocks: ScheduleBlock[];
  expiredBlocks: ScheduleBlock[];
  nextBlock: ScheduleBlock | null;
  skippedBlocks: ScheduleBlock[];
  timelineBlocks: ScheduleBlock[];
}

export interface TaskMinuteLedgerEntry {
  task: Task;
  historyMinutes: number;
  futurePlacedMinutes: number;
  remainingCarriedForwardMinutes: number;
  remainingUnplacedMinutes: number;
  scheduledMinutes: number;
  isCompleted: boolean;
}

const TERMINAL_STATUSES = new Set<ScheduleBlockStatus>([
  "deferred",
  "done",
  "skipped",
]);

const DELAY_PRESET_MINUTES = new Set([10, 15, 30]);

const OPEN_TIME_TITLE = "Open time";
const SYNTHETIC_SPLIT_NOTES = new Set([
  "Split into a meaningful focus chunk to preserve the day route.",
  "Revised into a readable focus chunk.",
]);
const ROUTE_COHERENCE_PROTECTION_TOLERANCE = 12;

function getBreakCadenceSettings(
  breakCadence: BreakCadence | undefined
): BreakCadenceSettings {
  switch (breakCadence ?? DEFAULT_BREAK_CADENCE) {
    case "focus_25":
      return {
        focusBlocksBeforeBreak: 1,
        focusMinutesBeforeBreak: 25,
        maxBreakMinutes: 5,
        minBreakMinutes: 5,
        minChunkMinutes: 20,
      };
    case "focus_45":
      return {
        focusBlocksBeforeBreak: 1,
        focusMinutesBeforeBreak: 45,
        maxBreakMinutes: 10,
        minBreakMinutes: 5,
        minChunkMinutes: 25,
      };
    case "focus_90":
      return {
        focusBlocksBeforeBreak: 1,
        focusMinutesBeforeBreak: 90,
        maxBreakMinutes: 15,
        minBreakMinutes: 10,
        minChunkMinutes: 30,
      };
    case "focus_50":
    default:
      return {
        focusBlocksBeforeBreak: 1,
        focusMinutesBeforeBreak: 50,
        maxBreakMinutes: 10,
        minBreakMinutes: 5,
        minChunkMinutes: 30,
      };
  }
}

export function generateDraftSchedule({
  breakCadence,
  breakMode,
  paceMode,
  currentTime,
  hardEvents,
  planner,
  planningWindow,
  rawText,
  tasks,
}: GenerateDraftScheduleInput): DraftScheduleResponse {
  const warnings: string[] = [];
  const windowStartMs = new Date(planningWindow.startTime).getTime();
  const windowEndMs = new Date(planningWindow.endTime).getTime();
  const offset = extractOffset(planningWindow.startTime);
  const completedTaskIds = new Set(planner.dayPlan.completedTaskIds ?? []);
  const incompleteTasks = tasks.filter(
    (task) => !completedTaskIds.has(task.id)
  );
  const visibleAnchors = clampAnchors(hardEvents, planningWindow);
  const fixedTaskConstraints = buildFixedTaskConstraints(incompleteTasks);
  const anchorBlocks = visibleAnchors.map((anchor) =>
    createAnchorBlock(anchor, offset)
  );
  const fixedTaskBlocks = fixedTaskConstraints.map((constraint) =>
    createFixedTaskBlock(constraint.task)
  );
  const slots = buildAvailableSlots(windowStartMs, windowEndMs, [
    ...visibleAnchors.map((anchor) => ({
      startMs: anchor.startMs,
      endMs: anchor.endMs,
    })),
    ...fixedTaskConstraints.map((constraint) => ({
      startMs: constraint.startMs,
      endMs: constraint.endMs,
    })),
  ]);
  const queue = sortTasks(
    incompleteTasks.filter((task) => !task.hardStartTime || !task.hardEndTime)
  , planningWindow.startTime).map((task, originalIndex) => ({
    originalIndex,
    remainingMinutes: task.estimatedMinutes,
    task,
    chunksPlaced: 0,
  }));
  const routeContextByTaskId = buildRouteContextByTaskId(incompleteTasks);
  const blocks: ScheduleBlock[] = [...anchorBlocks, ...fixedTaskBlocks];
  const blockIndexByTaskId = new Map<string, number>();
  const cadenceSettings = getBreakCadenceSettings(breakCadence);
  let focusMinutesSinceBreak = 0;
  let focusBlocksSinceBreak = 0;
  let pendingBreakMinutes = 0;
  let breakWindowsCreated = 0;

  slots.forEach((slot) => {
    let cursorMs = slot.startMs;
    let lastPlacedTask: Task | null = null;

    while (cursorMs < slot.endMs) {
      const slotMinutesRemaining = diffMinutes(cursorMs, slot.endMs);

      if (slotMinutesRemaining < 10) {
        break;
      }

      if (pendingBreakMinutes > 0) {
        const breakPlacement = createBreakPlacement(
          breakMode,
          breakWindowsCreated,
          pendingBreakMinutes,
          cursorMs,
          slot.endMs,
          queue,
          offset,
          blockIndexByTaskId,
          cadenceSettings.minBreakMinutes
        );

        if (!breakPlacement) {
          break;
        }

        blocks.push(breakPlacement.block);
        cursorMs = new Date(breakPlacement.block.endTime).getTime();
        pendingBreakMinutes = 0;
        breakWindowsCreated += 1;
        focusMinutesSinceBreak = 0;
        focusBlocksSinceBreak = 0;

        if (breakPlacement.consumedTaskId) {
          removeCompletedTasks(queue);
        }

        continue;
      }

      const placement = findNextTaskPlacement(
        queue,
        cursorMs,
        slot.endMs,
        windowEndMs,
        cadenceSettings,
        focusMinutesSinceBreak,
        lastPlacedTask,
        routeContextByTaskId
      );

      if (!placement) {
        break;
      }

      const block = createTaskBlock(
        placement.taskState,
        placement.chunkMinutes,
        cursorMs,
        offset
      );

      blocks.push(block);
      cursorMs = new Date(block.endTime).getTime();
      placement.taskState.remainingMinutes -= placement.chunkMinutes;
      placement.taskState.chunksPlaced += 1;
      lastPlacedTask = placement.taskState.task;

      if (block.taskId) {
        blockIndexByTaskId.set(block.taskId, blockIndexByTaskId.get(block.taskId) ?? 0);
      }

      if (block.blockType === "focus") {
        focusMinutesSinceBreak += placement.chunkMinutes;
        focusBlocksSinceBreak += 1;

        if (
          focusMinutesSinceBreak >= cadenceSettings.focusMinutesBeforeBreak ||
          focusBlocksSinceBreak >= cadenceSettings.focusBlocksBeforeBreak
        ) {
          pendingBreakMinutes = cadenceSettings.maxBreakMinutes;
        }
      } else if (block.blockType === "self_care" || block.blockType === "break") {
        focusMinutesSinceBreak = 0;
        focusBlocksSinceBreak = 0;
        pendingBreakMinutes = 0;
      }

      removeCompletedTasks(queue);
    }
  });

  const unplacedTasks = buildUnplacedTasks(queue);

  if (visibleAnchors.length > 0 && slots.every((slot) => diffMinutes(slot.startMs, slot.endMs) < 30)) {
    warnings.push("Fixed anchors leave very little open space, so the route stays intentionally conservative.");
  }

  const normalizedBaseBlocks = normalizeTaskChunkPresentation(
    [...blocks].sort(
      (left, right) =>
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    ),
    tasks
  );
  const pacedBlocks = applyPaceModeToFlexibleBlocks({
    paceMode,
    flexibleBlocks: normalizedBaseBlocks.filter((block) => !block.locked),
    lockedBlocks: normalizedBaseBlocks.filter((block) => block.locked),
    windowStartMs,
    windowEndMs,
    offset,
  });
  const pacedDayBlocks = [
    ...normalizedBaseBlocks.filter((block) => block.locked),
    ...pacedBlocks,
  ].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
  const baseDayPlan = synchronizeDayPlanToCurrentTime(
    {
      ...planner.dayPlan,
      planningWindow,
      rawInput: {
        ...planner.dayPlan.rawInput,
        rawText,
      },
      tasks,
      hardEvents,
      blocks: pacedDayBlocks,
      breakMode,
      breakCadence,
      paceMode,
      completedTaskIds: planner.dayPlan.completedTaskIds ?? [],
      updatedAt: currentTime,
    },
    currentTime
  );
  const carryForwardProjection = buildCarryForwardProjection({
    carryForwardReason: "overflow",
    carriedFromDate: baseDayPlan.date,
    dayPlan: baseDayPlan,
    sourceTasks: tasks,
    unplacedTasks,
  });
  const dayPlan = synchronizeDayPlanToCurrentTime(
    {
      ...baseDayPlan,
      tasks: applyCarryForwardStateToTasks({
        carryForwardItems: carryForwardProjection.carryForwardItems,
        carriedFromDate: baseDayPlan.date,
        sourceTasks: baseDayPlan.tasks,
      }),
    },
    currentTime
  );
  const dueWarnings = [
    ...deriveScheduledDueWarnings(dayPlan),
    ...carryForwardProjection.dueWarnings,
  ];

  if (carryForwardProjection.carryForwardItems.length > 0) {
    warnings.push(
      "Not everything fit inside this planning window, so overflow was carried forward explicitly."
    );
  }

  return {
    dayPlan,
    unplacedTasks: carryForwardProjection.unplacedTasks,
    carryForwardItems: carryForwardProjection.carryForwardItems,
    carryForwardTaskIds: carryForwardProjection.carryForwardTaskIds,
    dueWarnings,
    warnings: [...warnings, ...dueWarnings.map((warning) => warning.message)],
  };
}

export function replanRemainingDay({
  currentTime,
  dayPlan,
  replanMode,
}: ReplanRemainingDayInput): ReplanRemainingDayResult {
  const synchronizedDayPlan = synchronizeDayPlanToCurrentTime(dayPlan, currentTime);
  const splitRoute = splitRouteAtCurrentTime(synchronizedDayPlan, currentTime);
  const planningWindowEndMs = new Date(dayPlan.planningWindow.endTime).getTime();
  const effectiveStartMs = Math.max(
    new Date(currentTime).getTime(),
    new Date(dayPlan.planningWindow.startTime).getTime()
  );
  const openSlots = buildAvailableSlots(
    Math.min(effectiveStartMs, planningWindowEndMs),
    planningWindowEndMs,
    splitRoute.futureLockedBlocks.map((block) => ({
      startMs: new Date(block.startTime).getTime(),
      endMs: new Date(block.endTime).getTime(),
    }))
  );
  const availableMinutes = openSlots.reduce(
    (total, slot) => total + diffMinutes(slot.startMs, slot.endMs),
    0
  );
  const {
    queuedTasks,
    modeOptions,
    preDeferredTasks,
  } = applyReplanMode(
    splitRoute.queuedTasks,
    replanMode,
    availableMinutes,
    dayPlan.breakMode,
    dayPlan.breakCadence,
    currentTime
  );
  const prioritizedQueuedTasks = prioritizeBoundaryTask(
    queuedTasks,
    splitRoute.activeTaskId
  );
  const {
    rebuiltBlocks,
    unplacedTasks: rebuiltUnplacedTasks,
    usedProductiveBreaks,
  }: RebuildRemainingFlexibleBlocksResult = rebuildRemainingFlexibleBlocks({
    boundaryTaskId: splitRoute.activeTaskId,
    currentTime,
    futureLockedBlocks: splitRoute.futureLockedBlocks,
    modeOptions,
    planningWindow: dayPlan.planningWindow,
    preservedBlocks: [...splitRoute.historyBlocks, ...splitRoute.futureLockedBlocks],
    queuedTasks: prioritizedQueuedTasks,
  });
  const unplacedTasks = reconcileReplannedUnplacedTasks({
    candidateUnplacedTasks: [
    ...preDeferredTasks,
    ...rebuiltUnplacedTasks,
    ],
    preservedHistoryBlocks: splitRoute.historyBlocks,
    futureLockedBlocks: splitRoute.futureLockedBlocks,
    queuedTasks: prioritizedQueuedTasks,
    rebuiltBlocks,
  });
  const provisionalDayPlan = synchronizeDayPlanToCurrentTime(
    {
      ...dayPlan,
      blocks: [
        ...splitRoute.historyBlocks,
        ...splitRoute.futureLockedBlocks,
        ...applyPaceModeToFlexibleBlocks({
          paceMode: dayPlan.paceMode,
          flexibleBlocks: normalizeTaskChunkPresentation(rebuiltBlocks, dayPlan.tasks),
          lockedBlocks: splitRoute.futureLockedBlocks,
          windowStartMs: effectiveStartMs,
          windowEndMs: planningWindowEndMs,
          offset: extractOffset(dayPlan.planningWindow.startTime),
        }),
      ].sort(
        (left, right) =>
          new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
      ),
      completedTaskIds: [...splitRoute.completedTaskIds],
      updatedAt: currentTime,
    },
    currentTime
  );
  const carryForwardProjection = buildCarryForwardProjection({
    carryForwardReason: "replan_overflow",
    carriedFromDate: dayPlan.date,
    dayPlan: provisionalDayPlan,
    sourceTasks: dayPlan.tasks,
    unplacedTasks,
  });
  const nextDayPlan = synchronizeDayPlanToCurrentTime(
    {
      ...provisionalDayPlan,
      tasks: applyCarryForwardStateToTasks({
        carryForwardItems: carryForwardProjection.carryForwardItems,
        carriedFromDate: dayPlan.date,
        sourceTasks: dayPlan.tasks,
      }),
    },
    currentTime
  );
  const dueWarnings = [
    ...deriveScheduledDueWarnings(nextDayPlan),
    ...carryForwardProjection.dueWarnings,
  ];
  const warnings = buildReplanWarnings(
    replanMode,
    carryForwardProjection.carryForwardItems,
    splitRoute.clippedActiveBlock,
    usedProductiveBreaks,
    availableMinutes
  );

  return {
    dayPlan: nextDayPlan,
    summary: summarizeReplanChanges({
      clippedActiveBlock: splitRoute.clippedActiveBlock,
      currentTime,
      dayPlan: nextDayPlan,
      carryForwardItems: carryForwardProjection.carryForwardItems,
      preservedAnchorCount: splitRoute.preservedAnchorCount,
      preservedHistoryCount: splitRoute.preservedHistoryCount,
      replanMode,
      usedProductiveBreaks,
    }),
    unplacedTasks: carryForwardProjection.unplacedTasks,
    carryForwardItems: carryForwardProjection.carryForwardItems,
    carryForwardTaskIds: carryForwardProjection.carryForwardTaskIds,
    dueWarnings,
    warnings: [...warnings, ...dueWarnings.map((warning) => warning.message)],
  };
}

function splitRouteAtCurrentTime(
  dayPlan: DayPlan,
  currentTime: string
): SplitRouteAtCurrentTimeResult {
  const currentMs = new Date(currentTime).getTime();
  const planningStartMs = new Date(dayPlan.planningWindow.startTime).getTime();
  const planningEndMs = new Date(dayPlan.planningWindow.endTime).getTime();
  const effectiveStartMs = Math.max(
    planningStartMs,
    Math.min(currentMs, planningEndMs)
  );
  const remainingMinutesByTaskId = buildUnscheduledTaskMinutesByTask(dayPlan);
  const completedTaskIds = new Set(dayPlan.completedTaskIds ?? []);
  const suppressedTaskIds = new Set(completedTaskIds);
  const historyBlocks: ScheduleBlock[] = [];
  const futureLockedBlocks: ScheduleBlock[] = [];
  let activeTaskId: string | null = null;
  let clippedActiveBlock = false;

  [...dayPlan.blocks]
    .sort(
      (left, right) =>
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    )
    .forEach((block) => {
      const startMs = new Date(block.startTime).getTime();
      const endMs = new Date(block.endTime).getTime();

      if (TERMINAL_STATUSES.has(block.status)) {
        if (block.status === "skipped" && block.taskId) {
          suppressedTaskIds.add(block.taskId);
        }
        if (shouldPreserveTerminalBlock(block, effectiveStartMs)) {
          historyBlocks.push(block);
        }
        return;
      }

      if (block.locked && endMs > effectiveStartMs) {
        futureLockedBlocks.push(block);
        return;
      }

      if (endMs <= effectiveStartMs) {
        if (block.taskId && !block.locked && !suppressedTaskIds.has(block.taskId)) {
          addRemainingMinutes(
            remainingMinutesByTaskId,
            block.taskId,
            diffMinutes(startMs, endMs)
          );
          return;
        }

        historyBlocks.push(block);
        return;
      }

      if (!block.locked && startMs < effectiveStartMs && effectiveStartMs < endMs) {
        const clippedHistoryBlock = createClippedHistoryBlock(block, currentTime);

        if (clippedHistoryBlock) {
          historyBlocks.push(clippedHistoryBlock);
          clippedActiveBlock = true;
          activeTaskId = block.taskId ?? null;
        }

        if (block.taskId && !suppressedTaskIds.has(block.taskId)) {
          addRemainingMinutes(
            remainingMinutesByTaskId,
            block.taskId,
            diffMinutes(effectiveStartMs, endMs)
          );
        }

        return;
      }

      if (block.taskId && !suppressedTaskIds.has(block.taskId)) {
        addRemainingMinutes(
          remainingMinutesByTaskId,
          block.taskId,
          diffMinutes(startMs, endMs)
        );
      }
    });

  return {
    activeTaskId,
    clippedActiveBlock,
    completedTaskIds,
    suppressedTaskIds,
    futureLockedBlocks,
    historyBlocks,
    preservedAnchorCount: futureLockedBlocks.length,
    preservedHistoryCount: historyBlocks.length,
    queuedTasks: buildRemainingTaskQueue(
      dayPlan.tasks,
      remainingMinutesByTaskId,
      suppressedTaskIds
    ),
  };
}

function createClippedHistoryBlock(block: ScheduleBlock, currentTime: string) {
  const startMs = new Date(block.startTime).getTime();
  const endMs = new Date(currentTime).getTime();

  if (endMs <= startMs) {
    return null;
  }

  return {
    ...block,
    endTime: currentTime,
    status: "expired" as const,
  };
}

function buildUnscheduledTaskMinutesByTask(dayPlan: DayPlan) {
  const scheduledMinutesByTaskId = new Map<string, number>();

  dayPlan.blocks.forEach((block) => {
    if (!block.taskId) {
      return;
    }

    addRemainingMinutes(
      scheduledMinutesByTaskId,
      block.taskId,
      diffMinutes(
        new Date(block.startTime).getTime(),
        new Date(block.endTime).getTime()
      )
    );
  });

  return new Map(
    dayPlan.tasks.map((task) => [
      task.id,
      Math.max(
        0,
        task.estimatedMinutes - (scheduledMinutesByTaskId.get(task.id) ?? 0)
      ),
    ])
  );
}

function buildRemainingTaskQueue(
  tasks: Task[],
  remainingMinutesByTaskId: Map<string, number>,
  suppressedTaskIds?: Set<string>
) {
  return tasks
    .map((task, originalIndex) => ({
      originalIndex,
      remainingMinutes: remainingMinutesByTaskId.get(task.id) ?? 0,
      task,
      chunksPlaced: 0,
    }))
    .filter(
      (taskState) =>
        taskState.remainingMinutes > 0 &&
        !suppressedTaskIds?.has(taskState.task.id)
    );
}

function applyReplanMode(
  queuedTasks: PendingTask[],
  replanMode: ReplanMode,
  availableMinutes: number,
  breakMode: BreakMode,
  breakCadence: BreakCadence | undefined,
  referenceTime: string
) {
  const preDeferredTasks: UnplacedTask[] = [];
  let nextTasks = [...queuedTasks];
  const cadenceSettings = getBreakCadenceSettings(breakCadence);
  const modeOptions: ReplanModeOptions = {
    allowProductiveBreaks: breakMode === "productive",
    breakMode,
    ...cadenceSettings,
  };

  switch (replanMode) {
    case "keep_essentials_only":
      nextTasks = deferMatchingTasks(
        nextTasks,
        (task) => task.deferrable && !task.mustDoToday,
        preDeferredTasks
      );
      break;
    case "gentler_remainder":
      modeOptions.focusBlocksBeforeBreak = 1;
      modeOptions.focusMinutesBeforeBreak = Math.min(
        modeOptions.focusMinutesBeforeBreak,
        60
      );
      modeOptions.maxBreakMinutes = Math.max(modeOptions.maxBreakMinutes, 10);
      modeOptions.minBreakMinutes = Math.min(modeOptions.minBreakMinutes, 5);
      nextTasks = deferTasksUntilTargetMinutes(
        nextTasks,
        Math.max(0, availableMinutes - 30),
        preDeferredTasks,
        {
          protectFocus: false,
        },
        referenceTime
      );
      break;
    case "use_productive_breaks":
      modeOptions.allowProductiveBreaks = true;
      modeOptions.breakMode = "productive";
      break;
    case "preserve_focus_first":
      nextTasks = deferTasksUntilTargetMinutes(
        nextTasks,
        availableMinutes,
        preDeferredTasks,
        {
          protectFocus: true,
        },
        referenceTime
      );
      break;
    case "replan_from_now":
    default:
      break;
  }

  return {
    modeOptions,
    preDeferredTasks,
    queuedTasks: sortPendingTasks(
      nextTasks,
      replanMode === "preserve_focus_first",
      referenceTime
    ),
  };
}

function deferMatchingTasks(
  queuedTasks: PendingTask[],
  shouldDefer: (task: Task) => boolean,
  preDeferredTasks: UnplacedTask[]
) {
  return queuedTasks.filter((taskState) => {
    if (!shouldDefer(taskState.task)) {
      return true;
    }

    preDeferredTasks.push({
      taskId: taskState.task.id,
      title: taskState.task.title,
      remainingMinutes: taskState.remainingMinutes,
      reason: "lower_priority_deferred",
    });
    return false;
  });
}

function deferTasksUntilTargetMinutes(
  queuedTasks: PendingTask[],
  targetMinutes: number,
  preDeferredTasks: UnplacedTask[],
  options: {
    protectFocus: boolean;
  },
  referenceTime: string
) {
  const totalMinutes = queuedTasks.reduce(
    (total, taskState) => total + taskState.remainingMinutes,
    0
  );

  if (totalMinutes <= targetMinutes) {
    return queuedTasks;
  }

  const deferredTaskIds = new Set<string>();
  let remainingMinutes = totalMinutes;
  const candidates = [...queuedTasks]
    .filter((taskState) => taskState.task.deferrable)
    .sort((left, right) =>
      getReplanDeferralRank(right.task, options.protectFocus, referenceTime) -
      getReplanDeferralRank(left.task, options.protectFocus, referenceTime)
    );

  candidates.forEach((taskState) => {
    if (remainingMinutes <= targetMinutes) {
      return;
    }

    deferredTaskIds.add(taskState.task.id);
    remainingMinutes -= taskState.remainingMinutes;
    preDeferredTasks.push({
      taskId: taskState.task.id,
      title: taskState.task.title,
      remainingMinutes: taskState.remainingMinutes,
      reason: "lower_priority_deferred",
    });
  });

  return queuedTasks.filter((taskState) => !deferredTaskIds.has(taskState.task.id));
}

function getReplanDeferralRank(
  task: Task,
  protectFocus: boolean,
  referenceTime: string
) {
  let score = 0;

  if (!task.mustDoToday) {
    score += 40;
  }

  if (task.priority === "low") {
    score += 30;
  } else if (task.priority === "medium") {
    score += 20;
  } else if (task.priority === "high") {
    score += 8;
  }

  if (task.breakEligible) {
    score += 6;
  }

  if (task.type !== "deep_work") {
    score += 8;
  }

  if (protectFocus && task.type === "deep_work") {
    score -= 18;
  }

  if (task.type === "self_care") {
    score -= 20;
  }

  score += getCarryForwardEaseScore(task, referenceTime, protectFocus);

  return score;
}

function sortPendingTasks(
  queuedTasks: PendingTask[],
  prioritizeFocus: boolean,
  referenceTime: string
) {
  return [...queuedTasks].sort((left, right) => {
    const protectionDelta =
      getTaskProtectionScore(right.task, referenceTime, prioritizeFocus) -
      getTaskProtectionScore(left.task, referenceTime, prioritizeFocus);

    if (protectionDelta !== 0) {
      return protectionDelta;
    }

    return left.originalIndex - right.originalIndex;
  });
}

function prioritizeBoundaryTask(
  queuedTasks: PendingTask[],
  boundaryTaskId: string | null
) {
  if (!boundaryTaskId) {
    return queuedTasks;
  }

  return [...queuedTasks].sort((left, right) => {
    const leftIsBoundaryTask = left.task.id === boundaryTaskId;
    const rightIsBoundaryTask = right.task.id === boundaryTaskId;

    if (leftIsBoundaryTask === rightIsBoundaryTask) {
      return 0;
    }

    return leftIsBoundaryTask ? -1 : 1;
  });
}

function rebuildRemainingFlexibleBlocks({
  boundaryTaskId,
  currentTime,
  futureLockedBlocks,
  modeOptions,
  planningWindow,
  preservedBlocks,
  queuedTasks,
}: {
  boundaryTaskId: string | null;
  currentTime: string;
  futureLockedBlocks: ScheduleBlock[];
  modeOptions: ReplanModeOptions;
  planningWindow: PlanningWindow;
  preservedBlocks: ScheduleBlock[];
  queuedTasks: PendingTask[];
}) {
  const offset = extractOffset(planningWindow.startTime);
  const planningWindowEndMs = new Date(planningWindow.endTime).getTime();
  const effectiveStartMs = Math.max(
    new Date(currentTime).getTime(),
    new Date(planningWindow.startTime).getTime()
  );
  const slots = buildAvailableSlots(
    Math.min(effectiveStartMs, planningWindowEndMs),
    planningWindowEndMs,
    futureLockedBlocks.map((block) => ({
      startMs: new Date(block.startTime).getTime(),
      endMs: new Date(block.endTime).getTime(),
    }))
  );
  const blockIndexByTaskId = buildTaskBlockIndexByTaskId(preservedBlocks);
  const queue = queuedTasks.map((taskState) => ({
    ...taskState,
  }));
  const routeContextByTaskId = buildRouteContextByTaskId(
    queue.map((taskState) => taskState.task)
  );
  const rebuiltBlocks: ScheduleBlock[] = [];
  let focusMinutesSinceBreak = 0;
  let focusBlocksSinceBreak = 0;
  let pendingBreakMinutes = 0;
  let breakWindowsCreated = 0;
  let usedProductiveBreaks = false;

  slots.forEach((slot) => {
    let cursorMs = slot.startMs;
    let lastPlacedTask: Task | null = null;

    while (cursorMs < slot.endMs) {
      const slotMinutesRemaining = diffMinutes(cursorMs, slot.endMs);

      if (slotMinutesRemaining < 10) {
        break;
      }

      if (pendingBreakMinutes > 0) {
        const breakPlacement = createReplanBreakPlacement(
          cursorMs,
          slot.endMs,
          queue,
          offset,
          blockIndexByTaskId,
          modeOptions,
          breakWindowsCreated
        );

        if (!breakPlacement) {
          pendingBreakMinutes = 0;
          break;
        }

        rebuiltBlocks.push(breakPlacement.block);
        cursorMs = new Date(breakPlacement.block.endTime).getTime();
        pendingBreakMinutes = 0;
        breakWindowsCreated += 1;
        focusMinutesSinceBreak = 0;
        focusBlocksSinceBreak = 0;
        usedProductiveBreaks ||= Boolean(breakPlacement.consumedTaskId);

        if (breakPlacement.consumedTaskId) {
          removeCompletedTasks(queue);
        }

        continue;
      }

      const placement = findNextReplanTaskPlacement(
        queue,
        cursorMs,
        slot.endMs,
        planningWindowEndMs,
        modeOptions,
        focusMinutesSinceBreak,
        lastPlacedTask,
        routeContextByTaskId,
        boundaryTaskId
      );

      if (!placement) {
        break;
      }

      const block = createReplannedTaskBlock(
        placement.taskState,
        placement.chunkMinutes,
        cursorMs,
        offset,
        blockIndexByTaskId
      );

      rebuiltBlocks.push(block);
      cursorMs = new Date(block.endTime).getTime();
      placement.taskState.remainingMinutes -= placement.chunkMinutes;
      placement.taskState.chunksPlaced += 1;
      lastPlacedTask = placement.taskState.task;

      if (block.blockType === "focus") {
        focusMinutesSinceBreak += placement.chunkMinutes;
        focusBlocksSinceBreak += 1;

        if (
          focusMinutesSinceBreak >= modeOptions.focusMinutesBeforeBreak ||
          focusBlocksSinceBreak >= modeOptions.focusBlocksBeforeBreak
        ) {
          pendingBreakMinutes =
            focusMinutesSinceBreak >= 120
              ? modeOptions.maxBreakMinutes
              : Math.min(modeOptions.maxBreakMinutes, 15);
        }
      } else if (block.blockType === "self_care" || block.blockType === "break") {
        focusMinutesSinceBreak = 0;
        focusBlocksSinceBreak = 0;
        pendingBreakMinutes = 0;
      }

      removeCompletedTasks(queue);
    }
  });

  return {
    rebuiltBlocks,
    unplacedTasks: buildUnplacedTasks(queue),
    usedProductiveBreaks,
  };
}

function buildTaskBlockIndexByTaskId(blocks: ScheduleBlock[]) {
  const counts = new Map<string, number>();

  blocks.forEach((block) => {
    if (!block.taskId) {
      return;
    }

    counts.set(block.taskId, (counts.get(block.taskId) ?? 0) + 1);
  });

  return counts;
}

function createReplanBreakPlacement(
  cursorMs: number,
  slotEndMs: number,
  queue: PendingTask[],
  offset: string,
  blockIndexByTaskId: Map<string, number>,
  modeOptions: ReplanModeOptions,
  breakWindowsCreated: number
): BreakWindowPlacement | null {
  const breakMinutes = Math.min(modeOptions.maxBreakMinutes, diffMinutes(cursorMs, slotEndMs));

  if (breakMinutes < modeOptions.minBreakMinutes) {
    return null;
  }

  if (modeOptions.allowProductiveBreaks && breakWindowsCreated % 2 === 1) {
    const candidate = queue.find(
      (taskState) =>
        isLowEffortBreakTask(taskState.task) &&
        (taskState.remainingMinutes <= Math.min(15, breakMinutes) ||
          taskState.task.splittable ||
          taskState.task.breakEligible) &&
        Math.min(taskState.remainingMinutes, breakMinutes, 15) >=
          modeOptions.minBreakMinutes
    );

    if (candidate) {
      const nextIndex = (blockIndexByTaskId.get(candidate.task.id) ?? 0) + 1;
      const productiveBreakMinutes = Math.min(
        candidate.remainingMinutes,
        breakMinutes,
        15
      );
      const remainingAfterPlacement =
        candidate.remainingMinutes - productiveBreakMinutes;
      const showPartLabel =
        candidate.task.splittable &&
        (remainingAfterPlacement > 0 || nextIndex > 1);

      blockIndexByTaskId.set(candidate.task.id, nextIndex);
      candidate.remainingMinutes = remainingAfterPlacement;
      candidate.chunksPlaced += 1;

      return {
        block: {
          id: `block-replan-${candidate.task.id}-productive-break-${nextIndex}`,
          taskId: candidate.task.id,
          title: showPartLabel
            ? `${candidate.task.title} · part ${nextIndex}`
            : candidate.task.title,
          blockType: "break",
          startTime: formatIsoWithOffset(cursorMs, offset),
          endTime: formatIsoWithOffset(
            cursorMs + productiveBreakMinutes * 60000,
            offset
          ),
          status: "upcoming",
          locked: false,
          source: "mixed",
          isBreakEligibleTaskPlacement: true,
          notes: "Productive break window with a brief low-effort task.",
        },
        consumedTaskId: candidate.task.id,
      };
    }
  }

  return {
    block: {
      id: `block-replan-break-${cursorMs}`,
      title: breakMinutes >= 20 ? "Reset and breathe" : "Short break",
      blockType: "break",
      startTime: formatIsoWithOffset(cursorMs, offset),
      endTime: formatIsoWithOffset(cursorMs + breakMinutes * 60000, offset),
      status: "upcoming",
      locked: false,
      source: "system",
      notes: "Explicit break window.",
    },
  };
}

function findNextReplanTaskPlacement(
  queue: PendingTask[],
  cursorMs: number,
  slotEndMs: number,
  windowEndMs: number,
  modeOptions: ReplanModeOptions,
  focusMinutesSinceBreak: number,
  lastPlacedTask: Task | null,
  routeContextByTaskId: Map<string, ReturnType<typeof inferTaskRouteFlowContext>>,
  boundaryTaskId: string | null
) {
  const slotMinutesRemaining = diffMinutes(cursorMs, slotEndMs);
  const preferredCandidates: PlacementCandidate[] = [];
  const fallbackCandidates: PlacementCandidate[] = [];

  queue.forEach((taskState) => {
    if (shouldReserveForProductiveBreak(queue, taskState, modeOptions)) {
      return;
    }

    const chunkMinutes = getReplanChunkMinutes(
      taskState,
      slotMinutesRemaining,
      modeOptions,
      focusMinutesSinceBreak
    );

    if (!chunkMinutes) {
      return;
    }

    const targetList = isTooEarlyForTask(taskState.task, cursorMs, windowEndMs)
      ? fallbackCandidates
      : preferredCandidates;

    targetList.push({
      chunkMinutes,
      taskState,
    });
  });

  return (
    pickTaskPlacementCandidate({
      candidates: preferredCandidates,
      queue,
      referenceTime: new Date(cursorMs).toISOString(),
      routeContextByTaskId,
      lastPlacedTask,
      boundaryTaskId,
    }) ??
    pickTaskPlacementCandidate({
      candidates: fallbackCandidates,
      queue,
      referenceTime: new Date(cursorMs).toISOString(),
      routeContextByTaskId,
      lastPlacedTask,
      boundaryTaskId,
    }) ??
    null
  );
}

function shouldReserveForProductiveBreak(
  queue: PendingTask[],
  taskState: PendingTask,
  modeOptions: ReplanModeOptions
) {
  if (
    !modeOptions.allowProductiveBreaks ||
    !isLowEffortBreakTask(taskState.task) ||
    taskState.remainingMinutes < modeOptions.minBreakMinutes
  ) {
    return false;
  }

  return queue.some(
    (otherTaskState) =>
      otherTaskState.task.id !== taskState.task.id &&
      otherTaskState.remainingMinutes > 0 &&
      !isLowEffortBreakTask(otherTaskState.task)
  );
}

function getReplanChunkMinutes(
  taskState: PendingTask,
  slotMinutesRemaining: number,
  modeOptions: ReplanModeOptions,
  focusMinutesSinceBreak: number
) {
  const { remainingMinutes, task } = taskState;

  const breakAlignedChunkMinutes = getBreakAlignedFocusChunkMinutes(
    taskState,
    slotMinutesRemaining,
    focusMinutesSinceBreak,
    modeOptions.focusMinutesBeforeBreak,
    modeOptions.maxBreakMinutes,
    modeOptions.minBreakMinutes,
    modeOptions.minChunkMinutes
  );

  if (breakAlignedChunkMinutes) {
    return breakAlignedChunkMinutes;
  }

  if (!task.splittable || remainingMinutes <= 60) {
    return remainingMinutes <= slotMinutesRemaining ? remainingMinutes : null;
  }

  if (taskState.chunksPlaced >= 2) {
    return remainingMinutes <= slotMinutesRemaining ? remainingMinutes : null;
  }

  if (remainingMinutes <= slotMinutesRemaining && remainingMinutes <= 90) {
    return remainingMinutes;
  }

  if (slotMinutesRemaining < 30) {
    return null;
  }

  if (slotMinutesRemaining < modeOptions.minChunkMinutes) {
    return null;
  }

  const preferred = task.type === "deep_work"
    ? modeOptions.focusMinutesBeforeBreak <= 60
      ? 45
      : 60
    : 45;
  let chunkMinutes = Math.min(preferred, slotMinutesRemaining, 60);
  const remainder = remainingMinutes - chunkMinutes;

  if (remainder > 0 && remainder < modeOptions.minChunkMinutes) {
    chunkMinutes = remainingMinutes - modeOptions.minChunkMinutes;
  }

  if (chunkMinutes < modeOptions.minChunkMinutes) {
    return null;
  }

  return chunkMinutes;
}

function isLowEffortBreakTask(task: Task) {
  return task.breakEligible && task.energyLevel === "low" && task.type !== "deep_work";
}

function createReplannedTaskBlock(
  taskState: PendingTask,
  chunkMinutes: number,
  startMs: number,
  offset: string,
  blockIndexByTaskId: Map<string, number>
): ScheduleBlock {
  const endMs = startMs + chunkMinutes * 60000;
  const nextIndex = (blockIndexByTaskId.get(taskState.task.id) ?? 0) + 1;
  const remainingAfterPlacement = taskState.remainingMinutes - chunkMinutes;
  const showPartLabel =
    taskState.task.splittable && (remainingAfterPlacement > 0 || nextIndex > 1);

  blockIndexByTaskId.set(taskState.task.id, nextIndex);

  return {
    id: `block-replan-${taskState.task.id}-${nextIndex}`,
    taskId: taskState.task.id,
    title: showPartLabel
      ? `${taskState.task.title} · part ${nextIndex}`
      : taskState.task.title,
    blockType: mapTaskToBlockType(taskState.task),
    startTime: formatIsoWithOffset(startMs, offset),
    endTime: formatIsoWithOffset(endMs, offset),
    status: "upcoming",
    locked: false,
    source: "mixed",
    notes:
      taskState.task.type === "deep_work" && showPartLabel
        ? "Revised into a readable focus chunk."
        : undefined,
  };
}

function buildReplanWarnings(
  replanMode: ReplanMode,
  carryForwardItems: CarryForwardItem[],
  clippedActiveBlock: boolean,
  usedProductiveBreaks: boolean,
  availableMinutes: number
) {
  const warnings: string[] = [];

  if (availableMinutes <= 0) {
    warnings.push("No usable time remains inside today's planning window after this boundary.");
  }

  if (clippedActiveBlock) {
    warnings.push("The current block was clipped at the time boundary before the remainder was rebuilt.");
  }

  if (carryForwardItems.length > 0) {
    warnings.push("Some work was carried forward explicitly to keep today's revised remainder believable.");
  }

  if (
    replanMode === "keep_essentials_only" &&
    carryForwardItems.some((task) => task.unplacedReason === "lower_priority_deferred")
  ) {
    warnings.push("Lower-priority deferrable work was deferred before essential work was compressed.");
  }

  if (replanMode === "gentler_remainder") {
    warnings.push("The remainder was kept intentionally lighter, with more breathing room.");
  }

  if (usedProductiveBreaks) {
    warnings.push("Low-effort work was allowed inside some productive-break windows.");
  }

  return warnings;
}

function summarizeReplanChanges({
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
  carryForwardItems: CarryForwardItem[];
  preservedAnchorCount: number;
  preservedHistoryCount: number;
  replanMode: ReplanMode;
  usedProductiveBreaks: boolean;
}): ReplanChangeSummary {
  const currentMs = new Date(currentTime).getTime();
  const revisedBlockCount = dayPlan.blocks.filter(
    (block) => !block.locked && new Date(block.startTime).getTime() >= currentMs
  ).length;
  const stayedOutTaskCount = carryForwardItems.length;
  const deferredOptionalTaskCount = carryForwardItems.filter(
    (task) => task.unplacedReason === "lower_priority_deferred"
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

function dedupeUnplacedTasks(unplacedTasks: UnplacedTask[]) {
  const seen = new Map<string, UnplacedTask>();
  const reasonPriority: Record<UnplacedTask["reason"], number> = {
    lower_priority_deferred: 3,
    did_not_fit_today: 2,
    needs_longer_open_slot: 1,
  };

  unplacedTasks.forEach((task) => {
    if (!seen.has(task.taskId)) {
      seen.set(task.taskId, task);
      return;
    }

    const existing = seen.get(task.taskId)!;

    if (reasonPriority[task.reason] > reasonPriority[existing.reason]) {
      seen.set(task.taskId, task);
    }
  });

  return [...seen.values()];
}

function reconcileReplannedUnplacedTasks({
  candidateUnplacedTasks,
  preservedHistoryBlocks,
  futureLockedBlocks,
  queuedTasks,
  rebuiltBlocks,
}: {
  candidateUnplacedTasks: UnplacedTask[];
  preservedHistoryBlocks: ScheduleBlock[];
  futureLockedBlocks: ScheduleBlock[];
  queuedTasks: PendingTask[];
  rebuiltBlocks: ScheduleBlock[];
}) {
  const scheduledMinutesByTaskId = new Map<string, number>();

  [...preservedHistoryBlocks, ...futureLockedBlocks, ...rebuiltBlocks].forEach((block) => {
    if (!block.taskId) {
      return;
    }

    addRemainingMinutes(
      scheduledMinutesByTaskId,
      block.taskId,
      diffMinutes(
        new Date(block.startTime).getTime(),
        new Date(block.endTime).getTime()
      )
    );
  });

  const reconciledTasks = queuedTasks.flatMap((taskState) => {
    const scheduledMinutes = scheduledMinutesByTaskId.get(taskState.task.id) ?? 0;
    const remainingMinutes = Math.max(0, taskState.remainingMinutes - scheduledMinutes);

    if (remainingMinutes <= 0) {
      return [];
    }

    return [
      {
        taskId: taskState.task.id,
        title: taskState.task.title,
        remainingMinutes,
        reason:
          !taskState.task.splittable &&
          scheduledMinutes === 0 &&
          remainingMinutes === taskState.remainingMinutes
            ? "needs_longer_open_slot"
            : taskState.task.deferrable
              ? "lower_priority_deferred"
              : "did_not_fit_today",
      } satisfies UnplacedTask,
    ];
  });

  return dedupeUnplacedTasks([...candidateUnplacedTasks, ...reconciledTasks]);
}

function shouldPreserveTerminalBlock(
  block: ScheduleBlock,
  boundaryMs: number
) {
  const startMs = new Date(block.startTime).getTime();
  const endMs = new Date(block.endTime).getTime();

  return endMs <= boundaryMs || startMs <= boundaryMs;
}

function addRemainingMinutes(
  remainingMinutesByTaskId: Map<string, number>,
  taskId: string,
  minutes: number
) {
  if (minutes <= 0) {
    return;
  }

  remainingMinutesByTaskId.set(
    taskId,
    (remainingMinutesByTaskId.get(taskId) ?? 0) + minutes
  );
}

export function preserveExecutionHistoryOnRebuild(
  nextDayPlan: DayPlan,
  previousDayPlan: DayPlan,
  currentTime: string
): DayPlan {
  const currentMs = new Date(currentTime).getTime();
  const preservedBlocksById = new Map(
    previousDayPlan.blocks
      .filter(
        (block) =>
          (block.status === "done" || block.status === "skipped") &&
          shouldPreserveTerminalBlock(block, currentMs)
      )
      .map((block) => [block.id, block])
  );

  if (preservedBlocksById.size === 0) {
    return synchronizeDayPlanToCurrentTime(nextDayPlan, currentTime);
  }

  const blocks = nextDayPlan.blocks.map((block) => {
    const preservedBlock = preservedBlocksById.get(block.id);

    if (!preservedBlock) {
      return block;
    }

    return {
      ...block,
      startTime: preservedBlock.startTime,
      endTime: preservedBlock.endTime,
      status: preservedBlock.status,
    };
  });

  return synchronizeDayPlanToCurrentTime(
    {
      ...nextDayPlan,
      blocks,
      completedTaskIds: Array.from(
        new Set([
          ...(previousDayPlan.completedTaskIds ?? []),
          ...(nextDayPlan.completedTaskIds ?? []),
        ])
      ),
      updatedAt: currentTime,
    },
    currentTime
  );
}

export function synchronizeDayPlanToCurrentTime(dayPlan: DayPlan, currentTime: string): DayPlan {
  const currentMs = new Date(currentTime).getTime();
  let activeBlockId: string | undefined;

  const blocks = [...dayPlan.blocks]
    .sort(
      (left, right) =>
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    )
    .map((block) => {
    const startMs = new Date(block.startTime).getTime();
    const endMs = new Date(block.endTime).getTime();
    let status = block.status;

    if (TERMINAL_STATUSES.has(block.status)) {
      return block;
    }

    if (!activeBlockId && startMs <= currentMs && currentMs < endMs) {
      status = "active";
      activeBlockId = block.id;
    } else if (endMs <= currentMs) {
      status = "expired";
    } else {
      status = "upcoming";
    }

    return {
      ...block,
      status,
    };
  });

  return {
    ...dayPlan,
    activeBlockId,
    blocks,
  };
}

export function deriveDayPlanExecutionSnapshot(
  dayPlan: DayPlan,
  currentTime: string
): DayPlanExecutionSnapshot {
  const synchronizedDayPlan = synchronizeDayPlanToCurrentTime(dayPlan, currentTime);
  const hasRoute = synchronizedDayPlan.blocks.length > 0;
  const timelineBlocks = buildTimelineBlocksForDisplay(
    synchronizedDayPlan,
    currentTime
  );
  const currentScheduledBlock = hasRoute
    ? synchronizedDayPlan.blocks.find((block) => block.status === "active") ?? null
    : null;
  const openTimeState = currentScheduledBlock
    ? null
    : buildCurrentOpenTimeState(synchronizedDayPlan, currentTime);
  const currentDisplayBlock =
    currentScheduledBlock ??
    openTimeState?.block ??
    null;
  const nextBlock = hasRoute
    ? synchronizedDayPlan.blocks.find((block) => block.status === "upcoming") ?? null
    : null;

  return {
    aheadBlocks: hasRoute
      ? synchronizedDayPlan.blocks.filter((block) => block.status === "upcoming")
      : [],
    currentActionableBlock:
      currentScheduledBlock && !currentScheduledBlock.locked
        ? currentScheduledBlock
        : null,
    currentDisplayBlock,
    currentTimeState: currentScheduledBlock
      ? "scheduled_block"
      : openTimeState?.kind ?? (hasRoute ? "outside_planning_window" : "no_route"),
    currentScheduledBlock,
    doneBlocks: hasRoute
      ? synchronizedDayPlan.blocks.filter((block) => block.status === "done")
      : [],
    expiredBlocks: hasRoute
      ? synchronizedDayPlan.blocks.filter((block) => block.status === "expired")
      : [],
    nextBlock,
    skippedBlocks: hasRoute
      ? synchronizedDayPlan.blocks.filter((block) => block.status === "skipped")
      : [],
    timelineBlocks,
  };
}

export function markDayPlanBlockComplete(
  dayPlan: DayPlan,
  currentTime: string,
  blockId: string
): DayPlanMutationResult {
  const targetBlock = dayPlan.blocks.find((block) => block.id === blockId);

  if (!targetBlock) {
    return {
      changed: false,
      dayPlan,
    };
  }

  if (targetBlock.locked || !isBlockActiveAtTime(targetBlock, currentTime)) {
    return {
      changed: false,
      dayPlan,
      warning: "Only the current unlocked block can be marked complete right now.",
    };
  }

  const completedAtMs = new Date(currentTime).getTime();
  const completedTaskIds = targetBlock.taskId
    ? Array.from(new Set([...(dayPlan.completedTaskIds ?? []), targetBlock.taskId]))
    : (dayPlan.completedTaskIds ?? []);
  let clearedRemainingBlocks = 0;
  const blocks = dayPlan.blocks.flatMap((block) => {
    if (block.id === blockId) {
      const blockStartMs = new Date(block.startTime).getTime();

      if (completedAtMs <= blockStartMs) {
        return [];
      }

      return [
        {
          ...block,
          endTime: currentTime,
          status: "done" as const,
        },
      ];
    }

    if (
      targetBlock.taskId &&
      block.taskId === targetBlock.taskId &&
      !block.locked &&
      !TERMINAL_STATUSES.has(block.status) &&
      new Date(block.endTime).getTime() > completedAtMs
    ) {
      clearedRemainingBlocks += 1;
      return [];
    }

    return [block];
  });

  return {
    changed: true,
    dayPlan: synchronizeDayPlanToCurrentTime(
      {
        ...dayPlan,
        blocks,
        completedTaskIds,
        updatedAt: currentTime,
      },
      currentTime
    ),
    warning:
      clearedRemainingBlocks > 0
        ? `Marked "${targetBlock.title}" complete and cleared the rest of that task from the remaining route.`
        : undefined,
  };
}

export function skipDayPlanBlock(
  dayPlan: DayPlan,
  currentTime: string,
  blockId: string
): DayPlanMutationResult {
  const targetBlock = dayPlan.blocks.find((block) => block.id === blockId);

  if (!targetBlock) {
    return {
      changed: false,
      dayPlan,
    };
  }

  if (targetBlock.locked || !isBlockActiveAtTime(targetBlock, currentTime)) {
    return {
      changed: false,
      dayPlan,
      warning: "Only the current unlocked block can be skipped right now.",
    };
  }

  const shouldClipToCurrentTime = true;
  const clippedEndTime =
    shouldClipToCurrentTime &&
    new Date(currentTime).getTime() > new Date(targetBlock.startTime).getTime()
      ? currentTime
      : targetBlock.endTime;
  const skippedAtMs = new Date(currentTime).getTime();
  let clearedRemainingBlocks = 0;
  const blocks = dayPlan.blocks.flatMap((block) => {
    if (block.id === blockId) {
      return [
        {
          ...block,
          endTime: clippedEndTime,
          status: "skipped" as const,
        },
      ];
    }

    if (
      targetBlock.taskId &&
      block.taskId === targetBlock.taskId &&
      !block.locked &&
      !TERMINAL_STATUSES.has(block.status) &&
      new Date(block.endTime).getTime() > skippedAtMs
    ) {
      clearedRemainingBlocks += 1;
      return [];
    }

    return [block];
  });

  return {
    changed: true,
    dayPlan: synchronizeDayPlanToCurrentTime(
      {
        ...dayPlan,
        blocks,
        updatedAt: currentTime,
      },
      currentTime
    ),
    warning:
      clearedRemainingBlocks > 0
        ? `Skipped "${targetBlock.title}" and cleared the rest of that task from the remaining route.`
        : undefined,
  };
}

export function togglePastDayPlanBlockComplete(
  dayPlan: DayPlan,
  currentTime: string,
  blockId: string
): DayPlanMutationResult {
  const targetBlock = dayPlan.blocks.find((block) => block.id === blockId);

  if (!targetBlock) {
    return {
      changed: false,
      dayPlan,
    };
  }

  if (targetBlock.locked || !targetBlock.taskId) {
    return {
      changed: false,
      dayPlan,
      warning: "Only unlocked task blocks can be marked complete from the timeline.",
    };
  }

  if (targetBlock.status === "done") {
    return {
      changed: false,
      dayPlan,
    };
  }

  const completedAtMs = new Date(currentTime).getTime();
  const completedTaskIds = Array.from(
    new Set([...(dayPlan.completedTaskIds ?? []), targetBlock.taskId])
  );
  const shouldClipTargetBlock =
    isBlockActiveAtTime(targetBlock, currentTime) &&
    completedAtMs > new Date(targetBlock.startTime).getTime();
  let clearedRemainingBlocks = 0;
  const blocks = dayPlan.blocks.flatMap((block) => {
    if (block.id === blockId) {
      return [
        {
          ...block,
          endTime: shouldClipTargetBlock ? currentTime : block.endTime,
          status: "done" as const,
        },
      ];
    }

    if (
      block.taskId === targetBlock.taskId &&
      !block.locked &&
      !TERMINAL_STATUSES.has(block.status) &&
      new Date(block.endTime).getTime() > completedAtMs
    ) {
      clearedRemainingBlocks += 1;
      return [];
    }

    return [block];
  });

  return {
    changed: true,
    dayPlan: synchronizeDayPlanToCurrentTime(
      {
        ...dayPlan,
        blocks,
        completedTaskIds,
        updatedAt: currentTime,
      },
      currentTime
    ),
    warning:
      clearedRemainingBlocks > 0
        ? `Marked "${targetBlock.title}" complete and cleared the rest of that task from the remaining route.`
        : undefined,
  };
}

export function delayDayPlanBlock(
  dayPlan: DayPlan,
  currentTime: string,
  blockId: string,
  delayMinutes: number
): DayPlanMutationResult {
  if (!DELAY_PRESET_MINUTES.has(delayMinutes)) {
    return {
      changed: false,
      dayPlan,
      warning: "Delay is limited to 10, 15, or 30 minutes in this milestone.",
    };
  }

  const sortedBlocks = [...dayPlan.blocks].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
  const targetIndex = sortedBlocks.findIndex((block) => block.id === blockId);

  if (targetIndex < 0) {
    return {
      changed: false,
      dayPlan,
    };
  }

  const targetBlock = sortedBlocks[targetIndex];

  if (targetBlock.locked || targetBlock.status !== "active") {
    return {
      changed: false,
      dayPlan,
      warning: "Only the current unlocked block can be delayed right now.",
    };
  }

  const planningWindowEndMs = new Date(dayPlan.planningWindow.endTime).getTime();
  const delayMs = delayMinutes * 60000;
  const targetStartMs = new Date(targetBlock.startTime).getTime();
  const targetEndMs = new Date(targetBlock.endTime).getTime() + delayMs;

  if (targetEndMs > planningWindowEndMs) {
    return {
      changed: false,
      dayPlan,
      warning: `Couldn't delay "${targetBlock.title}" without pushing past the end of the day.`,
    };
  }

  const immovableWindows = sortedBlocks
    .slice(targetIndex + 1)
    .filter((block) => block.locked || TERMINAL_STATUSES.has(block.status))
    .map((block) => ({
      startMs: new Date(block.startTime).getTime(),
      endMs: new Date(block.endTime).getTime(),
    }))
    .sort((left, right) => left.startMs - right.startMs);

  if (
    immovableWindows.some(
      (window) => targetStartMs < window.endMs && targetEndMs > window.startMs
    )
  ) {
    const firstConflict = immovableWindows.find(
      (window) => targetStartMs < window.endMs && targetEndMs > window.startMs
    );

    if (firstConflict) {
      return {
        changed: false,
        dayPlan,
        warning: `Couldn't delay "${targetBlock.title}" without crossing a locked or already-finished block.`,
      };
    }
  }

  const blocksById = new Map(sortedBlocks.map((block) => [block.id, block]));
  blocksById.set(targetBlock.id, {
    ...targetBlock,
    endTime: formatIsoWithOffset(targetEndMs, extractOffset(targetBlock.endTime)),
    status: "active",
  });

  let cursorMs = targetEndMs;

  for (let index = targetIndex + 1; index < sortedBlocks.length; index += 1) {
    const block = sortedBlocks[index];

    if (block.locked || TERMINAL_STATUSES.has(block.status)) {
      continue;
    }

    const durationMs =
      new Date(block.endTime).getTime() - new Date(block.startTime).getTime();
    const earliestStartMs = Math.max(
      cursorMs,
      new Date(block.startTime).getTime()
    );
    const placementStartMs = findNextAvailableStart(
      earliestStartMs,
      durationMs,
      immovableWindows
    );
    const placementEndMs = placementStartMs + durationMs;

    if (placementEndMs > planningWindowEndMs) {
      return {
        changed: false,
        dayPlan,
        warning: `Couldn't delay "${targetBlock.title}" by ${delayMinutes} minutes without running out of room today.`,
      };
    }

    blocksById.set(block.id, {
      ...block,
      startTime: formatIsoWithOffset(
        placementStartMs,
        extractOffset(block.startTime)
      ),
      endTime: formatIsoWithOffset(
        placementEndMs,
        extractOffset(block.endTime)
      ),
    });
    cursorMs = placementEndMs;
  }

  return {
    changed: true,
    dayPlan: synchronizeDayPlanToCurrentTime(
      {
        ...dayPlan,
        blocks: sortedBlocks.map((block) => blocksById.get(block.id) ?? block),
        updatedAt: currentTime,
      },
      currentTime
    ),
  };
}

function buildTimelineBlocksForDisplay(dayPlan: DayPlan, currentTime: string) {
  const previewBlocks = buildPreviewAnchorBlocks(dayPlan, currentTime);
  return [...dayPlan.blocks, ...previewBlocks].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
}

function buildPreviewAnchorBlocks(dayPlan: DayPlan, currentTime: string) {
  const currentMs = new Date(currentTime).getTime();
  const offset = extractOffset(dayPlan.planningWindow.startTime);

  return clampAnchors(dayPlan.hardEvents, dayPlan.planningWindow)
    .filter((anchor) => !hasMatchingAppointmentBlock(anchor, dayPlan.blocks))
    .map((anchor) => createPreviewAnchorBlock(anchor, offset, currentMs));
}

function hasMatchingAppointmentBlock(
  anchor: VisibleAnchor,
  blocks: ScheduleBlock[]
) {
  return blocks.some(
    (block) =>
      block.blockType === "appointment" &&
      new Date(block.startTime).getTime() === anchor.startMs &&
      new Date(block.endTime).getTime() === anchor.endMs &&
      block.title === anchor.title
  );
}

function createPreviewAnchorBlock(
  anchor: VisibleAnchor,
  offset: string,
  currentMs: number
): ScheduleBlock {
  return {
    id: `preview-${anchor.id}`,
    title: anchor.title,
    blockType: "appointment",
    startTime: formatIsoWithOffset(anchor.startMs, offset),
    endTime: formatIsoWithOffset(anchor.endMs, offset),
    status: getDisplayStatus(anchor.startMs, anchor.endMs, currentMs),
    locked: true,
    source: anchor.source,
    notes: anchor.notes,
  };
}

function buildCurrentOpenTimeState(
  dayPlan: DayPlan,
  currentTime: string
): { block: ScheduleBlock; kind: DayPlanCurrentTimeState } | null {
  const currentMs = new Date(currentTime).getTime();
  const planningWindowStartMs = new Date(dayPlan.planningWindow.startTime).getTime();
  const planningWindowEndMs = new Date(dayPlan.planningWindow.endTime).getTime();
  const offset = extractOffset(dayPlan.planningWindow.startTime);
  const sortedBlocks = [...dayPlan.blocks].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );

  if (sortedBlocks.length === 0) {
    return null;
  }

  if (currentMs < planningWindowStartMs || currentMs >= planningWindowEndMs) {
    return null;
  }

  const coveringTerminalBlock = sortedBlocks.find((block) => {
    const startMs = new Date(block.startTime).getTime();
    const endMs = new Date(block.endTime).getTime();

    return (
      TERMINAL_STATUSES.has(block.status) &&
      startMs <= currentMs &&
      currentMs < endMs
    );
  });

  if (!coveringTerminalBlock) {
    let gapStartMs = planningWindowStartMs;

    for (const block of sortedBlocks) {
      const startMs = new Date(block.startTime).getTime();
      const endMs = new Date(block.endTime).getTime();

      if (currentMs < startMs) {
        if (currentMs >= gapStartMs) {
          return {
            block: createCurrentOpenTimeSummaryBlock(
              currentMs,
              startMs,
              offset
            )!,
            kind:
              gapStartMs === planningWindowStartMs
                ? "before_first_block"
                : "between_blocks",
          };
        }

        return null;
      }

      if (currentMs < endMs) {
        return null;
      }

      gapStartMs = Math.max(gapStartMs, endMs);
    }

    if (currentMs >= gapStartMs && currentMs < planningWindowEndMs) {
      return {
        block: createCurrentOpenTimeSummaryBlock(
          currentMs,
          planningWindowEndMs,
          offset
        )!,
        kind: "after_last_block",
      };
    }

    return null;
  }

  return {
    block: createCurrentOpenTimeSummaryBlock(
      currentMs,
      new Date(coveringTerminalBlock.endTime).getTime(),
      offset,
      coveringTerminalBlock.status === "skipped"
        ? `"${coveringTerminalBlock.title}" was skipped.`
        : "This slot is no longer an active block."
    )!,
    kind: "terminal_history_overlap",
  };
}

function createCurrentOpenTimeSummaryBlock(
  startMs: number,
  endMs: number,
  offset: string,
  notes = "No scheduled block in this window."
) {
  if (endMs <= startMs) {
    return null;
  }

  return {
    id: `summary-buffer-${startMs}`,
    title: OPEN_TIME_TITLE,
    blockType: "buffer" as const,
    startTime: formatIsoWithOffset(startMs, offset),
    endTime: formatIsoWithOffset(endMs, offset),
    status: "active" as const,
    locked: false,
    source: "system" as const,
    notes,
  };
}

function getDisplayStatus(startMs: number, endMs: number, currentMs: number) {
  if (startMs <= currentMs && currentMs < endMs) {
    return "active" as const;
  }

  if (endMs <= currentMs) {
    return "expired" as const;
  }

  return "upcoming" as const;
}

function isBlockActiveAtTime(block: ScheduleBlock, currentTime: string) {
  const currentMs = new Date(currentTime).getTime();
  const startMs = new Date(block.startTime).getTime();
  const endMs = new Date(block.endTime).getTime();

  return startMs <= currentMs && currentMs < endMs;
}

function findNextAvailableStart(
  startMs: number,
  durationMs: number,
  windows: TimelineWindow[]
) {
  let candidateStartMs = startMs;

  windows.forEach((window) => {
    const candidateEndMs = candidateStartMs + durationMs;

    if (
      candidateEndMs <= window.startMs ||
      candidateStartMs >= window.endMs
    ) {
      return;
    }

    candidateStartMs = window.endMs;
  });

  return candidateStartMs;
}

function sortTasks(tasks: Task[], referenceTime: string) {
  return [...tasks].sort((left, right) => {
    return (
      getTaskProtectionScore(right, referenceTime, false) -
      getTaskProtectionScore(left, referenceTime, false)
    );
  });
}

function buildRouteContextByTaskId(tasks: Task[]) {
  return new Map(
    tasks.map((task) => [task.id, inferTaskRouteFlowContext(task)] as const)
  );
}

function buildRouteFlowSummary(
  queue: PendingTask[],
  routeContextByTaskId: Map<string, ReturnType<typeof inferTaskRouteFlowContext>>
): RouteFlowSummary {
  const locationCounts = new Map<
    ReturnType<typeof inferTaskRouteFlowContext>["locationContext"],
    number
  >();
  const cognitiveCounts = new Map<
    ReturnType<typeof inferTaskRouteFlowContext>["cognitiveMode"],
    number
  >();

  queue.forEach((taskState) => {
    if (taskState.remainingMinutes <= 0) {
      return;
    }

    const routeContext =
      routeContextByTaskId.get(taskState.task.id) ??
      inferTaskRouteFlowContext(taskState.task);

    locationCounts.set(
      routeContext.locationContext,
      (locationCounts.get(routeContext.locationContext) ?? 0) + 1
    );
    cognitiveCounts.set(
      routeContext.cognitiveMode,
      (cognitiveCounts.get(routeContext.cognitiveMode) ?? 0) + 1
    );
  });

  return {
    cognitiveCounts,
    locationCounts,
  };
}

function pickTaskPlacementCandidate({
  boundaryTaskId,
  candidates,
  lastPlacedTask,
  queue,
  referenceTime,
  routeContextByTaskId,
}: {
  boundaryTaskId?: string | null;
  candidates: PlacementCandidate[];
  lastPlacedTask: Task | null;
  queue: PendingTask[];
  referenceTime: string;
  routeContextByTaskId: Map<string, ReturnType<typeof inferTaskRouteFlowContext>>;
}) {
  if (candidates.length === 0) {
    return null;
  }

  const routeFlowSummary = buildRouteFlowSummary(queue, routeContextByTaskId);

  return [...candidates].sort((left, right) => {
    const leftIsBoundaryTask = left.taskState.task.id === boundaryTaskId;
    const rightIsBoundaryTask = right.taskState.task.id === boundaryTaskId;

    if (leftIsBoundaryTask !== rightIsBoundaryTask) {
      return leftIsBoundaryTask ? -1 : 1;
    }

    const protectionDelta =
      getTaskProtectionScore(right.taskState.task, referenceTime, false) -
      getTaskProtectionScore(left.taskState.task, referenceTime, false);

    // Route flow only breaks near-ties. The core planner priorities still win first.
    if (
      Math.abs(protectionDelta) >
      ROUTE_COHERENCE_PROTECTION_TOLERANCE
    ) {
      return protectionDelta;
    }

    const routeCoherenceDelta =
      getRouteCoherenceScore({
        candidateTask: right.taskState.task,
        lastPlacedTask,
        routeContextByTaskId,
        routeFlowSummary,
      }) -
      getRouteCoherenceScore({
        candidateTask: left.taskState.task,
        lastPlacedTask,
        routeContextByTaskId,
        routeFlowSummary,
      });

    if (routeCoherenceDelta !== 0) {
      return routeCoherenceDelta;
    }

    if (protectionDelta !== 0) {
      return protectionDelta;
    }

    return left.taskState.originalIndex - right.taskState.originalIndex;
  })[0];
}

function getRouteCoherenceScore({
  candidateTask,
  lastPlacedTask,
  routeContextByTaskId,
  routeFlowSummary,
}: {
  candidateTask: Task;
  lastPlacedTask: Task | null;
  routeContextByTaskId: Map<string, ReturnType<typeof inferTaskRouteFlowContext>>;
  routeFlowSummary: RouteFlowSummary;
}) {
  const candidateRouteContext =
    routeContextByTaskId.get(candidateTask.id) ??
    inferTaskRouteFlowContext(candidateTask);
  const lastPlacedRouteContext = lastPlacedTask
    ? routeContextByTaskId.get(lastPlacedTask.id) ??
      inferTaskRouteFlowContext(lastPlacedTask)
    : null;
  let score = 0;

  if (
    lastPlacedTask &&
    lastPlacedTask.id === candidateTask.id &&
    candidateTask.type === "deep_work"
  ) {
    score += 10;
  }

  if (lastPlacedRouteContext) {
    if (
      candidateRouteContext.locationContext !== "unknown" &&
      lastPlacedRouteContext.locationContext !== "unknown"
    ) {
      if (
        candidateRouteContext.locationContext ===
        lastPlacedRouteContext.locationContext
      ) {
        score +=
          candidateRouteContext.locationContext === "out_of_home" ? 12 : 8;
      } else {
        score -= 8;
      }
    }

    if (
      candidateRouteContext.cognitiveMode !== "other" &&
      lastPlacedRouteContext.cognitiveMode !== "other"
    ) {
      if (
        candidateRouteContext.cognitiveMode ===
        lastPlacedRouteContext.cognitiveMode
      ) {
        score += 4;
      } else {
        score -= 2;
      }
    }
  }

  const sameLocationCount =
    routeFlowSummary.locationCounts.get(candidateRouteContext.locationContext) ?? 0;
  const sameCognitiveCount =
    routeFlowSummary.cognitiveCounts.get(candidateRouteContext.cognitiveMode) ?? 0;

  if (sameLocationCount > 1) {
    score +=
      candidateRouteContext.locationContext === "out_of_home"
        ? 6
        : candidateRouteContext.locationContext === "desk"
          ? 4
          : candidateRouteContext.locationContext === "home"
            ? 2
            : 0;
  }

  if (sameCognitiveCount > 1) {
    score += candidateRouteContext.cognitiveMode === "light_admin" ? 3 : 2;
  }

  if (candidateTask.type === "self_care") {
    score = Math.min(score, 6);
  }

  return score;
}

function clampAnchors(hardEvents: HardEvent[], planningWindow: PlanningWindow): VisibleAnchor[] {
  const windowStartMs = new Date(planningWindow.startTime).getTime();
  const windowEndMs = new Date(planningWindow.endTime).getTime();

  return hardEvents
    .reduce<VisibleAnchor[]>((anchors, event) => {
      const startMs = Math.max(new Date(event.startTime).getTime(), windowStartMs);
      const endMs = Math.min(new Date(event.endTime).getTime(), windowEndMs);

      if (endMs <= startMs) {
        return anchors;
      }

      anchors.push({
        id: event.id,
        title: event.title,
        startMs,
        endMs,
        notes: event.notes,
        source: event.source,
      });

      return anchors;
    }, [])
    .sort((left, right) => left.startMs - right.startMs);
}

function buildAvailableSlots(
  windowStartMs: number,
  windowEndMs: number,
  anchors: BusyWindow[]
): Slot[] {
  const slots: Slot[] = [];
  let cursorMs = windowStartMs;

  [...anchors]
    .sort((left, right) => left.startMs - right.startMs)
    .forEach((anchor) => {
    if (anchor.startMs > cursorMs) {
      slots.push({
        startMs: cursorMs,
        endMs: anchor.startMs,
      });
    }

    cursorMs = Math.max(cursorMs, anchor.endMs);
    });

  if (cursorMs < windowEndMs) {
    slots.push({
      startMs: cursorMs,
      endMs: windowEndMs,
    });
  }

  return slots;
}

function applyPaceModeToFlexibleBlocks({
  flexibleBlocks,
  lockedBlocks,
  offset,
  paceMode,
  windowEndMs,
  windowStartMs,
}: {
  flexibleBlocks: ScheduleBlock[];
  lockedBlocks: ScheduleBlock[];
  offset: string;
  paceMode: PaceMode;
  windowEndMs: number;
  windowStartMs: number;
}) {
  const sortedFlexibleBlocks = [...flexibleBlocks].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );

  if (paceMode !== "spread_out" || sortedFlexibleBlocks.length === 0) {
    return sortedFlexibleBlocks;
  }

  const slots = buildAvailableSlots(
    windowStartMs,
    windowEndMs,
    lockedBlocks.map((block) => ({
      startMs: new Date(block.startTime).getTime(),
      endMs: new Date(block.endTime).getTime(),
    }))
  );
  const slotGroups = slots.map((slot) => ({
    slot,
    blocks: sortedFlexibleBlocks.filter((block) => {
      const startMs = new Date(block.startTime).getTime();
      const endMs = new Date(block.endTime).getTime();

      return startMs >= slot.startMs && endMs <= slot.endMs;
    }),
  }));
  const lastFlexibleSlotIndex = getLastFlexibleSlotIndex(slotGroups);

  return slotGroups.flatMap(({ slot, blocks }, slotIndex) => {
    if (blocks.length === 0) {
      return [];
    }

    const occupiedMinutes = blocks.reduce((totalMinutes, block) => {
      const startMs = new Date(block.startTime).getTime();
      const endMs = new Date(block.endTime).getTime();

      return totalMinutes + diffMinutes(startMs, endMs);
    }, 0);
    const slotSlackMinutes = Math.max(
      0,
      diffMinutes(slot.startMs, slot.endMs) - occupiedMinutes
    );
    const reservedTailMinutes =
      slotIndex === lastFlexibleSlotIndex && slotSlackMinutes >= 30 ? 30 : 0;
    const distributableSlackMinutes = Math.max(
      0,
      slotSlackMinutes - reservedTailMinutes
    );

    if (distributableSlackMinutes < 10) {
      return blocks;
    }

    const candidateIndices = getSpreadBufferTargetIndices(blocks);
    const gapCount = Math.min(
      candidateIndices.length,
      Math.floor(distributableSlackMinutes / 10)
    );

    if (gapCount <= 0) {
      return blocks;
    }

    const selectedCandidateIndices = candidateIndices.slice(-gapCount);
    const allocatedGapMinutes = allocateEvenGapMinutes(
      distributableSlackMinutes,
      selectedCandidateIndices
    );

    return rebuildSlotWithSpreadBuffers({
      blocks,
      gapMinutesByBlockIndex: allocatedGapMinutes,
      offset,
      slotStartMs: slot.startMs,
    });
  });
}

function getLastFlexibleSlotIndex(
  slotGroups: Array<{ slot: Slot; blocks: ScheduleBlock[] }>
) {
  for (let index = slotGroups.length - 1; index >= 0; index -= 1) {
    if (slotGroups[index].blocks.length > 0) {
      return index;
    }
  }

  return -1;
}

function getSpreadBufferTargetIndices(blocks: ScheduleBlock[]) {
  if (blocks.length === 1) {
    return [0];
  }

  return blocks.flatMap((block, index) =>
    index > 0 && block.blockType !== "break" ? [index] : []
  );
}

function allocateEvenGapMinutes(
  totalMinutes: number,
  targetIndices: number[]
) {
  const gapMinutesByBlockIndex = new Map<number, number>();

  if (targetIndices.length === 0 || totalMinutes <= 0) {
    return gapMinutesByBlockIndex;
  }

  const baseGapMinutes = Math.floor(totalMinutes / targetIndices.length);
  let remainderMinutes = totalMinutes % targetIndices.length;

  targetIndices.forEach((blockIndex) => {
    const extraMinute = remainderMinutes > 0 ? 1 : 0;
    gapMinutesByBlockIndex.set(blockIndex, baseGapMinutes + extraMinute);
    remainderMinutes = Math.max(0, remainderMinutes - 1);
  });

  return gapMinutesByBlockIndex;
}

function rebuildSlotWithSpreadBuffers({
  blocks,
  gapMinutesByBlockIndex,
  offset,
  slotStartMs,
}: {
  blocks: ScheduleBlock[];
  gapMinutesByBlockIndex: Map<number, number>;
  offset: string;
  slotStartMs: number;
}) {
  const rebuiltBlocks: ScheduleBlock[] = [];
  let cursorMs = slotStartMs;

  blocks.forEach((block, index) => {
    const gapMinutes = gapMinutesByBlockIndex.get(index) ?? 0;

    if (gapMinutes >= 10) {
      const bufferEndMs = cursorMs + gapMinutes * 60000;
      rebuiltBlocks.push(
        createSpreadBufferBlock(cursorMs, bufferEndMs, offset, block.title)
      );
      cursorMs = bufferEndMs;
    }

    const durationMinutes = diffMinutes(
      new Date(block.startTime).getTime(),
      new Date(block.endTime).getTime()
    );
    const blockStartMs = cursorMs;
    const blockEndMs = blockStartMs + durationMinutes * 60000;

    rebuiltBlocks.push({
      ...block,
      startTime: formatIsoWithOffset(blockStartMs, offset),
      endTime: formatIsoWithOffset(blockEndMs, offset),
    });
    cursorMs = blockEndMs;
  });

  return rebuiltBlocks;
}

function createSpreadBufferBlock(
  startMs: number,
  endMs: number,
  offset: string,
  nextBlockTitle: string
): ScheduleBlock {
  return {
    id: `block-buffer-${startMs}`,
    title: OPEN_TIME_TITLE,
    blockType: "buffer",
    startTime: formatIsoWithOffset(startMs, offset),
    endTime: formatIsoWithOffset(endMs, offset),
    status: "upcoming",
    locked: false,
    source: "system",
    notes: `Breathing room before "${nextBlockTitle}".`,
  };
}

function findNextTaskPlacement(
  queue: PendingTask[],
  cursorMs: number,
  slotEndMs: number,
  windowEndMs: number,
  cadenceSettings: BreakCadenceSettings,
  focusMinutesSinceBreak: number,
  lastPlacedTask: Task | null,
  routeContextByTaskId: Map<string, ReturnType<typeof inferTaskRouteFlowContext>>
) {
  const slotMinutesRemaining = diffMinutes(cursorMs, slotEndMs);
  const preferredCandidates: PlacementCandidate[] = [];
  const fallbackCandidates: PlacementCandidate[] = [];

  queue.forEach((taskState) => {
    const chunkMinutes = getChunkMinutes(
      taskState,
      slotMinutesRemaining,
      cadenceSettings,
      focusMinutesSinceBreak
    );

    if (!chunkMinutes) {
      return;
    }

    const targetList = isTooEarlyForTask(taskState.task, cursorMs, windowEndMs)
      ? fallbackCandidates
      : preferredCandidates;

    targetList.push({
      chunkMinutes,
      taskState,
    });
  });

  return (
    pickTaskPlacementCandidate({
      candidates: preferredCandidates,
      queue,
      referenceTime: new Date(cursorMs).toISOString(),
      routeContextByTaskId,
      lastPlacedTask,
    }) ??
    pickTaskPlacementCandidate({
      candidates: fallbackCandidates,
      queue,
      referenceTime: new Date(cursorMs).toISOString(),
      routeContextByTaskId,
      lastPlacedTask,
    }) ??
    null
  );
}

function getChunkMinutes(
  taskState: PendingTask,
  slotMinutesRemaining: number,
  cadenceSettings: BreakCadenceSettings,
  focusMinutesSinceBreak: number
) {
  const { remainingMinutes, task } = taskState;

  const breakAlignedChunkMinutes = getBreakAlignedFocusChunkMinutes(
    taskState,
    slotMinutesRemaining,
    focusMinutesSinceBreak,
    cadenceSettings.focusMinutesBeforeBreak,
    cadenceSettings.maxBreakMinutes,
    cadenceSettings.minBreakMinutes,
    cadenceSettings.minChunkMinutes
  );

  if (breakAlignedChunkMinutes) {
    return breakAlignedChunkMinutes;
  }

  if (!task.splittable || remainingMinutes <= 60) {
    return remainingMinutes <= slotMinutesRemaining ? remainingMinutes : null;
  }

  if (taskState.chunksPlaced >= 2) {
    return remainingMinutes <= slotMinutesRemaining ? remainingMinutes : null;
  }

  if (remainingMinutes <= slotMinutesRemaining && remainingMinutes <= 90) {
    return remainingMinutes;
  }

  if (slotMinutesRemaining < cadenceSettings.minChunkMinutes) {
    return null;
  }

  const preferred =
    task.type === "deep_work"
      ? Math.max(cadenceSettings.focusMinutesBeforeBreak, 25)
      : Math.min(Math.max(cadenceSettings.focusMinutesBeforeBreak, 30), 45);
  let chunkMinutes = Math.min(preferred, slotMinutesRemaining, 60);
  const remainder = remainingMinutes - chunkMinutes;

  if (remainder > 0 && remainder < cadenceSettings.minChunkMinutes) {
    chunkMinutes = remainingMinutes - cadenceSettings.minChunkMinutes;
  }

  if (chunkMinutes < cadenceSettings.minChunkMinutes) {
    return null;
  }

  return chunkMinutes;
}

function getBreakAlignedFocusChunkMinutes(
  taskState: PendingTask,
  slotMinutesRemaining: number,
  focusMinutesSinceBreak: number,
  focusMinutesBeforeBreak: number,
  maxBreakMinutes: number,
  minBreakMinutes: number,
  minChunkMinutes: number
) {
  if (
    taskState.task.type !== "deep_work" ||
    !taskState.task.splittable ||
    taskState.remainingMinutes <= minChunkMinutes
  ) {
    return null;
  }

  const minutesUntilBreak = focusMinutesBeforeBreak - focusMinutesSinceBreak;

  if (
    minutesUntilBreak < minChunkMinutes ||
    minutesUntilBreak >= taskState.remainingMinutes ||
    minutesUntilBreak > slotMinutesRemaining
  ) {
    return null;
  }

  const availableAfterChunk = slotMinutesRemaining - minutesUntilBreak;
  const continuationMinutes = taskState.remainingMinutes - minutesUntilBreak;
  const breakMinutes = Math.min(maxBreakMinutes, availableAfterChunk);

  if (
    breakMinutes < minBreakMinutes ||
    continuationMinutes < minChunkMinutes ||
    availableAfterChunk <
      minBreakMinutes + minChunkMinutes
  ) {
    return null;
  }

  return minutesUntilBreak;
}

function createTaskBlock(
  taskState: PendingTask,
  chunkMinutes: number,
  startMs: number,
  offset: string
): ScheduleBlock {
  const endMs = startMs + chunkMinutes * 60000;
  const blockIndex = taskState.chunksPlaced + 1;
  const isSplitTask =
    taskState.task.splittable && taskState.task.estimatedMinutes > chunkMinutes;
  const blockType = mapTaskToBlockType(taskState.task);

  return {
    id: `block-${taskState.task.id}-${blockIndex}`,
    taskId: taskState.task.id,
    title: isSplitTask
      ? `${taskState.task.title} · part ${blockIndex}`
      : taskState.task.title,
    blockType,
    startTime: formatIsoWithOffset(startMs, offset),
    endTime: formatIsoWithOffset(endMs, offset),
    status: "upcoming",
    locked: false,
    source: "mixed",
    notes:
      blockType === "focus" && isSplitTask
        ? "Split into a meaningful focus chunk to preserve the day route."
        : undefined,
  };
}

export function normalizeTaskChunkPresentation(blocks: ScheduleBlock[], tasks: Task[]) {
  const coalescedBlocks = coalesceAdjacentTaskChunks(blocks);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const chunkIndexesByTaskId = new Map<string, number[]>();

  coalescedBlocks.forEach((block, index) => {
    if (!isMeaningfulTaskChunk(block, tasksById)) {
      return;
    }

    chunkIndexesByTaskId.set(block.taskId!, [
      ...(chunkIndexesByTaskId.get(block.taskId!) ?? []),
      index,
    ]);
  });

  return coalescedBlocks.map((block, index) => {
    const task = block.taskId ? tasksById.get(block.taskId) : undefined;

    if (!task || !isMeaningfulTaskChunk(block, tasksById)) {
      return stripSyntheticSplitNote(block, false);
    }

    const chunkIndexes = chunkIndexesByTaskId.get(task.id) ?? [];
    const showPartLabel = chunkIndexes.length > 1;
    const partIndex = chunkIndexes.indexOf(index);

    return {
      ...stripSyntheticSplitNote(block, showPartLabel),
      title:
        showPartLabel && partIndex >= 0
          ? `${task.title} · part ${partIndex + 1}`
          : task.title,
    };
  });
}

function coalesceAdjacentTaskChunks(blocks: ScheduleBlock[]) {
  const coalesced: ScheduleBlock[] = [];

  blocks.forEach((block) => {
    const previous = coalesced[coalesced.length - 1];

    if (!canCoalesceTaskChunks(previous, block)) {
      coalesced.push(block);
      return;
    }

    coalesced[coalesced.length - 1] = {
      ...previous,
      endTime: block.endTime,
      notes: stripSyntheticSplitNote(previous, false).notes,
    };
  });

  return coalesced;
}

function canCoalesceTaskChunks(
  previous: ScheduleBlock | undefined,
  current: ScheduleBlock
) {
  if (!previous || !previous.taskId || previous.taskId !== current.taskId) {
    return false;
  }

  if (
    previous.blockType === "break" ||
    current.blockType === "break" ||
    previous.isBreakEligibleTaskPlacement ||
    current.isBreakEligibleTaskPlacement
  ) {
    return false;
  }

  if (
    previous.status !== current.status ||
    previous.locked !== current.locked ||
    previous.blockType !== current.blockType
  ) {
    return false;
  }

  return (
    new Date(previous.endTime).getTime() === new Date(current.startTime).getTime()
  );
}

function isMeaningfulTaskChunk(
  block: ScheduleBlock,
  tasksById: Map<string, Task>
) {
  if (!block.taskId || block.blockType === "break" || block.isBreakEligibleTaskPlacement) {
    return false;
  }

  return tasksById.get(block.taskId)?.splittable ?? false;
}

function stripSyntheticSplitNote(block: ScheduleBlock, keepSplitNote: boolean) {
  if (!block.notes || !SYNTHETIC_SPLIT_NOTES.has(block.notes)) {
    return block;
  }

  return {
    ...block,
    notes: keepSplitNote ? block.notes : undefined,
  };
}

function createBreakPlacement(
  breakMode: BreakMode,
  breakWindowsCreated: number,
  desiredBreakMinutes: number,
  cursorMs: number,
  slotEndMs: number,
  queue: PendingTask[],
  offset: string,
  blockIndexByTaskId: Map<string, number>,
  minBreakMinutes: number
): BreakWindowPlacement | null {
  const breakMinutes = Math.min(
    Math.max(desiredBreakMinutes, minBreakMinutes),
    diffMinutes(cursorMs, slotEndMs)
  );

  if (breakMinutes < minBreakMinutes) {
    return null;
  }

  if (breakMode === "productive" && breakWindowsCreated % 2 === 1) {
    const candidate = queue.find(
      (taskState) =>
        taskState.task.breakEligible &&
        taskState.task.energyLevel === "low" &&
        (taskState.remainingMinutes <= Math.min(15, breakMinutes) ||
          taskState.task.splittable) &&
        Math.min(taskState.remainingMinutes, breakMinutes, 15) >= minBreakMinutes
    );

    if (candidate) {
      const startIndex = (blockIndexByTaskId.get(candidate.task.id) ?? 0) + 1;
      blockIndexByTaskId.set(candidate.task.id, startIndex);
      candidate.remainingMinutes = 0;

      return {
        block: {
          id: `block-${candidate.task.id}-productive-break-${startIndex}`,
          taskId: candidate.task.id,
          title: candidate.task.title,
          blockType: "break",
          startTime: formatIsoWithOffset(cursorMs, offset),
          endTime: formatIsoWithOffset(
            cursorMs + Math.min(15, breakMinutes) * 60000,
            offset
          ),
          status: "upcoming",
          locked: false,
          source: "mixed",
          isBreakEligibleTaskPlacement: true,
          notes: "Productive break window with a brief low-effort task.",
        },
        consumedTaskId: candidate.task.id,
      };
    }
  }

  return {
    block: {
      id: `block-break-${cursorMs}`,
      title: breakMinutes >= 20 ? "Reset and breathe" : "Short break",
      blockType: "break",
      startTime: formatIsoWithOffset(cursorMs, offset),
      endTime: formatIsoWithOffset(cursorMs + breakMinutes * 60000, offset),
      status: "upcoming",
      locked: false,
      source: "system",
      notes: "Explicit break window.",
    },
  };
}

function createAnchorBlock(anchor: VisibleAnchor, offset: string): ScheduleBlock {
  return {
    id: `block-anchor-${anchor.id}`,
    title: anchor.title,
    blockType: "appointment",
    startTime: formatIsoWithOffset(anchor.startMs, offset),
    endTime: formatIsoWithOffset(anchor.endMs, offset),
    status: "upcoming",
    locked: true,
    source: anchor.source,
    notes: anchor.notes,
  };
}

function createFixedTaskBlock(task: Task): ScheduleBlock {
  return {
    id: `block-fixed-task-${task.id}`,
    taskId: task.id,
    title: task.title,
    blockType: mapTaskToBlockType(task),
    startTime: task.hardStartTime!,
    endTime: task.hardEndTime!,
    status: "upcoming",
    locked: true,
    source: task.source,
    notes: "Fixed-time task constraint.",
  };
}

function buildFixedTaskConstraints(tasks: Task[]): FixedTaskConstraint[] {
  return tasks
    .filter((task) => Boolean(task.hardStartTime && task.hardEndTime))
    .map((task) => ({
      task,
      startMs: new Date(task.hardStartTime!).getTime(),
      endMs: new Date(task.hardEndTime!).getTime(),
    }))
    .sort((left, right) => left.startMs - right.startMs);
}

function buildUnplacedTasks(queue: PendingTask[]): UnplacedTask[] {
  return queue.map((taskState) => ({
    taskId: taskState.task.id,
    title: taskState.task.title,
    remainingMinutes: taskState.remainingMinutes,
    reason:
      !taskState.task.splittable && taskState.remainingMinutes === taskState.task.estimatedMinutes
        ? "needs_longer_open_slot"
        : taskState.task.deferrable
          ? "lower_priority_deferred"
          : "did_not_fit_today",
  }));
}

export function normalizeUnplacedTasksForDayPlan(
  dayPlan: DayPlan,
  unplacedTasks: UnplacedTask[],
  carryForwardItems: CarryForwardItem[] = []
) {
  const completedTaskIds = new Set(dayPlan.completedTaskIds ?? []);
  const skippedTaskIds = new Set(
    dayPlan.blocks
      .filter((block) => block.status === "skipped" && Boolean(block.taskId))
      .map((block) => block.taskId!)
  );
  const remainingMinutesByTaskId = buildUnscheduledTaskMinutesByTask(dayPlan);
  const existingByTaskId = new Map(
    unplacedTasks.map((task) => [task.taskId, task])
  );
  const carryForwardTaskIds = new Set(
    carryForwardItems.map((carryForwardItem) => carryForwardItem.taskId)
  );

  return dayPlan.tasks.flatMap((task) => {
    if (completedTaskIds.has(task.id) || skippedTaskIds.has(task.id)) {
      return [];
    }

    if (carryForwardTaskIds.has(task.id)) {
      return [];
    }

    const remainingMinutes = Math.max(
      0,
      remainingMinutesByTaskId.get(task.id) ?? 0
    );

    if (remainingMinutes <= 0) {
      return [];
    }

    const existing = existingByTaskId.get(task.id);

    return [
      {
        taskId: task.id,
        title: task.title,
        remainingMinutes,
        reason:
          existing?.reason ??
          (!task.splittable && remainingMinutes === task.estimatedMinutes
            ? "needs_longer_open_slot"
            : task.deferrable
              ? "lower_priority_deferred"
              : "did_not_fit_today"),
      } satisfies UnplacedTask,
    ];
  });
}

export function deriveTaskMinuteLedger(
  dayPlan: DayPlan,
  currentTime: string,
  carryForwardItems: CarryForwardItem[] = []
): TaskMinuteLedgerEntry[] {
  const currentMs = new Date(currentTime).getTime();
  const completedTaskIds = new Set(dayPlan.completedTaskIds ?? []);
  const ledger = new Map<string, TaskMinuteLedgerEntry>();

  dayPlan.tasks.forEach((task) => {
    ledger.set(task.id, {
      task,
      historyMinutes: 0,
      futurePlacedMinutes: 0,
      remainingCarriedForwardMinutes: 0,
      remainingUnplacedMinutes: 0,
      scheduledMinutes: 0,
      isCompleted: completedTaskIds.has(task.id),
    });
  });

  dayPlan.blocks.forEach((block) => {
    if (!block.taskId) {
      return;
    }

    const entry = ledger.get(block.taskId);

    if (!entry) {
      return;
    }

    const startMs = new Date(block.startTime).getTime();
    const endMs = new Date(block.endTime).getTime();
    const durationMinutes = diffMinutes(startMs, endMs);

    if (durationMinutes <= 0) {
      return;
    }

    entry.scheduledMinutes += durationMinutes;

    if (endMs <= currentMs || TERMINAL_STATUSES.has(block.status)) {
      entry.historyMinutes += durationMinutes;
      return;
    }

    if (startMs < currentMs && currentMs < endMs) {
      entry.historyMinutes += diffMinutes(startMs, currentMs);
      entry.futurePlacedMinutes += diffMinutes(currentMs, endMs);
      return;
    }

    entry.futurePlacedMinutes += durationMinutes;
  });

  const remainingMinutesByTaskId = buildUnscheduledTaskMinutesByTask(dayPlan);

  ledger.forEach((entry, taskId) => {
    const carryForwardItem = carryForwardItems.find(
      (item) => item.taskId === taskId
    );
    const totalRemainingMinutes = entry.isCompleted
      ? 0
      : Math.max(0, remainingMinutesByTaskId.get(taskId) ?? 0);
    const remainingCarriedForwardMinutes = entry.isCompleted
      ? 0
      : carryForwardItem?.remainingMinutes ?? 0;

    entry.remainingCarriedForwardMinutes = remainingCarriedForwardMinutes;
    entry.remainingUnplacedMinutes = Math.max(
      0,
      totalRemainingMinutes - remainingCarriedForwardMinutes
    );
  });

  return [...ledger.values()];
}

function getTaskProtectionScore(
  task: Task,
  referenceTime: string,
  prioritizeFocus: boolean
) {
  let score = 0;

  if (task.mustDoToday) {
    score += 120;
  }

  score += priorityRank(task.priority) * 24;
  score += Math.min(task.deferCount ?? 0, 5) * 18;

  if (task.dueAt) {
    const dueDeltaMinutes =
      (new Date(task.dueAt).getTime() - new Date(referenceTime).getTime()) / 60000;

    if (dueDeltaMinutes <= 0) {
      score += 140;
    } else if (dueDeltaMinutes <= 240) {
      score += 120;
    } else if (dueDeltaMinutes <= 720) {
      score += 90;
    } else if (dueDeltaMinutes <= 1440) {
      score += 70;
    } else {
      score += 30;
    }
  }

  if (task.type === "deep_work") {
    score += prioritizeFocus ? 30 : 16;
  }

  if (!task.deferrable) {
    score += 18;
  }

  if (task.type === "self_care") {
    score += 10;
  }

  return score;
}

function getCarryForwardEaseScore(
  task: Task,
  referenceTime: string,
  protectFocus: boolean
) {
  let score = 0;

  if (task.deferrable) {
    score += 35;
  }

  if (!task.mustDoToday) {
    score += 30;
  }

  if (!task.dueAt) {
    score += 25;
  } else {
    const dueDeltaMinutes =
      (new Date(task.dueAt).getTime() - new Date(referenceTime).getTime()) / 60000;

    if (dueDeltaMinutes <= 0) {
      score -= 80;
    } else if (dueDeltaMinutes <= 240) {
      score -= 60;
    } else if (dueDeltaMinutes <= 720) {
      score -= 45;
    } else if (dueDeltaMinutes <= 1440) {
      score -= 30;
    }
  }

  if (task.priority === "low") {
    score += 24;
  } else if (task.priority === "medium") {
    score += 14;
  } else if (task.priority === "high") {
    score += 4;
  } else {
    score -= 14;
  }

  score -= Math.min(task.deferCount ?? 0, 5) * 14;

  if (task.type !== "deep_work") {
    score += 10;
  }

  if (protectFocus && task.type === "deep_work") {
    score -= 20;
  }

  return score;
}

function removeCompletedTasks(queue: PendingTask[]) {
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    if (queue[index].remainingMinutes <= 0) {
      queue.splice(index, 1);
    }
  }
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

function isTooEarlyForTask(task: Task, cursorMs: number, windowEndMs: number) {
  const preferredHour = getPreferredStartHour(task);

  if (preferredHour === null) {
    return false;
  }

  const preferredStart = new Date(cursorMs);

  preferredStart.setHours(Math.floor(preferredHour), preferredHour % 1 === 0.5 ? 30 : 0, 0, 0);

  if (cursorMs >= preferredStart.getTime() - 90 * 60000) {
    return false;
  }

  return preferredStart.getTime() < windowEndMs;
}

function getPreferredStartHour(task: Task) {
  if (task.timingPreference?.kind === "preferred_time") {
    const preferredHour = getHourValue(task.timingPreference.preferredStartTime);

    if (preferredHour !== null) {
      return preferredHour;
    }
  }

  const normalized = `${task.title} ${task.rawText ?? ""}`.toLowerCase();

  if (normalized.includes("breakfast")) {
    return 8;
  }

  if (normalized.includes("lunch")) {
    return 12;
  }

  if (normalized.includes("dinner")) {
    return 17.5;
  }

  return null;
}

function getHourValue(isoDateTime: string) {
  const match = isoDateTime.match(/T(\d{2}):(\d{2})/);

  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);

  return hours + minutes / 60;
}

function priorityRank(priority: Priority) {
  switch (priority) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function diffMinutes(startMs: number, endMs: number) {
  return Math.round((endMs - startMs) / 60000);
}

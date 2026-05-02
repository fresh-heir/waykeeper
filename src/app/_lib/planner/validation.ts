import type {
  CarryForwardItem,
  DayPlan,
  DueWarning,
  HardEvent,
  ScheduleBlock,
  Task,
  UnplacedTask,
} from "@/app/_lib/planner-types";
import {
  deriveCarryForwardLateWarnings,
  deriveScheduledDueWarnings,
} from "@/app/_lib/planner/carry-forward";
import {
  deriveDayPlanExecutionSnapshot,
  deriveTaskMinuteLedger,
} from "@/app/_lib/planner/scheduler";

interface ValidationResult {
  isValid: boolean;
  warnings: string[];
}

interface DayPlanValidationOptions {
  allowProductiveBreaks?: boolean;
  carryForwardItems?: CarryForwardItem[];
  currentTime?: string;
  dueWarnings?: DueWarning[];
  unplacedTasks?: UnplacedTask[];
}

interface FixedTimeTaskConstraintInput {
  hardEvents: HardEvent[];
  planningWindow: DayPlan["planningWindow"];
  task: Task;
  tasks: Task[];
}

const TERMINAL_STATUSES = new Set(["deferred", "done", "skipped"]);
const TASK_MINUTE_TOLERANCE = 1;

export function validateGeneratedDayPlan(
  dayPlan: DayPlan,
  options?: DayPlanValidationOptions
): ValidationResult {
  const warnings: string[] = [];
  const taskMap = new Map(dayPlan.tasks.map((task) => [task.id, task]));
  const planningStartMs = new Date(dayPlan.planningWindow.startTime).getTime();
  const planningEndMs = new Date(dayPlan.planningWindow.endTime).getTime();
  const currentTime = options?.currentTime ?? dayPlan.updatedAt;
  const allowProductiveBreaks =
    options?.allowProductiveBreaks ?? dayPlan.breakMode === "productive";
  const sortedBlocks = [...dayPlan.blocks].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );

  sortedBlocks.forEach((block, index) => {
    const blockStartMs = new Date(block.startTime).getTime();
    const blockEndMs = new Date(block.endTime).getTime();

    if (blockStartMs < planningStartMs || blockEndMs > planningEndMs) {
      warnings.push(`"${block.title}" ended up outside the planning window.`);
    }

    if (blockEndMs <= blockStartMs) {
      warnings.push(`"${block.title}" has an invalid time range.`);
    }

    const nextBlock = sortedBlocks[index + 1];

    if (!nextBlock) {
      return;
    }

    const nextBlockStartMs = new Date(nextBlock.startTime).getTime();

    if (
      blockEndMs > nextBlockStartMs &&
      !isAllowedNestedFixedOverlap(block, nextBlock)
    ) {
      warnings.push(`"${block.title}" overlaps "${nextBlock.title}".`);
    }
  });

  dayPlan.hardEvents.forEach((hardEvent) => {
    validateHardEventPreservation(dayPlan.planningWindow, hardEvent, sortedBlocks, warnings);
  });

  dayPlan.tasks.forEach((task) => {
    if (!task.hardStartTime || !task.hardEndTime) {
      return;
    }

    warnings.push(
      ...validateFixedTimeTaskConstraint({
        task,
        tasks: dayPlan.tasks,
        hardEvents: dayPlan.hardEvents,
        planningWindow: dayPlan.planningWindow,
      })
    );
    validateFixedTimeTaskPlacement(task, sortedBlocks, warnings);
  });

  sortedBlocks.forEach((block) => {
    if (block.blockType !== "break" || !block.isBreakEligibleTaskPlacement) {
      return;
    }

    if (!allowProductiveBreaks) {
      warnings.push(`"${block.title}" used a productive-break task when the route should stay restful.`);
    }

    const task = block.taskId ? taskMap.get(block.taskId) : null;

    if (!task) {
      warnings.push(`"${block.title}" was marked as a productive break without a task.`);
      return;
    }

    if (!isValidProductiveBreakTask(task, block)) {
      warnings.push(`"${block.title}" is too demanding to sit inside a productive break window.`);
    }
  });

  validateBreakIntegrity(sortedBlocks, warnings);
  validateTaskAccounting(
    dayPlan,
    currentTime,
    options?.unplacedTasks ?? [],
    options?.carryForwardItems ?? [],
    warnings
  );
  validateDueWarningCoverage(
    dayPlan,
    options?.carryForwardItems ?? [],
    options?.dueWarnings ?? [],
    warnings
  );
  validateCurrentAndNextState(dayPlan, currentTime, warnings);

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}

export function validateFixedTimeTaskConstraint({
  hardEvents,
  planningWindow,
  task,
  tasks,
}: FixedTimeTaskConstraintInput) {
  const warnings: string[] = [];

  if (!task.hardStartTime || !task.hardEndTime) {
    return warnings;
  }

  const taskStartMs = new Date(task.hardStartTime).getTime();
  const taskEndMs = new Date(task.hardEndTime).getTime();
  const planningStartMs = new Date(planningWindow.startTime).getTime();
  const planningEndMs = new Date(planningWindow.endTime).getTime();

  if (taskEndMs <= taskStartMs) {
    warnings.push(`"${task.title}" has an invalid fixed-time task range.`);
  }

  if (taskStartMs < planningStartMs || taskEndMs > planningEndMs) {
    warnings.push(`"${task.title}" falls outside the current planning window.`);
  }

  hardEvents.forEach((hardEvent) => {
    const anchorStartMs = new Date(hardEvent.startTime).getTime();
    const anchorEndMs = new Date(hardEvent.endTime).getTime();

    if (
      taskStartMs < anchorEndMs &&
      anchorStartMs < taskEndMs &&
      !isContainedRange(taskStartMs, taskEndMs, anchorStartMs, anchorEndMs)
    ) {
      warnings.push(
        `"${task.title}" overlaps the locked anchor "${hardEvent.title}".`
      );
    }
  });

  tasks.forEach((otherTask) => {
    if (
      otherTask.id === task.id ||
      !otherTask.hardStartTime ||
      !otherTask.hardEndTime
    ) {
      return;
    }

    const otherStartMs = new Date(otherTask.hardStartTime).getTime();
    const otherEndMs = new Date(otherTask.hardEndTime).getTime();

    if (
      taskStartMs < otherEndMs &&
      otherStartMs < taskEndMs &&
      !isContainedRange(taskStartMs, taskEndMs, otherStartMs, otherEndMs) &&
      !isContainedRange(otherStartMs, otherEndMs, taskStartMs, taskEndMs)
    ) {
      warnings.push(
        `"${task.title}" overlaps the fixed-time task "${otherTask.title}".`
      );
    }
  });

  return dedupeWarnings(warnings);
}

export function validateReplannedDayPlan({
  allowProductiveBreaks,
  carryForwardItems,
  currentTime,
  dueWarnings,
  nextDayPlan,
  previousDayPlan,
  unplacedTasks,
}: {
  allowProductiveBreaks?: boolean;
  carryForwardItems?: CarryForwardItem[];
  currentTime: string;
  dueWarnings?: DueWarning[];
  nextDayPlan: DayPlan;
  previousDayPlan: DayPlan;
  unplacedTasks?: UnplacedTask[];
}): ValidationResult {
  const warnings = [
    ...validateGeneratedDayPlan(nextDayPlan, {
      allowProductiveBreaks,
      carryForwardItems,
      currentTime,
      dueWarnings,
      unplacedTasks,
    }).warnings,
  ];
  const currentMs = new Date(currentTime).getTime();
  const planningStartMs = new Date(nextDayPlan.planningWindow.startTime).getTime();
  const planningEndMs = new Date(nextDayPlan.planningWindow.endTime).getTime();

  previousDayPlan.blocks
    .filter(
      (block) =>
        (block.status === "done" || block.status === "skipped") &&
        shouldPreserveTerminalBlockDuringReplan(block, currentMs)
    )
    .forEach((block) => {
      if (!hasMatchingBlock(nextDayPlan.blocks, block)) {
        warnings.push(`The ${block.status} block "${block.title}" was rewritten during replanning.`);
      }
    });

  previousDayPlan.blocks
    .filter(
      (block) =>
        block.status === "expired" &&
        (!block.taskId || block.locked) &&
        new Date(block.endTime).getTime() <= currentMs
    )
    .forEach((block) => {
      if (!hasMatchingBlock(nextDayPlan.blocks, block)) {
        warnings.push(`The expired block "${block.title}" was rewritten during replanning.`);
      }
    });

  previousDayPlan.blocks
    .filter(
      (block) => block.locked && new Date(block.endTime).getTime() > currentMs
    )
    .forEach((block) => {
      if (!hasMatchingBlock(nextDayPlan.blocks, block)) {
        warnings.push(`The locked anchor "${block.title}" was not preserved in the revised remainder.`);
      }
    });

  const crossingFlexibleBlocks = nextDayPlan.blocks.filter((block) => {
    const startMs = new Date(block.startTime).getTime();
    const endMs = new Date(block.endTime).getTime();

    return (
      !block.locked &&
      !TERMINAL_STATUSES.has(block.status) &&
      startMs < currentMs &&
      currentMs < endMs
    );
  });

  if (crossingFlexibleBlocks.length > 0) {
    warnings.push("A revised flexible block still crosses the current-time boundary.");
  }

  if (planningStartMs <= currentMs && currentMs < planningEndMs) {
    const execution = deriveDayPlanExecutionSnapshot(nextDayPlan, currentTime);

    if (!execution.currentDisplayBlock) {
      warnings.push("The revised route no longer answers what is happening right now.");
    }
  }

  return {
    isValid: warnings.length === 0,
    warnings: dedupeWarnings(warnings),
  };
}

function validateHardEventPreservation(
  planningWindow: DayPlan["planningWindow"],
  hardEvent: HardEvent,
  blocks: ScheduleBlock[],
  warnings: string[]
) {
  const clampedEvent = clampHardEvent(hardEvent, planningWindow);

  if (!clampedEvent) {
    return;
  }

  const matchingAppointment = blocks.find(
    (block) =>
      block.blockType === "appointment" &&
      block.locked &&
      new Date(block.startTime).getTime() === clampedEvent.startMs &&
      new Date(block.endTime).getTime() === clampedEvent.endMs &&
      block.title === hardEvent.title
  );

  if (!matchingAppointment) {
    warnings.push(`The fixed anchor "${hardEvent.title}" was not preserved in the generated route.`);
  }

  blocks.forEach((block) => {
    if (block.blockType === "appointment") {
      return;
    }

    const blockStartMs = new Date(block.startTime).getTime();
    const blockEndMs = new Date(block.endTime).getTime();

    if (
      blockStartMs < clampedEvent.endMs &&
      clampedEvent.startMs < blockEndMs &&
      !(
        block.locked &&
        isContainedRange(
          blockStartMs,
          blockEndMs,
          clampedEvent.startMs,
          clampedEvent.endMs
        )
      )
    ) {
      warnings.push(`"${block.title}" overlaps the locked anchor "${hardEvent.title}".`);
    }
  });
}

function isAllowedNestedFixedOverlap(
  block: ScheduleBlock,
  nextBlock: ScheduleBlock
) {
  if (!block.locked || !nextBlock.locked) {
    return false;
  }

  const blockStartMs = new Date(block.startTime).getTime();
  const blockEndMs = new Date(block.endTime).getTime();
  const nextBlockStartMs = new Date(nextBlock.startTime).getTime();
  const nextBlockEndMs = new Date(nextBlock.endTime).getTime();

  return (
    isContainedRange(blockStartMs, blockEndMs, nextBlockStartMs, nextBlockEndMs) ||
    isContainedRange(nextBlockStartMs, nextBlockEndMs, blockStartMs, blockEndMs)
  );
}

function isContainedRange(
  innerStartMs: number,
  innerEndMs: number,
  outerStartMs: number,
  outerEndMs: number
) {
  return outerStartMs <= innerStartMs && innerEndMs <= outerEndMs;
}

function validateFixedTimeTaskPlacement(
  task: Task,
  blocks: ScheduleBlock[],
  warnings: string[]
) {
  if (!task.hardStartTime || !task.hardEndTime) {
    return;
  }

  const hardStartTime = task.hardStartTime;
  const hardEndTime = task.hardEndTime;

  const matchingBlock = blocks.find(
    (block) =>
      block.taskId === task.id &&
      block.locked &&
      new Date(block.startTime).getTime() === new Date(hardStartTime).getTime() &&
      new Date(block.endTime).getTime() === new Date(hardEndTime).getTime()
  );

  if (!matchingBlock) {
    warnings.push(
      `The fixed-time task "${task.title}" was not preserved in the generated route.`
    );
  }
}

function clampHardEvent(
  hardEvent: HardEvent,
  planningWindow: DayPlan["planningWindow"]
) {
  const windowStartMs = new Date(planningWindow.startTime).getTime();
  const windowEndMs = new Date(planningWindow.endTime).getTime();
  const startMs = Math.max(new Date(hardEvent.startTime).getTime(), windowStartMs);
  const endMs = Math.min(new Date(hardEvent.endTime).getTime(), windowEndMs);

  if (endMs <= startMs) {
    return null;
  }

  return {
    startMs,
    endMs,
  };
}

function isValidProductiveBreakTask(task: Task, block: ScheduleBlock) {
  const durationMinutes =
    (new Date(block.endTime).getTime() - new Date(block.startTime).getTime()) /
    60000;

  return (
    task.breakEligible &&
    task.energyLevel === "low" &&
    durationMinutes <= 15 &&
    task.type !== "deep_work"
  );
}

function validateBreakIntegrity(blocks: ScheduleBlock[], warnings: string[]) {
  const breakBlocks = blocks.filter((block) => block.blockType === "break");
  const productiveBreakBlocks = breakBlocks.filter(
    (block) => Boolean(block.isBreakEligibleTaskPlacement || block.taskId)
  );

  if (
    breakBlocks.length > 1 &&
    productiveBreakBlocks.length === breakBlocks.length
  ) {
    warnings.push("Productive tasks consumed every break window, leaving no true recovery block.");
  }
}

function validateTaskAccounting(
  dayPlan: DayPlan,
  currentTime: string,
  unplacedTasks: UnplacedTask[],
  carryForwardItems: CarryForwardItem[],
  warnings: string[]
) {
  const skippedTaskIds = new Set(
    dayPlan.blocks
      .filter((block) => block.status === "skipped" && Boolean(block.taskId))
      .map((block) => block.taskId!)
  );
  const unplacedByTaskId = new Map(
    unplacedTasks.map((task) => [task.taskId, task])
  );
  const carryForwardByTaskId = new Map(
    carryForwardItems.map((carryForwardItem) => [
      carryForwardItem.taskId,
      carryForwardItem,
    ])
  );
  const taskBlocksByTaskId = new Map<string, ScheduleBlock[]>();

  dayPlan.blocks.forEach((block) => {
    if (!block.taskId) {
      return;
    }

    taskBlocksByTaskId.set(block.taskId, [
      ...(taskBlocksByTaskId.get(block.taskId) ?? []),
      block,
    ]);
  });

  deriveTaskMinuteLedger(dayPlan, currentTime, carryForwardItems).forEach((entry) => {
    const {
      futurePlacedMinutes,
      historyMinutes,
      isCompleted,
      remainingCarriedForwardMinutes,
      remainingUnplacedMinutes,
      scheduledMinutes,
      task,
    } = entry;
    const unplacedTask = unplacedByTaskId.get(task.id);
    const carryForwardItem = carryForwardByTaskId.get(task.id);
    const accountedMinutes =
      historyMinutes +
      futurePlacedMinutes +
      remainingUnplacedMinutes +
      remainingCarriedForwardMinutes;

    if (isCompleted) {
      if (futurePlacedMinutes > TASK_MINUTE_TOLERANCE) {
        warnings.push(`"${task.title}" is completed but still has future scheduled minutes.`);
      }

      if (
        remainingUnplacedMinutes > TASK_MINUTE_TOLERANCE ||
        unplacedTask ||
        remainingCarriedForwardMinutes > TASK_MINUTE_TOLERANCE ||
        carryForwardItem
      ) {
        warnings.push(`"${task.title}" is completed but still appears in remaining deferred work.`);
      }

      return;
    }

    if (skippedTaskIds.has(task.id)) {
      if (futurePlacedMinutes > TASK_MINUTE_TOLERANCE) {
        warnings.push(`"${task.title}" was skipped but still has future scheduled minutes.`);
      }

      if (unplacedTask || carryForwardItem) {
        warnings.push(`"${task.title}" was skipped but still appears in remaining deferred work.`);
      }

      return;
    }

    if (accountedMinutes < task.estimatedMinutes - TASK_MINUTE_TOLERANCE) {
      warnings.push(`"${task.title}" lost scheduled minutes across history, future blocks, and remaining work.`);
    }

    const taskBlocks = taskBlocksByTaskId.get(task.id) ?? [];

    if (
      !task.splittable &&
      taskBlocks.length > 1 &&
      !isAllowedBoundarySplit(taskBlocks, currentTime)
    ) {
      warnings.push(`"${task.title}" fragmented even though it is not splittable.`);
    }

    if (
      unplacedTask &&
      Math.abs(unplacedTask.remainingMinutes - remainingUnplacedMinutes) >
        TASK_MINUTE_TOLERANCE
    ) {
      warnings.push(`"${task.title}" has stale remaining-work accounting.`);
    }

    if (
      carryForwardItem &&
      Math.abs(carryForwardItem.remainingMinutes - remainingCarriedForwardMinutes) >
        TASK_MINUTE_TOLERANCE
    ) {
      warnings.push(`"${task.title}" has stale carried-forward accounting.`);
    }

    if (
      unplacedTask &&
      remainingUnplacedMinutes <= TASK_MINUTE_TOLERANCE
    ) {
      warnings.push(`"${task.title}" appears in remaining work even though nothing is left unplaced.`);
    }

    if (
      !unplacedTask &&
      remainingUnplacedMinutes > TASK_MINUTE_TOLERANCE
    ) {
      warnings.push(`"${task.title}" still has unplaced minutes but is missing from the remaining-work list.`);
    }

    if (
      !carryForwardItem &&
      remainingCarriedForwardMinutes > TASK_MINUTE_TOLERANCE
    ) {
      warnings.push(`"${task.title}" still has carried-forward minutes but is missing from the carry-forward list.`);
    }

    if (unplacedTask && carryForwardItem) {
      warnings.push(`"${task.title}" appears in both today's remaining work and carry forward at the same time.`);
    }

    if (
      !task.splittable &&
      futurePlacedMinutes > TASK_MINUTE_TOLERANCE &&
      remainingUnplacedMinutes > TASK_MINUTE_TOLERANCE
    ) {
      warnings.push(`"${task.title}" is non-splittable but exists in both placed and unplaced future work.`);
    }

    if (
      !task.splittable &&
      futurePlacedMinutes > TASK_MINUTE_TOLERANCE &&
      remainingCarriedForwardMinutes > TASK_MINUTE_TOLERANCE
    ) {
      warnings.push(`"${task.title}" is non-splittable but exists in both placed and carried-forward future work.`);
    }

    if (
      scheduledMinutes > task.estimatedMinutes + 60 &&
      !isCompleted
    ) {
      warnings.push(`"${task.title}" ballooned far past its estimate without being marked complete.`);
    }
  });
}

function validateDueWarningCoverage(
  dayPlan: DayPlan,
  carryForwardItems: CarryForwardItem[],
  dueWarnings: DueWarning[],
  warnings: string[]
) {
  const expectedWarnings = [
    ...deriveScheduledDueWarnings(dayPlan),
    ...deriveCarryForwardLateWarnings(
      carryForwardItems,
      dayPlan.planningWindow.endTime
    ),
  ];
  const dueWarningKeys = new Set(
    dueWarnings.map((dueWarning) => `${dueWarning.kind}:${dueWarning.taskId}`)
  );

  expectedWarnings.forEach((expectedWarning) => {
    if (!dueWarningKeys.has(`${expectedWarning.kind}:${expectedWarning.taskId}`)) {
      warnings.push(
        `Missing expected ${expectedWarning.kind.replace(/_/g, " ")} warning for "${expectedWarning.taskTitle}".`
      );
    }
  });
}

function isAllowedBoundarySplit(taskBlocks: ScheduleBlock[], currentTime: string) {
  if (taskBlocks.length < 2) {
    return false;
  }

  const currentMs = new Date(currentTime).getTime();
  const sortedBlocks = [...taskBlocks].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
  const firstBlock = sortedBlocks[0];
  const lastBlock = sortedBlocks[sortedBlocks.length - 1];

  for (let index = 1; index < sortedBlocks.length; index += 1) {
    const previousEndMs = new Date(sortedBlocks[index - 1].endTime).getTime();
    const nextStartMs = new Date(sortedBlocks[index].startTime).getTime();

    // Contiguous history/current boundaries are fine for non-splittable tasks.
    // Real fragmentation introduces a gap between segments.
    if (previousEndMs !== nextStartMs) {
      return false;
    }
  }

  const firstStartMs = new Date(firstBlock.startTime).getTime();
  const lastEndMs = new Date(lastBlock.endTime).getTime();

  return firstStartMs <= currentMs && currentMs <= lastEndMs;
}

function validateCurrentAndNextState(
  dayPlan: DayPlan,
  currentTime: string,
  warnings: string[]
) {
  const currentMs = new Date(currentTime).getTime();
  const planningStartMs = new Date(dayPlan.planningWindow.startTime).getTime();
  const planningEndMs = new Date(dayPlan.planningWindow.endTime).getTime();

  if (dayPlan.blocks.length === 0) {
    return;
  }

  const execution = deriveDayPlanExecutionSnapshot(dayPlan, currentTime);

  if (planningStartMs <= currentMs && currentMs < planningEndMs) {
    if (!execution.currentDisplayBlock) {
      warnings.push("The planner can no longer identify what is happening right now.");
      return;
    }

    if (
      (execution.currentTimeState === "before_first_block" ||
        execution.currentTimeState === "between_blocks") &&
      !execution.nextBlock
    ) {
      warnings.push("The planner lost the next block while the current time sits in open space.");
    }

    if (
      execution.currentTimeState === "after_last_block" &&
      execution.nextBlock
    ) {
      warnings.push("The planner still reports a next block after the route has ended for the day.");
    }
  }
}

function dedupeWarnings(warnings: string[]) {
  return Array.from(new Set(warnings));
}

function shouldPreserveTerminalBlockDuringReplan(
  block: ScheduleBlock,
  boundaryMs: number
) {
  const startMs = new Date(block.startTime).getTime();
  const endMs = new Date(block.endTime).getTime();

  return endMs <= boundaryMs || startMs <= boundaryMs;
}

function hasMatchingBlock(blocks: ScheduleBlock[], targetBlock: ScheduleBlock) {
  return blocks.some(
    (block) =>
      block.id === targetBlock.id &&
      block.status === targetBlock.status &&
      new Date(block.startTime).getTime() ===
        new Date(targetBlock.startTime).getTime() &&
      new Date(block.endTime).getTime() ===
        new Date(targetBlock.endTime).getTime()
  );
}

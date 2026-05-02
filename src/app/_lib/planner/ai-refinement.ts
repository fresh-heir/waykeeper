import { analyzeRouteFlowSequence } from "@/app/_lib/planner/route-flow";
import type {
  CarryForwardItem,
  DayPlan,
  ScheduleBlock,
  UnplacedTask,
} from "@/app/_lib/planner-types";

type AiRefinementOutcome = "offer" | "no_change";
type AiRefinementChange = "better" | "same" | "worse";

export interface AiRefinementEvaluationMetrics {
  candidateBreakBufferMinutesBeforeNextAnchor: number;
  candidateContextSwitchCount: number;
  candidateEarlyFlexibleTaskIds: string[];
  candidateOverflowTaskIds: string[];
  candidateShortFlexibleFragmentCount: number;
  candidateSplitFragmentCount: number;
  currentBreakBufferMinutesBeforeNextAnchor: number;
  currentContextSwitchCount: number;
  currentEarlyFlexibleTaskIds: string[];
  currentOverflowTaskIds: string[];
  currentShortFlexibleFragmentCount: number;
  currentSplitFragmentCount: number;
  earlyRouteChangedWithinNinetyMinutes: boolean;
}

export interface AiRefinementEvaluation {
  metrics: AiRefinementEvaluationMetrics;
  outcome: AiRefinementOutcome;
  reasons: string[];
}

export function evaluateDraftAiRefinement({
  candidateCarryForwardItems,
  candidateDayPlan,
  candidateUnplacedTasks,
  currentCarryForwardItems,
  currentDayPlan,
  currentTime,
  currentUnplacedTasks,
}: {
  candidateCarryForwardItems: CarryForwardItem[];
  candidateDayPlan: DayPlan;
  candidateUnplacedTasks: UnplacedTask[];
  currentCarryForwardItems: CarryForwardItem[];
  currentDayPlan: DayPlan;
  currentTime: string;
  currentUnplacedTasks: UnplacedTask[];
}): AiRefinementEvaluation {
  return evaluateAiRefinement({
    candidateCarryForwardItems,
    candidateDayPlan,
    candidateUnplacedTasks,
    currentCarryForwardItems,
    currentDayPlan,
    currentTime,
    currentUnplacedTasks,
    target: "route",
  });
}

export function evaluateReplanAiRefinement({
  candidateCarryForwardItems,
  candidateDayPlan,
  candidateUnplacedTasks,
  currentCarryForwardItems,
  currentDayPlan,
  currentTime,
  currentUnplacedTasks,
}: {
  candidateCarryForwardItems: CarryForwardItem[];
  candidateDayPlan: DayPlan;
  candidateUnplacedTasks: UnplacedTask[];
  currentCarryForwardItems: CarryForwardItem[];
  currentDayPlan: DayPlan;
  currentTime: string;
  currentUnplacedTasks: UnplacedTask[];
}): AiRefinementEvaluation {
  return evaluateAiRefinement({
    candidateCarryForwardItems,
    candidateDayPlan,
    candidateUnplacedTasks,
    currentCarryForwardItems,
    currentDayPlan,
    currentTime,
    currentUnplacedTasks,
    target: "remainder",
  });
}

function evaluateAiRefinement({
  candidateCarryForwardItems,
  candidateDayPlan,
  candidateUnplacedTasks,
  currentCarryForwardItems,
  currentDayPlan,
  currentTime,
  currentUnplacedTasks,
  target,
}: {
  candidateCarryForwardItems: CarryForwardItem[];
  candidateDayPlan: DayPlan;
  candidateUnplacedTasks: UnplacedTask[];
  currentCarryForwardItems: CarryForwardItem[];
  currentDayPlan: DayPlan;
  currentTime: string;
  currentUnplacedTasks: UnplacedTask[];
  target: "remainder" | "route";
}): AiRefinementEvaluation {
  const currentOverflowTaskIds = getOverflowTaskIds(
    currentCarryForwardItems,
    currentUnplacedTasks
  );
  const candidateOverflowTaskIds = getOverflowTaskIds(
    candidateCarryForwardItems,
    candidateUnplacedTasks
  );
  const currentSplitFragmentCount = getSplitFragmentCount(currentDayPlan.blocks);
  const candidateSplitFragmentCount = getSplitFragmentCount(candidateDayPlan.blocks);
  const currentShortFlexibleFragmentCount = getShortFlexibleFragmentCount(
    currentDayPlan.blocks
  );
  const candidateShortFlexibleFragmentCount = getShortFlexibleFragmentCount(
    candidateDayPlan.blocks
  );
  const currentBreakBufferMinutesBeforeNextAnchor =
    getBreakBufferMinutesBeforeNextAnchor(currentDayPlan.blocks, currentTime);
  const candidateBreakBufferMinutesBeforeNextAnchor =
    getBreakBufferMinutesBeforeNextAnchor(candidateDayPlan.blocks, currentTime);
  const currentFlow = analyzeRouteFlowSequence(
    currentDayPlan.blocks,
    currentDayPlan.tasks
  );
  const candidateFlow = analyzeRouteFlowSequence(
    candidateDayPlan.blocks,
    candidateDayPlan.tasks
  );
  const currentContextSwitchCount =
    currentFlow.locationSwitchCount + currentFlow.modeSwitchCount;
  const candidateContextSwitchCount =
    candidateFlow.locationSwitchCount + candidateFlow.modeSwitchCount;
  const currentEarlyFlexibleTaskIds = getEarlyFlexibleTaskIds(
    currentDayPlan.blocks,
    currentTime
  );
  const candidateEarlyFlexibleTaskIds = getEarlyFlexibleTaskIds(
    candidateDayPlan.blocks,
    currentTime
  );
  const earlyRouteChangedWithinNinetyMinutes =
    currentEarlyFlexibleTaskIds.join("|") !== candidateEarlyFlexibleTaskIds.join("|");

  const metrics: AiRefinementEvaluationMetrics = {
    candidateBreakBufferMinutesBeforeNextAnchor,
    candidateContextSwitchCount,
    candidateEarlyFlexibleTaskIds,
    candidateOverflowTaskIds,
    candidateShortFlexibleFragmentCount,
    candidateSplitFragmentCount,
    currentBreakBufferMinutesBeforeNextAnchor,
    currentContextSwitchCount,
    currentEarlyFlexibleTaskIds,
    currentOverflowTaskIds,
    currentShortFlexibleFragmentCount,
    currentSplitFragmentCount,
    earlyRouteChangedWithinNinetyMinutes,
  };

  const comparisons: Array<{
    change: AiRefinementChange;
    reason: string | null;
  }> = [
    compareOverflow({
      candidateOverflowTaskIds,
      currentOverflowTaskIds,
      target,
    }),
    compareFocusProtection({
      candidateShortFlexibleFragmentCount,
      candidateSplitFragmentCount,
      currentShortFlexibleFragmentCount,
      currentSplitFragmentCount,
    }),
    compareBreakHandling({
      candidateBreakBufferMinutesBeforeNextAnchor,
      currentBreakBufferMinutesBeforeNextAnchor,
    }),
    compareRouteFlow({
      candidateContextSwitchCount,
      currentContextSwitchCount,
    }),
    compareEarlyRoute({
      candidateEarlyFlexibleTaskIds,
      currentEarlyFlexibleTaskIds,
      earlyRouteChangedWithinNinetyMinutes,
      target,
    }),
  ];

  const firstBetterIndex = comparisons.findIndex(
    (comparison) => comparison.change === "better"
  );
  const hasHigherPriorityRegression =
    firstBetterIndex === -1
      ? comparisons.some((comparison) => comparison.change === "worse")
      : comparisons
          .slice(0, firstBetterIndex)
          .some((comparison) => comparison.change === "worse");

  if (firstBetterIndex === -1 || hasHigherPriorityRegression) {
    return {
      metrics,
      outcome: "no_change",
      reasons: [
        firstBetterIndex === -1
          ? "Differences were limited to minor timing shifts with the same practical route shape."
          : "The alternative regressed a higher-priority route quality, so the visible option stayed in place.",
      ],
    };
  }

  return {
    metrics,
    outcome: "offer",
    reasons: comparisons
      .filter((comparison) => comparison.change === "better")
      .flatMap((comparison) => (comparison.reason ? [comparison.reason] : []))
      .slice(0, 3),
  };
}

function compareOverflow({
  candidateOverflowTaskIds,
  currentOverflowTaskIds,
  target,
}: {
  candidateOverflowTaskIds: string[];
  currentOverflowTaskIds: string[];
  target: "remainder" | "route";
}): {
  change: AiRefinementChange;
  reason: string | null;
} {
  if (candidateOverflowTaskIds.length < currentOverflowTaskIds.length) {
    const countDifference =
      currentOverflowTaskIds.length - candidateOverflowTaskIds.length;

    return {
      change: "better",
      reason:
        countDifference === 1
          ? `It keeps 1 more task inside the ${target === "route" ? "day route" : "remainder"}.`
          : `It keeps ${countDifference} more tasks inside the ${target === "route" ? "day route" : "remainder"}.`,
    };
  }

  if (candidateOverflowTaskIds.length > currentOverflowTaskIds.length) {
    return {
      change: "worse",
      reason: null,
    };
  }

  if (candidateOverflowTaskIds.join("|") !== currentOverflowTaskIds.join("|")) {
    return {
      change: "better",
      reason:
        target === "route"
          ? "It changes which tasks stay outside today, so the deferred-task story is meaningfully different."
          : "It changes which tasks stay outside the revised remainder, so the tradeoff is meaningfully different.",
    };
  }

  return {
    change: "same",
    reason: null,
  };
}

function compareFocusProtection({
  candidateShortFlexibleFragmentCount,
  candidateSplitFragmentCount,
  currentShortFlexibleFragmentCount,
  currentSplitFragmentCount,
}: {
  candidateShortFlexibleFragmentCount: number;
  candidateSplitFragmentCount: number;
  currentShortFlexibleFragmentCount: number;
  currentSplitFragmentCount: number;
}) {
  if (candidateSplitFragmentCount < currentSplitFragmentCount) {
    return {
      change: "better" as const,
      reason: "It reduces split task fragments across the flexible route.",
    };
  }

  if (candidateSplitFragmentCount > currentSplitFragmentCount) {
    return {
      change: "worse" as const,
      reason: null,
    };
  }

  if (candidateShortFlexibleFragmentCount < currentShortFlexibleFragmentCount) {
    return {
      change: "better" as const,
      reason: "It reduces short flexible fragments.",
    };
  }

  if (candidateShortFlexibleFragmentCount > currentShortFlexibleFragmentCount) {
    return {
      change: "worse" as const,
      reason: null,
    };
  }

  return {
    change: "same" as const,
    reason: null,
  };
}

function compareBreakHandling({
  candidateBreakBufferMinutesBeforeNextAnchor,
  currentBreakBufferMinutesBeforeNextAnchor,
}: {
  candidateBreakBufferMinutesBeforeNextAnchor: number;
  currentBreakBufferMinutesBeforeNextAnchor: number;
}) {
  const difference =
    candidateBreakBufferMinutesBeforeNextAnchor -
    currentBreakBufferMinutesBeforeNextAnchor;

  if (difference >= 10) {
    return {
      change: "better" as const,
      reason: `It preserves ${difference} more minutes of break or open time before the next locked anchor.`,
    };
  }

  if (difference <= -10) {
    return {
      change: "worse" as const,
      reason: null,
    };
  }

  return {
    change: "same" as const,
    reason: null,
  };
}

function compareRouteFlow({
  candidateContextSwitchCount,
  currentContextSwitchCount,
}: {
  candidateContextSwitchCount: number;
  currentContextSwitchCount: number;
}) {
  if (candidateContextSwitchCount < currentContextSwitchCount) {
    return {
      change: "better" as const,
      reason: "It reduces unnecessary context switching across flexible work.",
    };
  }

  if (candidateContextSwitchCount > currentContextSwitchCount) {
    return {
      change: "worse" as const,
      reason: null,
    };
  }

  return {
    change: "same" as const,
    reason: null,
  };
}

function compareEarlyRoute({
  candidateEarlyFlexibleTaskIds,
  currentEarlyFlexibleTaskIds,
  earlyRouteChangedWithinNinetyMinutes,
  target,
}: {
  candidateEarlyFlexibleTaskIds: string[];
  currentEarlyFlexibleTaskIds: string[];
  earlyRouteChangedWithinNinetyMinutes: boolean;
  target: "remainder" | "route";
}) {
  if (!earlyRouteChangedWithinNinetyMinutes) {
    return {
      change: "same" as const,
      reason: null,
    };
  }

  const candidateLead = candidateEarlyFlexibleTaskIds[0];
  const currentLead = currentEarlyFlexibleTaskIds[0];

  return {
    change: "better" as const,
    reason:
      candidateLead && candidateLead !== currentLead
        ? `It changes the first stretch of flexible work in the next 90 minutes of the ${target === "route" ? "route" : "remainder"}.`
        : "It meaningfully changes the first stretch of flexible work without changing the higher-priority route constraints.",
  };
}

function getOverflowTaskIds(
  carryForwardItems: CarryForwardItem[],
  unplacedTasks: UnplacedTask[]
) {
  return [...new Set([
    ...carryForwardItems.map((item) => item.taskId),
    ...unplacedTasks.map((task) => task.taskId),
  ])].sort();
}

function getSplitFragmentCount(blocks: ScheduleBlock[]) {
  const taskPartCounts = new Map<string, number>();

  for (const block of blocks) {
    if (!isFlexibleTaskBlock(block)) {
      continue;
    }

    taskPartCounts.set(block.taskId!, (taskPartCounts.get(block.taskId!) ?? 0) + 1);
  }

  return [...taskPartCounts.values()].reduce(
    (total, count) => total + Math.max(count - 1, 0),
    0
  );
}

function getShortFlexibleFragmentCount(blocks: ScheduleBlock[]) {
  return blocks.filter(
    (block) => isFlexibleTaskBlock(block) && getBlockDurationMinutes(block) <= 30
  ).length;
}

function getBreakBufferMinutesBeforeNextAnchor(
  blocks: ScheduleBlock[],
  currentTime: string
) {
  const sortedBlocks = [...blocks].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
  const nextLockedAnchor = sortedBlocks.find(
    (block) =>
      block.locked &&
      new Date(block.startTime).getTime() > new Date(currentTime).getTime()
  );
  const anchorBoundary = nextLockedAnchor
    ? new Date(nextLockedAnchor.startTime).getTime()
    : Number.POSITIVE_INFINITY;

  return sortedBlocks
    .filter((block) => {
      const startTime = new Date(block.startTime).getTime();

      return (
        !block.locked &&
        startTime >= new Date(currentTime).getTime() &&
        startTime < anchorBoundary &&
        (block.blockType === "break" || block.blockType === "buffer")
      );
    })
    .reduce((total, block) => total + getBlockDurationMinutes(block), 0);
}

function getEarlyFlexibleTaskIds(blocks: ScheduleBlock[], currentTime: string) {
  const currentTimestamp = new Date(currentTime).getTime();
  const windowEnd = currentTimestamp + 90 * 60 * 1000;
  const taskIds: string[] = [];
  let previousTaskId: string | null = null;

  [...blocks]
    .sort(
      (left, right) =>
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    )
    .forEach((block) => {
      const startTime = new Date(block.startTime).getTime();

      if (
        !isFlexibleTaskBlock(block) ||
        startTime < currentTimestamp ||
        startTime >= windowEnd
      ) {
        return;
      }

      if (block.taskId && block.taskId !== previousTaskId) {
        taskIds.push(block.taskId);
        previousTaskId = block.taskId;
      }
    });

  return taskIds;
}

function isFlexibleTaskBlock(block: ScheduleBlock) {
  return (
    Boolean(block.taskId) &&
    !block.locked &&
    block.blockType !== "break" &&
    block.blockType !== "buffer" &&
    block.blockType !== "transition"
  );
}

function getBlockDurationMinutes(block: ScheduleBlock) {
  return Math.round(
    (new Date(block.endTime).getTime() - new Date(block.startTime).getTime()) /
      60000
  );
}

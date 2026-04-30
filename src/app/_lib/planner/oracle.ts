import type { DayPlanExecutionSnapshot } from "@/app/_lib/planner/scheduler";
import type { AiRefinementEvaluation } from "@/app/_lib/planner/ai-refinement";
import type {
  CarryForwardItem,
  DayPlan,
  ReplanMode,
  ReplanPreview,
  ScheduleBlock,
  UnplacedTask,
} from "@/app/_lib/planner-types";

export type OraclePanelPreference = "auto" | "adjust";
export type OracleDayPart = "morning" | "day" | "evening" | "night";

export type OracleRecentEventKind =
  | "plan_built"
  | "block_completed"
  | "block_skipped"
  | "block_delayed"
  | "replan_generated"
  | "replan_applied"
  | "manual_edit_applied"
  | "ai_fallback_used"
  | "ai_refinement_ready"
  | "ai_refinement_applied"
  | "ai_refinement_no_change";

export interface OracleRecentEvent {
  badges: string[];
  eventId: string;
  kind: OracleRecentEventKind;
  occurredAt: string;
  summaryLines: string[];
  title: string;
}

export interface OracleViewModel {
  adjust: {
    casualtyLabel: string | null;
    fragmentationLabel: string | null;
    futureLockedCount: number;
    overloadLabel: string | null;
    remainingFlexibleCount: number;
    slackLabel: string | null;
  };
  afterAction: OracleRecentEvent | null;
  dayPart: OracleDayPart;
  insightLines: string[];
  mode: "adjust" | "after_action" | "now";
}

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const priorityLabelRank: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};
let oracleEventSequence = 0;

export function deriveOracleViewModel({
  currentTime,
  dayPlan,
  execution,
  panelPreference,
  recentEvent,
  routeCarryForwardItems,
  routeOracleAdvice,
  routeUnplacedTasks,
  routeWarnings,
}: {
  currentTime: string;
  dayPlan: DayPlan;
  execution: DayPlanExecutionSnapshot;
  panelPreference: OraclePanelPreference;
  recentEvent: OracleRecentEvent | null;
  routeCarryForwardItems: CarryForwardItem[];
  routeOracleAdvice: string[];
  routeUnplacedTasks: UnplacedTask[];
  routeWarnings: string[];
}): OracleViewModel {
  const futureBlocks = dayPlan.blocks.filter(
    (block) => new Date(block.endTime).getTime() > new Date(currentTime).getTime()
  );
  const futureLockedBlocks = futureBlocks.filter((block) => block.locked);
  const futureFlexibleBlocks = futureBlocks.filter((block) => !block.locked);
  const futureFlexibleTaskBlocks = futureFlexibleBlocks.filter(
    (block) => block.blockType !== "buffer" && block.blockType !== "break"
  );
  const bufferMinutesAhead = futureBlocks
    .filter((block) => block.blockType === "buffer")
    .reduce((total, block) => total + getBlockDurationMinutes(block), 0);
  const upcomingAnchor = futureLockedBlocks.find(
    (block) => new Date(block.startTime).getTime() > new Date(currentTime).getTime()
  );
  const casualtyTask = futureFlexibleTaskBlocks
    .map((block) => dayPlan.tasks.find((task) => task.id === block.taskId))
    .filter(Boolean)
    .sort((left, right) => {
      const leftRank = priorityLabelRank[left!.priority] ?? 0;
      const rightRank = priorityLabelRank[right!.priority] ?? 0;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      if (left!.deferrable !== right!.deferrable) {
        return left!.deferrable ? -1 : 1;
      }

      return left!.estimatedMinutes - right!.estimatedMinutes;
    })[0];

  const fragmentationCount = futureFlexibleTaskBlocks.filter(
    (block) => getBlockDurationMinutes(block) <= 30
  ).length;

  return {
    adjust: {
      casualtyLabel: casualtyTask
        ? `${casualtyTask.title} is the likeliest first drop if the remainder tightens.`
        : null,
      fragmentationLabel:
        fragmentationCount >= 3
          ? `${fragmentationCount} short flexible blocks remain, so the remainder is already fragmented.`
          : null,
      futureLockedCount: futureLockedBlocks.length,
      overloadLabel:
        routeCarryForwardItems.length > 0 || routeUnplacedTasks.length > 0
          ? `${routeCarryForwardItems.length + routeUnplacedTasks.length} items already sit outside the clean route.`
          : null,
      remainingFlexibleCount: futureFlexibleBlocks.filter(
        (block) => block.status === "active" || block.status === "upcoming"
      ).length,
      slackLabel:
        bufferMinutesAhead > 0
          ? `${bufferMinutesAhead} minutes of open time still exist in the remainder.`
          : upcomingAnchor
            ? `No open slack sits before ${getSafeBlockTitle(upcomingAnchor)}.`
            : "No open slack is left in the remainder.",
    },
    afterAction:
      panelPreference === "adjust"
        ? recentEvent?.kind === "ai_refinement_no_change"
          ? recentEvent
          : null
        : recentEvent,
    dayPart: deriveOracleDayPart(currentTime),
    insightLines: buildNowInsights({
      currentTime,
      dayPlan,
      execution,
      routeCarryForwardItems,
      routeOracleAdvice,
      routeUnplacedTasks,
      routeWarnings,
    }),
    mode:
      panelPreference === "adjust"
        ? "adjust"
        : recentEvent
          ? "after_action"
          : "now",
  };
}

export function buildOracleMutationEvent({
  blockId,
  currentTime,
  delayMinutes,
  kind,
  nextDayPlan,
  previousDayPlan,
}: {
  blockId: string;
  currentTime: string;
  delayMinutes?: number;
  kind: "block_completed" | "block_delayed" | "block_skipped";
  nextDayPlan: DayPlan;
  previousDayPlan: DayPlan;
}): OracleRecentEvent {
  const previousBlock = previousDayPlan.blocks.find((block) => block.id === blockId);
  const nextBlock = nextDayPlan.blocks.find((block) => block.id === blockId);
  const title = previousBlock ? getSafeBlockTitle(previousBlock) : "Current block";
  const removedSiblingCount = previousBlock?.taskId
    ? Math.max(
        previousDayPlan.blocks.filter(
          (block) =>
            block.taskId === previousBlock.taskId &&
            block.id !== blockId &&
            !block.locked &&
            !isTerminalBlock(block)
        ).length -
          nextDayPlan.blocks.filter(
            (block) =>
              block.taskId === previousBlock.taskId &&
              block.id !== blockId &&
              !block.locked &&
              !isTerminalBlock(block)
          ).length,
        0
      )
    : 0;
  const lockedAhead = nextDayPlan.blocks.filter(
    (block) =>
      block.locked && new Date(block.endTime).getTime() > new Date(currentTime).getTime()
  ).length;
  const summaryLines =
    kind === "block_completed"
      ? [
          `Marked ${quoteTitle(title)} complete.`,
          removedSiblingCount > 0
            ? `Cleared ${removedSiblingCount} remaining block${removedSiblingCount === 1 ? "" : "s"} for that task from the route.`
            : "The remainder stayed in place around the completed history.",
          lockedAhead > 0
            ? `Locked anchors still ahead stayed fixed.`
            : "No locked anchors ahead needed protection.",
        ]
      : kind === "block_skipped"
        ? [
            `Skipped ${quoteTitle(title)}.`,
            removedSiblingCount > 0
              ? `Removed ${removedSiblingCount} later block${removedSiblingCount === 1 ? "" : "s"} for the same task from the route.`
              : "The planner preserved the remaining route structure after the skip.",
            lockedAhead > 0
              ? `Locked anchors still ahead stayed fixed.`
              : "No locked anchors ahead needed protection.",
          ]
        : [
            `Extended ${quoteTitle(title)} by ${delayMinutes ?? 0} minutes.`,
            buildDelayConsequenceLine(previousDayPlan, nextDayPlan, previousBlock, nextBlock),
            lockedAhead > 0
              ? "Locked anchors stayed fixed while flexible work shifted later."
              : "Only flexible work moved to make room for the delay.",
          ];

  return {
    badges:
      kind === "block_delayed" && delayMinutes
        ? [`${delayMinutes}m delay`]
        : kind === "block_completed"
          ? ["Completed"]
          : ["Skipped"],
    eventId: createOracleEventId(kind, currentTime),
    kind,
    occurredAt: currentTime,
    summaryLines,
    title:
      kind === "block_completed"
        ? "Block completed"
        : kind === "block_skipped"
          ? "Block skipped"
          : "Block delayed",
  };
}

export function buildOracleBuildEvent({
  currentTime,
  kind,
  nextDayPlan,
  previousDayPlan,
  routeCarryForwardItems,
  routeUnplacedTasks,
  usedLocalFallback = false,
}: {
  currentTime: string;
  kind: "manual_edit_applied" | "plan_built";
  nextDayPlan: DayPlan;
  previousDayPlan?: DayPlan | null;
  routeCarryForwardItems: CarryForwardItem[];
  routeUnplacedTasks: UnplacedTask[];
  usedLocalFallback?: boolean;
}): OracleRecentEvent {
  const preservedHistoryCount = previousDayPlan
    ? previousDayPlan.blocks.filter((block) => isTerminalBlock(block)).length
    : 0;
  const summaryLines = [
    kind === "plan_built"
      ? `Built ${nextDayPlan.blocks.length} route blocks for the day.`
      : "Rebuilt the route from the edited day state.",
    preservedHistoryCount > 0
      ? `Preserved ${preservedHistoryCount} completed or skipped history block${preservedHistoryCount === 1 ? "" : "s"} while revising the rest.`
      : `Protected ${nextDayPlan.blocks.filter((block) => block.locked).length} locked anchor${nextDayPlan.blocks.filter((block) => block.locked).length === 1 ? "" : "s"} while arranging flexible work around them.`,
    routeCarryForwardItems.length > 0 || routeUnplacedTasks.length > 0
      ? `${routeCarryForwardItems.length + routeUnplacedTasks.length} task${routeCarryForwardItems.length + routeUnplacedTasks.length === 1 ? "" : "s"} still sit outside the clean route, and Oracle is showing that plainly.`
      : "Everything currently fits inside today without hidden overflow.",
  ];

  if (usedLocalFallback) {
    summaryLines.push("A validated local route was used because AI was unavailable or too slow.");
  }

  return {
    badges: usedLocalFallback ? ["Local fallback"] : ["Route ready"],
    eventId: createOracleEventId(kind, currentTime),
    kind,
    occurredAt: currentTime,
    summaryLines,
    title: kind === "plan_built" ? "Route built" : "Route updated",
  };
}

export function buildOracleReplanEvent({
  currentTime,
  kind,
  preview,
  usedLocalFallback = false,
}: {
  currentTime: string;
  kind: "replan_applied" | "replan_generated";
  preview: ReplanPreview;
  usedLocalFallback?: boolean;
}): OracleRecentEvent {
  const summaryLines = [...preview.summary.summaryLines];

  if (usedLocalFallback) {
    summaryLines.push("A validated local remainder was used because AI was unavailable or too slow.");
  }

  return {
    badges: [
      getReplanModeLabel(preview.mode),
      ...(usedLocalFallback ? ["Local fallback"] : []),
    ],
    eventId: createOracleEventId(kind, currentTime),
    kind,
    occurredAt: currentTime,
    summaryLines,
    title: kind === "replan_generated" ? "Revised plan ready" : "Replan applied",
  };
}

export function buildOracleFallbackEvent({
  currentTime,
  flow,
}: {
  currentTime: string;
  flow: "draft" | "replan";
}): OracleRecentEvent {
  return {
    badges: ["Local fallback"],
    eventId: createOracleEventId("ai_fallback_used", currentTime),
    kind: "ai_fallback_used",
    occurredAt: currentTime,
    summaryLines: [
      flow === "draft"
        ? "A validated local route was used because AI draft scheduling was unavailable or too slow."
        : "A validated local remainder was used because AI replanning was unavailable or too slow.",
      "The planner state still comes from the normal route flow rather than from freeform Oracle text.",
    ],
    title: flow === "draft" ? "Local route used" : "Local replan used",
  };
}

export function buildOracleDraftRefinementSummary({
  currentDraft,
  evaluation,
  refinedDraft,
}: {
  currentDraft: {
    carryForwardItems: CarryForwardItem[];
    dayPlan: DayPlan;
    unplacedTasks: UnplacedTask[];
  };
  evaluation: AiRefinementEvaluation;
  refinedDraft: {
    carryForwardItems: CarryForwardItem[];
    dayPlan: DayPlan;
    unplacedTasks: UnplacedTask[];
  };
}) {
  const summaryLines = [
    "A second pass found a different validated route for the same day.",
  ];
  const evaluationReasons = evaluation.reasons.slice(0, 2);

  if (evaluationReasons.length > 0) {
    summaryLines.push(...evaluationReasons);
  }

  const overflowLine = buildOverflowDifferenceLine({
    currentCount:
      currentDraft.carryForwardItems.length + currentDraft.unplacedTasks.length,
    nextCount:
      refinedDraft.carryForwardItems.length + refinedDraft.unplacedTasks.length,
  });
  const orderLine = buildFirstFlexibleDifferenceLine(
    currentDraft.dayPlan,
    refinedDraft.dayPlan
  );

  if (summaryLines.length < 3 && overflowLine) {
    summaryLines.push(overflowLine);
  }

  if (summaryLines.length < 3 && orderLine) {
    summaryLines.push(orderLine);
  }

  if (summaryLines.length === 1) {
    summaryLines.push(
      "It keeps the same visible constraints but changes the ordering or pacing of flexible work."
    );
  }

  return summaryLines.slice(0, 3);
}

export function buildOracleReplanRefinementSummary({
  currentPreview,
  evaluation,
  refinedPreview,
}: {
  currentPreview: ReplanPreview;
  evaluation: AiRefinementEvaluation;
  refinedPreview: ReplanPreview;
}) {
  const summaryLines = [
    "A second pass found a different validated remainder.",
  ];
  const evaluationReasons = evaluation.reasons.slice(0, 2);

  if (evaluationReasons.length > 0) {
    summaryLines.push(...evaluationReasons);
  }

  const overflowLine = buildOverflowDifferenceLine({
    currentCount:
      currentPreview.carryForwardItems.length + currentPreview.unplacedTasks.length,
    nextCount:
      refinedPreview.carryForwardItems.length + refinedPreview.unplacedTasks.length,
  });
  const orderLine = buildFirstFlexibleDifferenceLine(
    currentPreview.dayPlan,
    refinedPreview.dayPlan
  );

  if (summaryLines.length < 3 && overflowLine) {
    summaryLines.push(overflowLine);
  }

  if (summaryLines.length < 3 && orderLine) {
    summaryLines.push(orderLine);
  }

  if (summaryLines.length === 1) {
    summaryLines.push(
      "It keeps the same boundary and anchors but rearranges the unfinished remainder differently."
    );
  }

  return summaryLines.slice(0, 3);
}

export function buildOracleAiRefinementEvent({
  currentTime,
  outcome,
  target,
}: {
  currentTime: string;
  outcome: "applied" | "no_change" | "ready";
  target: "route" | "remainder";
}): OracleRecentEvent {
  if (outcome === "no_change") {
    return {
      badges: ["No change"],
      eventId: createOracleEventId("ai_refinement_no_change", currentTime),
      kind: "ai_refinement_no_change",
      occurredAt: currentTime,
      summaryLines: [
        target === "route"
          ? "The AI review did not find a meaningfully better validated route than the one already on screen."
          : "The AI review did not find a meaningfully better validated remainder than the preview already on screen.",
      ],
      title: "Second pass checked",
    };
  }

  if (outcome === "ready") {
    return {
      badges: ["Second pass"],
      eventId: createOracleEventId("ai_refinement_ready", currentTime),
      kind: "ai_refinement_ready",
      occurredAt: currentTime,
      summaryLines: [
        target === "route"
          ? "A different validated route is ready to review."
          : "A different validated remainder is ready to review.",
      ],
      title: "Second pass ready",
    };
  }

  return {
    badges: ["AI refinement"],
    eventId: createOracleEventId("ai_refinement_applied", currentTime),
    kind: "ai_refinement_applied",
    occurredAt: currentTime,
    summaryLines: [
      target === "route"
        ? "Applied the AI-refined route after reviewing the visible local version first."
        : "Applied the AI-refined remainder after reviewing the visible local preview first.",
    ],
    title: target === "route" ? "Refined route applied" : "Refined remainder applied",
  };
}

function createOracleEventId(kind: OracleRecentEventKind, occurredAt: string) {
  oracleEventSequence += 1;

  return `${kind}-${occurredAt}-${oracleEventSequence}`;
}

function deriveOracleDayPart(currentTime: string): OracleDayPart {
  const currentHour = new Date(currentTime).getHours();

  if (currentHour >= 5 && currentHour <= 10) {
    return "morning";
  }

  if (currentHour >= 11 && currentHour <= 16) {
    return "day";
  }

  if (currentHour >= 17 && currentHour <= 20) {
    return "evening";
  }

  return "night";
}

function buildNowInsights({
  currentTime,
  dayPlan,
  execution,
  routeCarryForwardItems,
  routeOracleAdvice,
  routeUnplacedTasks,
  routeWarnings,
}: {
  currentTime: string;
  dayPlan: DayPlan;
  execution: DayPlanExecutionSnapshot;
  routeCarryForwardItems: CarryForwardItem[];
  routeOracleAdvice: string[];
  routeUnplacedTasks: UnplacedTask[];
  routeWarnings: string[];
}) {
  const insights: string[] = [];
  const currentBlock = execution.currentDisplayBlock;
  const nextBlock = execution.nextBlock;
  const currentTask = currentBlock?.taskId
    ? dayPlan.tasks.find((task) => task.id === currentBlock.taskId)
    : null;

  if (
    currentBlock &&
    currentTask &&
    currentBlock.blockType === "focus" &&
    currentTask.splittable === false
  ) {
    insights.push(
      `${getSafeBlockTitle(currentBlock)} should stay intact; lighter flexible work is a better casualty than splitting it.`
    );
  }

  if (
    currentBlock &&
    nextBlock &&
    !currentBlock.locked &&
    nextBlock.blockType === "break"
  ) {
    insights.push(
      `Finishing ${getSafeBlockTitle(currentBlock)} on time protects the recovery window right after it.`
    );
  }

  const slackToNextAnchor = getSlackToNextAnchor(dayPlan, currentTime, currentBlock, nextBlock);

  if (slackToNextAnchor !== null) {
    insights.push(
      slackToNextAnchor <= 0
        ? "There is no slack before the next anchor, so any further delay will move flexible work immediately."
        : `${slackToNextAnchor} minutes of slack remain before the next locked anchor.`
    );
  }

  if (routeCarryForwardItems.length > 0 || routeUnplacedTasks.length > 0) {
    insights.push(
      "Today is already overloaded in places. Protect the placed route first and let overflow stay explicit."
    );
  }

  if (insights.length < 2) {
    for (const advice of routeOracleAdvice) {
      const normalizedAdvice = advice.trim();

      if (normalizedAdvice && !insights.includes(normalizedAdvice)) {
        insights.push(normalizedAdvice);
      }

      if (insights.length >= 2) {
        break;
      }
    }
  }

  if (insights.length === 0 && routeWarnings.length > 0) {
    insights.push(routeWarnings[0]!);
  }

  if (insights.length === 0) {
    insights.push("Route is holding as written. Revise the remainder only if reality has already diverged from the timeline.");
  }

  return insights.slice(0, 2);
}

function buildDelayConsequenceLine(
  previousDayPlan: DayPlan,
  nextDayPlan: DayPlan,
  previousBlock: ScheduleBlock | undefined,
  nextBlock: ScheduleBlock | undefined
) {
  const previousOrdered = getFutureFlexibleBlocks(previousDayPlan);
  const nextOrdered = getFutureFlexibleBlocks(nextDayPlan);
  const changedBlock = nextOrdered.find((block, index) => {
    const previousAtIndex = previousOrdered[index];

    return (
      previousAtIndex &&
      (block.id !== previousAtIndex.id ||
        block.startTime !== previousAtIndex.startTime ||
        block.endTime !== previousAtIndex.endTime)
    );
  });

  if (changedBlock && previousBlock && changedBlock.id !== previousBlock.id) {
    return `${getSafeBlockTitle(changedBlock)} moved later to absorb the delay.`;
  }

  if (previousBlock && nextBlock && previousBlock.id === nextBlock.id) {
    return "The rest of the route stayed in place because there was enough slack to absorb the delay.";
  }

  return "Flexible work later in the route shifted to absorb the delay.";
}

function buildOverflowDifferenceLine({
  currentCount,
  nextCount,
}: {
  currentCount: number;
  nextCount: number;
}) {
  if (currentCount === nextCount) {
    return null;
  }

  if (nextCount === 0) {
    return "It keeps everything inside today instead of leaving visible overflow.";
  }

  if (nextCount < currentCount) {
    return `It keeps ${currentCount - nextCount} more task${currentCount - nextCount === 1 ? "" : "s"} inside today.`;
  }

  return `It pushes ${nextCount - currentCount} more task${nextCount - currentCount === 1 ? "" : "s"} outside the clean route.`;
}

function buildFirstFlexibleDifferenceLine(
  currentDayPlan: DayPlan,
  nextDayPlan: DayPlan
) {
  const currentFirstFlexible = getFutureFlexibleBlocks(currentDayPlan)[0];
  const nextFirstFlexible = getFutureFlexibleBlocks(nextDayPlan)[0];

  if (!currentFirstFlexible || !nextFirstFlexible) {
    return null;
  }

  if (
    currentFirstFlexible.taskId === nextFirstFlexible.taskId &&
    currentFirstFlexible.startTime === nextFirstFlexible.startTime &&
    currentFirstFlexible.endTime === nextFirstFlexible.endTime
  ) {
    return null;
  }

  return `${quoteTitle(getSafeBlockTitle(nextFirstFlexible))} would lead instead of ${quoteTitle(getSafeBlockTitle(currentFirstFlexible))}.`;
}

function getFutureFlexibleBlocks(dayPlan: DayPlan) {
  return [...dayPlan.blocks]
    .filter((block) => !block.locked && !isTerminalBlock(block))
    .sort(
      (left, right) =>
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    );
}

function getSlackToNextAnchor(
  dayPlan: DayPlan,
  currentTime: string,
  currentBlock: ScheduleBlock | null,
  nextBlock: ScheduleBlock | null
) {
  const currentMs = new Date(currentTime).getTime();
  const nextAnchor = [...dayPlan.blocks]
    .filter(
      (block) =>
        block.locked && new Date(block.startTime).getTime() > currentMs
    )
    .sort(
      (left, right) =>
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    )[0];

  if (!nextAnchor) {
    return null;
  }

  const boundaryMs = currentBlock
    ? new Date(currentBlock.endTime).getTime()
    : nextBlock
      ? new Date(nextBlock.startTime).getTime()
      : currentMs;

  return Math.round((new Date(nextAnchor.startTime).getTime() - boundaryMs) / 60000);
}

function getReplanModeLabel(mode: ReplanMode) {
  switch (mode) {
    case "keep_essentials_only":
      return "Keep essentials only";
    case "gentler_remainder":
      return "Gentler remainder";
    case "use_productive_breaks":
      return "Use productive breaks";
    case "preserve_focus_first":
      return "Preserve focus first";
    case "replan_from_now":
    default:
      return "Replan from now";
  }
}

export function getSafeBlockTitle(block: ScheduleBlock) {
  const normalizedTitle = block.title
    .replace(
      /\s+\d+\s*(?:m|min|mins|h|hr|hrs|hour|hours)\b(?=\s*(?:·\s*part\s*\d+)?$)/i,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();

  return normalizedTitle || "Current block";
}

export function formatBlockRange(startTime: string, endTime: string) {
  return `${timeFormatter.format(new Date(startTime))} - ${timeFormatter.format(
    new Date(endTime)
  )}`;
}

export function formatDueAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getBlockDurationMinutes(block: ScheduleBlock) {
  return Math.round(
    (new Date(block.endTime).getTime() - new Date(block.startTime).getTime()) /
      60000
  );
}

function isTerminalBlock(block: ScheduleBlock) {
  return block.status === "done" || block.status === "expired" || block.status === "skipped";
}

function quoteTitle(value: string) {
  return `"${value}"`;
}

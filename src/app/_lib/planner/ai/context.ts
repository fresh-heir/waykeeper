import {
  buildPreviewPlanningWindow,
  getActivePlannerInputText,
  type DaySetupDraft,
  type IntakeFlowContext,
} from "@/app/_lib/intake-flow";
import type {
  PlannerAiAcceptedDraftProposal,
  PlannerAiAcceptedReplanProposal,
  PlannerAiBlockDelta,
  PlannerAiDraftLocalScaffold,
  PlannerAiDraftPayload,
  PlannerAiDueWarningTransport,
  PlannerAiHardEventTransport,
  PlannerAiParsePayload,
  PlannerAiParseTaskTransport,
  PlannerAiParseStrategy,
  PlannerAiReplanLocalScaffold,
  PlannerAiReplanPayload,
  PlannerAiScheduleBlockTransport,
  PlannerAiSchedulingTaskTransport,
  PlannerAiTaskDelta,
  PlannerAiUnplacedTaskTransport,
} from "@/app/_lib/planner/ai/types";
import { interpretDaySetup } from "@/app/_lib/planner/interpret";
import {
  analyzeRouteFlowSequence,
  inferTaskRouteFlowContext,
} from "@/app/_lib/planner/route-flow";
import { deriveTaskMinuteLedger } from "@/app/_lib/planner/scheduler";
import type {
  BreakCadence,
  BreakMode,
  DayPlan,
  DraftScheduleResponse,
  DueWarning,
  HardEvent,
  ParsedTaskResponse,
  ReplanPreview,
  ReplanMode,
  ScheduleBlock,
  Task,
} from "@/app/_lib/planner-types";

export function buildPlannerAiParseContext({
  hasBlockingErrors,
  context,
  draft,
}: {
  draft: DaySetupDraft;
  context: IntakeFlowContext;
  hasBlockingErrors: boolean;
}) {
  const baselineResponse = interpretDaySetup({
    draft,
    context,
  });
  const strategy: PlannerAiParseStrategy = isPlannerAiParseHighConfidence({
    baselineResponse,
    hasBlockingErrors,
  })
    ? "refine"
    : "full";

  const payload: PlannerAiParsePayload = {
    rawText: getActivePlannerInputText(draft),
    planningWindow: buildPreviewPlanningWindow(draft, context),
    breakMode: draft.breakMode,
    baselineTasks: baselineResponse.tasks.map((task) =>
      strategy === "refine"
        ? buildRefinementTaskPayload(task)
        : buildFullTaskPayload(task)
    ),
    inferredHardEvents:
      baselineResponse.hardEvents.length > 0
        ? baselineResponse.hardEvents.map((event) => buildHardEventPayload(event))
        : undefined,
  };

  return {
    baselineResponse,
    payload,
    strategy,
  };
}

export function buildPlannerAiDraftPayload({
  breakCadence,
  breakMode,
  currentTime,
  hardEvents,
  localScaffold,
  paceMode,
  planningWindow,
  previousAcceptedAiProposal,
  changedTaskIds,
  taskDeltas,
  tasks,
}: {
  breakCadence: BreakCadence;
  breakMode: BreakMode;
  currentTime: string;
  hardEvents: HardEvent[];
  localScaffold: PlannerAiDraftLocalScaffold;
  paceMode: DayPlan["paceMode"];
  planningWindow: DayPlan["planningWindow"];
  previousAcceptedAiProposal?: PlannerAiAcceptedDraftProposal;
  changedTaskIds?: string[];
  taskDeltas?: PlannerAiTaskDelta[];
  tasks: Task[];
}): PlannerAiDraftPayload {
  return {
    currentTime,
    planningWindow,
    breakMode,
    breakCadence,
    paceMode,
    tasks: tasks.map((task) => buildSchedulingTaskPayload(task)),
    hardEvents: hardEvents.map((event) => buildHardEventPayload(event)),
    localScaffold: buildDraftLocalScaffoldPayload(localScaffold),
    previousAcceptedAiProposal: previousAcceptedAiProposal
      ? buildAcceptedDraftProposalPayload(previousAcceptedAiProposal)
      : undefined,
    changedTaskIds,
    taskDeltas: taskDeltas?.map((delta) => buildTaskDeltaPayload(delta)),
  };
}

export function buildPlannerAiReplanPayload({
  currentTime,
  dayPlan,
  localScaffold,
  previousAcceptedAiProposal,
  replanMode,
  changedTaskIds,
  taskDeltas,
  changedBlockIds,
  blockDeltas,
}: {
  currentTime: string;
  dayPlan: DayPlan;
  localScaffold: PlannerAiReplanLocalScaffold;
  previousAcceptedAiProposal?: PlannerAiAcceptedReplanProposal;
  replanMode: ReplanMode;
  changedTaskIds?: string[];
  taskDeltas?: PlannerAiTaskDelta[];
  changedBlockIds?: string[];
  blockDeltas?: PlannerAiBlockDelta[];
}): PlannerAiReplanPayload {
  const completedBlockIds = dayPlan.blocks
    .filter((block) => block.status === "done" || block.status === "skipped")
    .map((block) => block.id);
  const remainingTaskIds = deriveTaskMinuteLedger(dayPlan, currentTime)
    .filter(
      (entry) =>
        !entry.isCompleted &&
        entry.futurePlacedMinutes + entry.remainingUnplacedMinutes > 0
    )
    .map((entry) => entry.task.id);
  const relevantBlockTaskIds = new Set(
    dayPlan.blocks
      .filter((block) => new Date(block.endTime).getTime() > new Date(currentTime).getTime())
      .flatMap((block) => (block.taskId ? [block.taskId] : []))
  );
  const relevantTaskIds = new Set([...remainingTaskIds, ...relevantBlockTaskIds]);

  return {
    currentTime,
    planningWindow: dayPlan.planningWindow,
    breakMode: dayPlan.breakMode,
    breakCadence: dayPlan.breakCadence,
    paceMode: dayPlan.paceMode,
    replanMode,
    tasks: dayPlan.tasks
      .filter((task) => relevantTaskIds.has(task.id))
      .map((task) => buildSchedulingTaskPayload(task)),
    currentBlocks: dayPlan.blocks
      .filter(
        (block) =>
          new Date(block.endTime).getTime() > new Date(currentTime).getTime() &&
          (block.status === "active" ||
            block.status === "upcoming" ||
            block.locked)
      )
      .map((block) => buildScheduleBlockPayload(block, { includeStatus: true })),
    completedBlockIds,
    remainingTaskIds,
    hardEvents: dayPlan.hardEvents.map((event) => buildHardEventPayload(event)),
    localScaffold: buildReplanLocalScaffoldPayload(localScaffold),
    previousAcceptedAiProposal: previousAcceptedAiProposal
      ? buildAcceptedReplanProposalPayload(previousAcceptedAiProposal)
      : undefined,
    changedTaskIds,
    taskDeltas: taskDeltas?.map((delta) => buildTaskDeltaPayload(delta)),
    changedBlockIds,
    blockDeltas: blockDeltas?.map((delta) => buildBlockDeltaPayload(delta)),
  };
}

export function buildDraftPayloadFromParsedTasks({
  currentTime,
  draft,
  hardEvents,
  localScaffold,
  parsedTaskResponse,
  previousAcceptedAiProposal,
  changedTaskIds,
  taskDeltas,
  context,
}: {
  currentTime: string;
  draft: DaySetupDraft;
  hardEvents: HardEvent[];
  localScaffold: PlannerAiDraftLocalScaffold;
  parsedTaskResponse: ParsedTaskResponse;
  previousAcceptedAiProposal?: PlannerAiAcceptedDraftProposal;
  changedTaskIds?: string[];
  taskDeltas?: PlannerAiTaskDelta[];
  context: IntakeFlowContext;
}) {
  return buildPlannerAiDraftPayload({
    breakCadence: draft.breakCadence,
    breakMode: draft.breakMode,
    currentTime,
    hardEvents,
    localScaffold,
    paceMode: draft.paceMode,
    planningWindow: buildPreviewPlanningWindow(draft, context),
    previousAcceptedAiProposal,
    changedTaskIds,
    taskDeltas,
    tasks: parsedTaskResponse.tasks,
  });
}

export function buildPlannerAiDraftLocalScaffold(
  draftScheduleResponse: DraftScheduleResponse
): PlannerAiDraftLocalScaffold {
  return {
    blocks: draftScheduleResponse.dayPlan.blocks.map((block) =>
      buildScheduleBlockPayload(block)
    ),
    unplacedTasks: draftScheduleResponse.unplacedTasks.map((task) =>
      buildUnplacedTaskPayload(task)
    ),
    carryForwardTaskIds: [...draftScheduleResponse.carryForwardTaskIds],
    dueWarnings: draftScheduleResponse.dueWarnings.map((warning) =>
      buildDueWarningPayload(warning)
    ),
    warnings: [...draftScheduleResponse.warnings],
    qualityHints: buildDraftScaffoldQualityHints(draftScheduleResponse),
  };
}

export function buildPlannerAiReplanLocalScaffold(
  replanPreview: ReplanPreview
): PlannerAiReplanLocalScaffold {
  return {
    blocks: replanPreview.dayPlan.blocks.map((block) =>
      buildScheduleBlockPayload(block)
    ),
    carryForwardTaskIds: [...replanPreview.carryForwardTaskIds],
    dueWarnings: replanPreview.dueWarnings.map((warning) =>
      buildDueWarningPayload(warning)
    ),
    warnings: [...replanPreview.warnings],
    summaryLines: [...replanPreview.summary.summaryLines],
    qualityHints: buildReplanScaffoldQualityHints(replanPreview),
  };
}

export function isPlannerAiParseHighConfidence({
  baselineResponse,
  hasBlockingErrors,
}: {
  baselineResponse: ParsedTaskResponse;
  hasBlockingErrors: boolean;
}) {
  if (hasBlockingErrors || baselineResponse.tasks.length === 0) {
    return false;
  }

  if ((baselineResponse.followUpQuestions?.length ?? 0) > 0) {
    return false;
  }

  return baselineResponse.tasks.every(
    (task) =>
      task.timingPreference?.decisionState !== "pending" &&
      task.dueDatePreference?.decisionState !== "pending"
  );
}

function buildRefinementTaskPayload(task: Task): PlannerAiParseTaskTransport {
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    estimatedMinutes: task.estimatedMinutes,
    priority: task.priority,
    mustDoToday: task.mustDoToday,
    breakEligible: task.breakEligible,
    splittable: task.splittable,
    deferrable: task.deferrable,
    energyLevel: task.energyLevel,
    dueAt: task.dueAt,
  };
}

function buildFullTaskPayload(task: Task): PlannerAiParseTaskTransport {
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    estimatedMinutes: task.estimatedMinutes,
    priority: task.priority,
    mustDoToday: task.mustDoToday,
    breakEligible: task.breakEligible,
    splittable: task.splittable,
    deferrable: task.deferrable,
    energyLevel: task.energyLevel,
    dueAt: task.dueAt,
  };
}

function buildSchedulingTaskPayload(
  task: Task | PlannerAiSchedulingTaskTransport
): PlannerAiSchedulingTaskTransport {
  const timeAffinityLabel =
    "timeAffinityLabel" in task && task.timeAffinityLabel
      ? task.timeAffinityLabel
      : "timeAffinity" in task && task.timeAffinity
        ? task.timeAffinity.displayLabel
        : undefined;

  return {
    id: task.id,
    title: task.title,
    type: task.type,
    estimatedMinutes: task.estimatedMinutes,
    priority: task.priority,
    mustDoToday: task.mustDoToday,
    breakEligible: task.breakEligible,
    splittable: task.splittable,
    deferrable: task.deferrable,
    energyLevel: task.energyLevel,
    dueAt: task.dueAt,
    beforeTaskIds: task.beforeTaskIds ? [...task.beforeTaskIds] : undefined,
    hardStartTime: task.hardStartTime,
    hardEndTime: task.hardEndTime,
    carryForward: task.carryForward,
    carriedFromDate: task.carriedFromDate,
    carryForwardStatus: task.carryForwardStatus,
    routeContext:
      "routeContext" in task && task.routeContext
        ? task.routeContext
        : inferTaskRouteFlowContext(task as Task),
    timeAffinityLabel,
  };
}

function buildHardEventPayload(event: HardEvent): PlannerAiHardEventTransport {
  return {
    id: event.id,
    title: event.title,
    startTime: event.startTime,
    endTime: event.endTime,
    locked: true,
  };
}

function buildScheduleBlockPayload(
  block: DayPlan["blocks"][number] | PlannerAiScheduleBlockTransport,
  options?: {
    includeStatus?: boolean;
  }
): PlannerAiScheduleBlockTransport {
  return {
    id: block.id,
    taskId: block.taskId,
    blockType: block.blockType,
    startTime: block.startTime,
    endTime: block.endTime,
    locked: block.locked,
    ...(options?.includeStatus && "status" in block && block.status
      ? { status: block.status }
      : {}),
  };
}

function buildDraftLocalScaffoldPayload(
  scaffold: PlannerAiDraftLocalScaffold
): PlannerAiDraftLocalScaffold {
  return {
    blocks: scaffold.blocks.map((block) => buildScheduleBlockPayload(block)),
    unplacedTasks: scaffold.unplacedTasks.map((task) => buildUnplacedTaskPayload(task)),
    carryForwardTaskIds: [...scaffold.carryForwardTaskIds],
    dueWarnings: scaffold.dueWarnings.map((warning) => buildDueWarningPayload(warning)),
    warnings: trimTransportStringList(scaffold.warnings),
    qualityHints: trimTransportStringList(scaffold.qualityHints),
  };
}

function buildReplanLocalScaffoldPayload(
  scaffold: PlannerAiReplanLocalScaffold
): PlannerAiReplanLocalScaffold {
  return {
    blocks: scaffold.blocks.map((block) => buildScheduleBlockPayload(block)),
    carryForwardTaskIds: [...scaffold.carryForwardTaskIds],
    dueWarnings: scaffold.dueWarnings.map((warning) => buildDueWarningPayload(warning)),
    warnings: trimTransportStringList(scaffold.warnings),
    summaryLines: trimTransportStringList(scaffold.summaryLines),
    qualityHints: trimTransportStringList(scaffold.qualityHints),
  };
}

function buildAcceptedDraftProposalPayload(
  proposal: PlannerAiAcceptedDraftProposal
): PlannerAiAcceptedDraftProposal {
  return {
    taskIds: [...proposal.taskIds],
    blockIds: [...proposal.blockIds],
    warnings: proposal.warnings
      ? trimTransportStringList(proposal.warnings)
      : undefined,
    summary: proposal.summary,
    oracleAdvice: proposal.oracleAdvice
      ? trimTransportStringList(proposal.oracleAdvice)
      : undefined,
  };
}

function buildAcceptedReplanProposalPayload(
  proposal: PlannerAiAcceptedReplanProposal
): PlannerAiAcceptedReplanProposal {
  return {
    blockIds: [...proposal.blockIds],
    droppedTaskIds: proposal.droppedTaskIds ? [...proposal.droppedTaskIds] : undefined,
    carryForwardTaskIds: proposal.carryForwardTaskIds
      ? [...proposal.carryForwardTaskIds]
      : undefined,
    warnings: proposal.warnings
      ? trimTransportStringList(proposal.warnings)
      : undefined,
    summary: proposal.summary,
    oracleAdvice: proposal.oracleAdvice
      ? trimTransportStringList(proposal.oracleAdvice)
      : undefined,
  };
}

function buildTaskDeltaPayload(delta: PlannerAiTaskDelta): PlannerAiTaskDelta {
  return {
    taskId: delta.taskId,
    changeType: delta.changeType,
    changedFields: [...delta.changedFields],
    before: delta.before ? buildTaskSnapshot(delta.before) : null,
    after: delta.after ? buildTaskSnapshot(delta.after) : null,
  };
}

function buildBlockDeltaPayload(delta: PlannerAiBlockDelta): PlannerAiBlockDelta {
  return {
    blockId: delta.blockId,
    changeType: delta.changeType,
    changedFields: [...delta.changedFields],
    before: delta.before ? buildBlockSnapshot(delta.before) : null,
    after: delta.after ? buildBlockSnapshot(delta.after) : null,
  };
}

function buildTaskSnapshot(
  task: Partial<PlannerAiSchedulingTaskTransport>
): Partial<PlannerAiSchedulingTaskTransport> {
  const snapshot: Partial<PlannerAiSchedulingTaskTransport> = {};

  if (task.id !== undefined) snapshot.id = task.id;
  if (task.title !== undefined) snapshot.title = task.title;
  if (task.type !== undefined) snapshot.type = task.type;
  if (task.estimatedMinutes !== undefined) snapshot.estimatedMinutes = task.estimatedMinutes;
  if (task.priority !== undefined) snapshot.priority = task.priority;
  if (task.mustDoToday !== undefined) snapshot.mustDoToday = task.mustDoToday;
  if (task.breakEligible !== undefined) snapshot.breakEligible = task.breakEligible;
  if (task.splittable !== undefined) snapshot.splittable = task.splittable;
  if (task.deferrable !== undefined) snapshot.deferrable = task.deferrable;
  if (task.energyLevel !== undefined) snapshot.energyLevel = task.energyLevel;
  if (task.dueAt !== undefined) snapshot.dueAt = task.dueAt;
  if (task.beforeTaskIds !== undefined) {
    snapshot.beforeTaskIds = [...task.beforeTaskIds];
  }
  if (task.hardStartTime !== undefined) snapshot.hardStartTime = task.hardStartTime;
  if (task.hardEndTime !== undefined) snapshot.hardEndTime = task.hardEndTime;
  if (task.carryForward !== undefined) snapshot.carryForward = task.carryForward;
  if (task.carriedFromDate !== undefined) snapshot.carriedFromDate = task.carriedFromDate;
  if (task.carryForwardStatus !== undefined) {
    snapshot.carryForwardStatus = task.carryForwardStatus;
  }
  if (task.routeContext !== undefined) snapshot.routeContext = task.routeContext;
  if (task.timeAffinityLabel !== undefined) {
    snapshot.timeAffinityLabel = task.timeAffinityLabel;
  }

  return snapshot;
}

function buildBlockSnapshot(
  block: Partial<PlannerAiScheduleBlockTransport>
): Partial<PlannerAiScheduleBlockTransport> {
  const snapshot: Partial<PlannerAiScheduleBlockTransport> = {};

  if (block.id !== undefined) snapshot.id = block.id;
  if (block.taskId !== undefined) snapshot.taskId = block.taskId;
  if (block.blockType !== undefined) snapshot.blockType = block.blockType;
  if (block.startTime !== undefined) snapshot.startTime = block.startTime;
  if (block.endTime !== undefined) snapshot.endTime = block.endTime;
  if (block.status !== undefined) snapshot.status = block.status;
  if (block.locked !== undefined) snapshot.locked = block.locked;

  return snapshot;
}

function buildDueWarningPayload(
  warning: PlannerAiDueWarningTransport | DueWarning
): PlannerAiDueWarningTransport {
  return {
    taskId: warning.taskId,
    kind: warning.kind,
  };
}

function buildUnplacedTaskPayload(
  task: PlannerAiUnplacedTaskTransport | DraftScheduleResponse["unplacedTasks"][number]
): PlannerAiUnplacedTaskTransport {
  return {
    taskId: task.taskId,
    reason: task.reason,
  };
}

function trimTransportStringList(lines: string[]) {
  return dedupeStrings(lines).slice(0, 4);
}

function buildDraftScaffoldQualityHints(
  draftScheduleResponse: DraftScheduleResponse
) {
  const routeFlowAnalysis = analyzeRouteFlowSequence(
    draftScheduleResponse.dayPlan.blocks,
    draftScheduleResponse.dayPlan.tasks
  );

  return dedupeStrings([
    draftScheduleResponse.unplacedTasks.length > 0 ? "overflow_visible" : undefined,
    draftScheduleResponse.carryForwardItems.length > 0 ? "carry_forward_needed" : undefined,
    draftScheduleResponse.dueWarnings.length > 0 ? "due_pressure" : undefined,
    routeFlowAnalysis.locationSwitchCount >= 3 ? "route_flow_fragmented" : undefined,
    routeFlowAnalysis.anchorSeparatedLocationSwitchCount > 0
      ? "anchor_forced_interleaving"
      : undefined,
    hasDenseFocusFragmentation(draftScheduleResponse.dayPlan.blocks)
      ? "dense_fragmentation"
      : undefined,
  ]);
}

function buildReplanScaffoldQualityHints(replanPreview: ReplanPreview) {
  const routeFlowAnalysis = analyzeRouteFlowSequence(
    replanPreview.dayPlan.blocks,
    replanPreview.dayPlan.tasks
  );

  return dedupeStrings([
    replanPreview.carryForwardItems.length > 0 ? "carry_forward_needed" : undefined,
    replanPreview.unplacedTasks.length > 0 ? "overflow_visible" : undefined,
    replanPreview.dueWarnings.length > 0 ? "due_pressure" : undefined,
    routeFlowAnalysis.locationSwitchCount >= 3 ? "route_flow_fragmented" : undefined,
    routeFlowAnalysis.anchorSeparatedLocationSwitchCount > 0
      ? "anchor_forced_interleaving"
      : undefined,
    replanPreview.summary.revisedBlockCount >= 4 ? "heavy_remainder" : undefined,
    replanPreview.summary.clippedActiveBlock ? "clipped_active_boundary" : undefined,
  ]);
}

function hasDenseFocusFragmentation(blocks: ScheduleBlock[]) {
  let focusBlockCount = 0;
  let shortFocusBlockCount = 0;

  blocks.forEach((block) => {
    if (block.blockType !== "focus" || block.locked) {
      return;
    }

    focusBlockCount += 1;

    const durationMinutes = Math.round(
      (new Date(block.endTime).getTime() - new Date(block.startTime).getTime()) /
        60000
    );

    if (durationMinutes > 0 && durationMinutes <= 30) {
      shortFocusBlockCount += 1;
    }
  });

  return focusBlockCount >= 3 && shortFocusBlockCount >= 2;
}

function dedupeStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

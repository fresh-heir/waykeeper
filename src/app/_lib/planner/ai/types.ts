import type {
  BreakCadence,
  BreakMode,
  DueWarning,
  PaceMode,
  PlanningWindow,
  ReplanMode,
  RouteFlowContext,
  ScheduleBlock,
  Task,
  UnplacedTask,
} from "@/app/_lib/planner-types";

export type PlannerAiFlow = "parse" | "draft" | "replan";
export type PlannerEngineMode = "local" | "ai";
export type PlannerAiParseStrategy = "refine" | "full";

export interface PlannerAiTimingDiagnostics {
  openAiFetchMs: number;
  promptBuildMs: number;
  requestValidationMs: number;
  responseDecodeMs: number;
  schemaValidationMs: number;
  structuredOutputParseMs: number;
  aiRoundTripMs?: number;
  endToEndMs?: number;
  localScaffoldMs?: number;
  mergeValidationMs?: number;
}

export interface PlannerAiAppliedProviderOptions {
  serviceTier?: string;
  reasoningEffort?: string;
  maxOutputTokens?: number;
  promptCaching?: {
    enabled: boolean;
    key?: string;
    retention?: string;
  };
}

export interface PlannerAiTokenUsageDiagnostics {
  inputTokens?: number;
  cachedInputTokens?: number;
  uncachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface PlannerAiParseTaskTransport {
  id: string;
  title: string;
  estimatedMinutes: number;
  type: Task["type"];
  priority: Task["priority"];
  mustDoToday: boolean;
  breakEligible: boolean;
  splittable: boolean;
  deferrable: boolean;
  energyLevel: Task["energyLevel"];
  dueAt?: string;
}

export interface PlannerAiSchedulingTaskTransport
  extends PlannerAiParseTaskTransport {
  beforeTaskIds?: string[];
  hardStartTime?: string;
  hardEndTime?: string;
  routeContext?: RouteFlowContext;
  timeAffinityLabel?: string;
  carryForward?: boolean;
  carriedFromDate?: string;
  carryForwardStatus?: Task["carryForwardStatus"];
}

export interface PlannerAiHardEventTransport {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  locked: true;
}

export interface PlannerAiScheduleBlockTransport {
  id: string;
  taskId?: string;
  blockType: ScheduleBlock["blockType"];
  startTime: string;
  endTime: string;
  locked: boolean;
  status?: ScheduleBlock["status"];
}

export interface PlannerAiResponseScheduleBlock {
  id?: string | null;
  taskId?: string | null;
  title?: string | null;
  blockType: ScheduleBlock["blockType"];
  startTime: string;
  endTime: string;
  status?: ScheduleBlock["status"] | null;
  locked?: boolean | null;
  source?: ScheduleBlock["source"] | null;
  isBreakEligibleTaskPlacement?: boolean | null;
  notes?: string | null;
}

export interface PlannerAiUnplacedTaskTransport {
  taskId: string;
  reason: UnplacedTask["reason"];
}

export interface PlannerAiDueWarningTransport {
  taskId: string;
  kind: DueWarning["kind"];
}

export interface PlannerAiTaskDelta {
  taskId: string;
  changeType: "added" | "removed" | "updated";
  changedFields: string[];
  before: Partial<PlannerAiSchedulingTaskTransport> | null;
  after: Partial<PlannerAiSchedulingTaskTransport> | null;
}

export interface PlannerAiBlockDelta {
  blockId: string;
  changeType: "added" | "removed" | "updated";
  changedFields: string[];
  before: Partial<PlannerAiScheduleBlockTransport> | null;
  after: Partial<PlannerAiScheduleBlockTransport> | null;
}

export interface PlannerAiDraftLocalScaffold {
  blocks: PlannerAiScheduleBlockTransport[];
  unplacedTasks: PlannerAiUnplacedTaskTransport[];
  carryForwardTaskIds: string[];
  dueWarnings: PlannerAiDueWarningTransport[];
  warnings: string[];
  qualityHints: string[];
}

export interface PlannerAiReplanLocalScaffold {
  blocks: PlannerAiScheduleBlockTransport[];
  carryForwardTaskIds: string[];
  dueWarnings: PlannerAiDueWarningTransport[];
  warnings: string[];
  summaryLines: string[];
  qualityHints: string[];
}

export interface PlannerAiAcceptedDraftProposal {
  taskIds: string[];
  blockIds: string[];
  warnings?: string[];
  summary?: string;
  oracleAdvice?: string[];
}

export interface PlannerAiAcceptedReplanProposal {
  blockIds: string[];
  droppedTaskIds?: string[];
  carryForwardTaskIds?: string[];
  warnings?: string[];
  summary?: string;
  oracleAdvice?: string[];
}

export interface PlannerDevEngineSettings {
  interpretation: PlannerEngineMode;
  draft: PlannerEngineMode;
  replan: PlannerEngineMode;
}

export const DEFAULT_PLANNER_DEV_ENGINE_SETTINGS: PlannerDevEngineSettings = {
  interpretation: "local",
  draft: "local",
  replan: "local",
};

export interface PlannerAiParsePayload {
  rawText: string;
  planningWindow: PlanningWindow;
  breakMode: BreakMode;
  baselineTasks: PlannerAiParseTaskTransport[];
  inferredHardEvents?: PlannerAiHardEventTransport[];
}

export interface PlannerAiDraftPayload {
  currentTime: string;
  planningWindow: PlanningWindow;
  breakMode: BreakMode;
  breakCadence: BreakCadence;
  paceMode: PaceMode;
  tasks: PlannerAiSchedulingTaskTransport[];
  hardEvents: PlannerAiHardEventTransport[];
  localScaffold: PlannerAiDraftLocalScaffold;
  previousAcceptedAiProposal?: PlannerAiAcceptedDraftProposal;
  changedTaskIds?: string[];
  taskDeltas?: PlannerAiTaskDelta[];
}

export interface PlannerAiReplanPayload {
  currentTime: string;
  planningWindow: PlanningWindow;
  breakMode: BreakMode;
  breakCadence: BreakCadence;
  paceMode: PaceMode;
  replanMode: ReplanMode;
  tasks: PlannerAiSchedulingTaskTransport[];
  currentBlocks: PlannerAiScheduleBlockTransport[];
  completedBlockIds: string[];
  remainingTaskIds: string[];
  hardEvents: PlannerAiHardEventTransport[];
  localScaffold: PlannerAiReplanLocalScaffold;
  previousAcceptedAiProposal?: PlannerAiAcceptedReplanProposal;
  changedTaskIds?: string[];
  taskDeltas?: PlannerAiTaskDelta[];
  changedBlockIds?: string[];
  blockDeltas?: PlannerAiBlockDelta[];
}

export interface PlannerAiParseResponse {
  tasks: Task[];
  warnings?: string[];
  followUpQuestions?: string[];
}

export interface PlannerAiDraftResponse {
  tasks?: Task[];
  blocks: PlannerAiResponseScheduleBlock[];
  warnings?: string[];
  summary?: string;
  oracleAdvice?: string[];
}

export interface PlannerAiReplanResponse {
  blocks: PlannerAiResponseScheduleBlock[];
  droppedTaskIds?: string[];
  carryForwardTaskIds?: string[];
  warnings?: string[];
  summary?: string;
  oracleAdvice?: string[];
}

export type PlannerAiRouteRequest =
  | {
      flow: "parse";
      includeDiagnostics?: boolean;
      strategy: PlannerAiParseStrategy;
      payload: PlannerAiParsePayload;
    }
  | {
      flow: "draft";
      includeDiagnostics?: boolean;
      payload: PlannerAiDraftPayload;
    }
  | {
      flow: "replan";
      includeDiagnostics?: boolean;
      payload: PlannerAiReplanPayload;
    };

export type PlannerAiRouteResult =
  | PlannerAiParseResponse
  | PlannerAiDraftResponse
  | PlannerAiReplanResponse;

export interface PlannerSchemaValidationDiagnostics {
  passed: boolean;
  issues: string[];
}

export interface PlannerAiServerDiagnostics {
  flow: PlannerAiFlow;
  requestedAt: string;
  durationMs: number;
  model?: string;
  payloadBytes?: number;
  providerOptions?: PlannerAiAppliedProviderOptions;
  tokenUsage?: PlannerAiTokenUsageDiagnostics;
  outputCapHit?: boolean;
  requestPreview: unknown;
  rawResponse: unknown;
  schemaValidation: PlannerSchemaValidationDiagnostics;
  repairNotes: string[];
  strategy?: PlannerAiParseStrategy;
  timings?: PlannerAiTimingDiagnostics;
  error?: string;
}

export interface PlannerAiRouteSuccess {
  ok: true;
  result: PlannerAiRouteResult;
  diagnostics?: PlannerAiServerDiagnostics;
}

export interface PlannerAiRouteFailure {
  ok: false;
  aborted?: boolean;
  error: string;
  diagnostics?: PlannerAiServerDiagnostics;
}

export type PlannerAiRouteResponse =
  | PlannerAiRouteFailure
  | PlannerAiRouteSuccess;

export interface PlannerFlowDiagnostics {
  flow: PlannerAiFlow;
  engine: PlannerEngineMode;
  updatedAt: string;
  model?: string;
  payloadBytes?: number;
  providerOptions?: PlannerAiAppliedProviderOptions;
  tokenUsage?: PlannerAiTokenUsageDiagnostics;
  outputCapHit?: boolean;
  requestPreview: unknown;
  rawResponse: unknown;
  schemaValidation: PlannerSchemaValidationDiagnostics;
  repairNotes: string[];
  strategy?: PlannerAiParseStrategy;
  timings?: PlannerAiTimingDiagnostics;
  fallbackOutcome?: string;
  normalizedSummary: string[];
  error?: string;
}

export type PlannerFlowDiagnosticsState = Partial<
  Record<PlannerAiFlow, PlannerFlowDiagnostics>
>;

export interface PlannerTranslationResult<TValue> {
  value: TValue;
  normalizedSummary: string[];
  repairNotes: string[];
}

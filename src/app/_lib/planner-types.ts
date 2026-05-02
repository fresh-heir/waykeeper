export type TaskType =
  | "deep_work"
  | "admin"
  | "chore"
  | "self_care"
  | "errand"
  | "appointment"
  | "break_candidate"
  | "other";

export type BreakMode = "restful" | "productive";
export type BreakCadence = "focus_25" | "focus_45" | "focus_50" | "focus_90";
export const DEFAULT_BREAK_CADENCE: BreakCadence = "focus_50";
export type PaceMode = "finish_sooner" | "spread_out";
export const DEFAULT_PACE_MODE: PaceMode = "finish_sooner";
export type RouteLocationContext = "out_of_home" | "home" | "desk" | "unknown";
export type RouteCognitiveMode = "deep_focus" | "light_admin" | "other";

export interface RouteFlowContext {
  cognitiveMode: RouteCognitiveMode;
  locationContext: RouteLocationContext;
}

export function normalizeBreakCadence(
  breakCadence: BreakCadence | "focus_60" | null | undefined
): BreakCadence {
  if (breakCadence === "focus_60" || breakCadence == null) {
    return DEFAULT_BREAK_CADENCE;
  }

  return breakCadence;
}

export function normalizePaceMode(
  paceMode: PaceMode | null | undefined
): PaceMode {
  if (paceMode == null) {
    return DEFAULT_PACE_MODE;
  }

  return paceMode;
}

export type Priority = "critical" | "high" | "medium" | "low";

export type EnergyLevel = "low" | "medium" | "high";

export type ReplanMode =
  | "replan_from_now"
  | "keep_essentials_only"
  | "gentler_remainder"
  | "use_productive_breaks"
  | "preserve_focus_first";

export type ScheduleBlockType =
  | "focus"
  | "break"
  | "appointment"
  | "admin"
  | "chore"
  | "self_care"
  | "buffer"
  | "transition"
  | "other";

export type ScheduleBlockStatus =
  | "upcoming"
  | "active"
  | "done"
  | "skipped"
  | "deferred"
  | "expired";

export type SourceTag = "user" | "ai" | "mixed" | "system";

export type UnplacedTaskReason =
  | "did_not_fit_today"
  | "lower_priority_deferred"
  | "needs_longer_open_slot";

export type CarryForwardReason =
  | "overflow"
  | "manual"
  | "unplaced"
  | "replan_overflow";

export type CarryForwardStatus =
  | "pending"
  | "accepted"
  | "review"
  | "ignored"
  | "consumed";

export type DueWarningKind = "scheduled_late" | "carried_forward_late";

export type TaskTimingPreferenceKind =
  | "time_anchored_unconfirmed"
  | "preferred_time";

export type TaskTimingDecisionState = "pending" | "kept_flexible";
export type TaskDueDateDecisionState = "pending" | "dismissed";

export interface RawTaskInput {
  rawText: string;
  createdAt: string;
}

export interface PlanningWindow {
  startTime: string;
  endTime: string;
}

export interface TaskTimingPreference {
  kind: TaskTimingPreferenceKind;
  preferredStartTime: string;
  displayLabel: string;
  decisionState: TaskTimingDecisionState;
  suggestedMinutes: number;
}

export interface TaskDueDatePreference {
  suggestedDueAt: string;
  displayLabel: string;
  sourcePhrase: string;
  decisionState: TaskDueDateDecisionState;
}

export type TaskTimeAffinitySource =
  | "meal"
  | "day_part"
  | "business_hours"
  | "preparation"
  | "sequence";

export type TaskTimeAffinityStrength = "soft" | "strong";

export interface TaskTimeAffinity {
  source: TaskTimeAffinitySource;
  displayLabel: string;
  strength: TaskTimeAffinityStrength;
  targetTime?: string;
  earliestStartTime?: string;
  latestEndTime?: string;
}

export interface Task {
  id: string;
  title: string;
  rawText?: string;
  type: TaskType;
  estimatedMinutes: number;
  priority: Priority;
  mustDoToday: boolean;
  breakEligible: boolean;
  splittable: boolean;
  deferrable: boolean;
  deferCount?: number;
  delayedCount?: number;
  energyLevel: EnergyLevel;
  dueAt?: string;
  dueDatePreference?: TaskDueDatePreference;
  timingPreference?: TaskTimingPreference;
  timeAffinity?: TaskTimeAffinity;
  beforeTaskIds?: string[];
  // These keep the item a task, but with a fixed-time scheduling constraint.
  hardStartTime?: string;
  hardEndTime?: string;
  carryForward?: boolean;
  carriedFromDate?: string;
  carryForwardReason?: CarryForwardReason;
  carryForwardStatus?: CarryForwardStatus;
  notes?: string;
  source: SourceTag;
}

export interface HardEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  notes?: string;
  locked: true;
  source: SourceTag;
}

export interface ScheduleBlock {
  id: string;
  taskId?: string;
  title: string;
  blockType: ScheduleBlockType;
  startTime: string;
  endTime: string;
  status: ScheduleBlockStatus;
  locked: boolean;
  source: SourceTag;
  isBreakEligibleTaskPlacement?: boolean;
  notes?: string;
}

export interface DayPlan {
  id: string;
  date: string;
  planningWindow: PlanningWindow;
  rawInput: RawTaskInput;
  tasks: Task[];
  hardEvents: HardEvent[];
  blocks: ScheduleBlock[];
  breakMode: BreakMode;
  breakCadence: BreakCadence;
  paceMode: PaceMode;
  completedTaskIds?: string[];
  activeBlockId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedTaskResponse {
  tasks: Task[];
  hardEvents: HardEvent[];
  warnings: string[];
  followUpQuestions?: string[];
}

export interface UnplacedTask {
  taskId: string;
  title: string;
  reason: UnplacedTaskReason;
  remainingMinutes: number;
}

export interface DueWarning {
  taskId: string;
  taskTitle: string;
  kind: DueWarningKind;
  dueAt: string;
  relevantTime: string;
  message: string;
}

export interface CarryForwardItem {
  id: string;
  taskId: string;
  carriedFromDate: string;
  title: string;
  remainingMinutes: number;
  carryForwardReason: CarryForwardReason;
  carryForwardStatus: CarryForwardStatus;
  deferCount: number;
  dueAt?: string;
  dueWarningKinds: DueWarningKind[];
  unplacedReason: UnplacedTaskReason;
  explanation: string;
  type: TaskType;
  priority: Priority;
  mustDoToday: boolean;
  breakEligible: boolean;
  splittable: boolean;
  deferrable: boolean;
  energyLevel: EnergyLevel;
  notes?: string;
  source: SourceTag;
}

export interface DraftScheduleResponse {
  dayPlan: DayPlan;
  unplacedTasks: UnplacedTask[];
  carryForwardItems: CarryForwardItem[];
  carryForwardTaskIds: string[];
  dueWarnings: DueWarning[];
  warnings: string[];
  oracleAdvice?: string[];
}

export interface ReplanChangeSummary {
  clippedActiveBlock: boolean;
  deferredOptionalTaskCount: number;
  forcedUnplacedTaskCount: number;
  preservedAnchorCount: number;
  preservedHistoryCount: number;
  productiveBreaksUsed: boolean;
  revisedBlockCount: number;
  stayedOutTaskCount: number;
  summaryLines: string[];
}

export interface ReplanPreview {
  dayPlan: DayPlan;
  mode: ReplanMode;
  summary: ReplanChangeSummary;
  unplacedTasks: UnplacedTask[];
  carryForwardItems: CarryForwardItem[];
  carryForwardTaskIds: string[];
  dueWarnings: DueWarning[];
  warnings: string[];
  oracleAdvice?: string[];
}

export interface MockPlannerState {
  currentTime: string;
  dayPlan: DayPlan;
}

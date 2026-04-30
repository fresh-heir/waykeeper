import type {
  ClipboardEvent,
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";
import { useEffect, useRef, useState } from "react";

import {
  BotanicalGlyph,
  GeneratedWaykeeperAsset,
  Starcut,
  WaykeeperButton,
  waykeeperAssets,
} from "@/app/_components/waykeeper-ui";
import {
  getCarryForwardStatusLabel,
} from "@/app/_lib/planner/carry-forward";
import {
  extractDateTimeLocalInput,
  formatClockInputValue,
  formatDueInputValue,
  parseFlexibleTimeInput,
  parseFlexibleLocalDateTimeInput,
} from "@/app/_lib/planner/date-time";
import type {
  DaySetupDraft,
  DaySetupInputMode,
  DaySetupErrors,
  DaySetupWarnings,
  DraftFixedEvent,
  PendingFixedEventPreview,
  PlannerStage,
} from "@/app/_lib/intake-flow";
import type { PlannerCsvImportResult } from "@/app/_lib/planner/csv-intake";
import type {
  BreakCadence,
  BreakMode,
  CarryForwardItem,
  DraftScheduleResponse,
  PaceMode,
  ParsedTaskResponse,
  Task,
  UnplacedTask,
} from "@/app/_lib/planner-types";

interface TaskIntakePanelProps {
  aiSlowPrompt: {
    canUseLocalNow: boolean;
    message: string;
  } | null;
  csvImportReport: PlannerCsvImportResult | null;
  draft: DaySetupDraft;
  draftScheduleResponse: DraftScheduleResponse | null;
  errors: DaySetupErrors;
  feedbackToast: {
    message: string;
    placeholderHeight: number;
    taskId: string;
    taskSnapshot: Task;
  } | null;
  intakeCarryForwardItems: CarryForwardItem[];
  isCsvImportReplacePending: boolean;
  isRouteUpdating: boolean;
  onAddCarryForwardToToday: (
    carryForwardItem: CarryForwardItem,
    status: "accepted" | "review"
  ) => void;
  onCancelCsvImportReplace: () => void;
  onAddFixedEvent: () => void;
  onBackToDaySetup: () => void;
  onBackToReview: () => void;
  onBreakCadenceChange: (breakCadence: BreakCadence) => void;
  onBreakModeChange: (breakMode: BreakMode) => void;
  onConfirmCsvImportReplace: () => void;
  onCsvTextChange: (csvText: string) => void;
  onInputModeChange: (inputMode: DaySetupInputMode) => void;
  onPaceModeChange: (paceMode: PaceMode) => void;
  onBuildDayPlan: () => void;
  onAcceptDetectedDueDate: (taskId: string) => void;
  onDueAtChange: (taskId: string, dueAt: string) => void;
  onDismissDetectedDueDate: (taskId: string) => void;
  onDurationChange: (taskId: string, minutes: number) => void;
  onIgnoreCarryForward: (carryForwardItemId: string) => void;
  onKeepTaskFlexible: (taskId: string, placeholderHeight: number) => void;
  onKeepWaitingForAi: () => void;
  onLockTaskToDetectedTime: (taskId: string, placeholderHeight: number) => void;
  onUnlockTaskFromTime: (taskId: string) => void;
  onPlanningWindowChange: (
    field: "planningStart" | "planningEnd",
    value: string
  ) => void;
  onProfileFieldChange: (
    field: "profileName" | "profileJourney" | "profileRhythm" | "profilePreference",
    value: string
  ) => void;
  onProfilePriorityToggle: (priority: string) => void;
  onRawTextChange: (rawText: string) => void;
  onRemoveFixedEvent: (eventId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUseLocalNowForAi: () => void;
  onUpdateFixedEvent: (
    eventId: string,
    field: keyof DraftFixedEvent,
    value: string
  ) => void;
  pendingFixedEventPreviews: PendingFixedEventPreview[];
  parsedTaskResponse: ParsedTaskResponse | null;
  plannerWarnings: string[];
  stage: PlannerStage;
  warnings: DaySetupWarnings;
}

const taskTypeLabels: Record<Task["type"], string> = {
  admin: "Admin",
  appointment: "Appointment",
  break_candidate: "Break candidate",
  chore: "Chore",
  deep_work: "Deep work",
  errand: "Errand",
  other: "Other",
  self_care: "Self-care",
};

const priorityLabels: Record<Task["priority"], string> = {
  critical: "Critical",
  high: "High",
  low: "Low",
  medium: "Medium",
};

const unplacedReasonLabels: Record<UnplacedTask["reason"], string> = {
  did_not_fit_today: "Did not fit today",
  lower_priority_deferred: "Deferred first",
  needs_longer_open_slot: "Needs a longer open slot",
};

const breakCadenceOptions: Array<{
  description: string;
  label: string;
  value: BreakCadence;
}> = [
  {
    value: "focus_25",
    label: "25m focus / 5m break",
    description: "Closest to a classic pomodoro rhythm.",
  },
  {
    value: "focus_45",
    label: "45m focus / 10m break",
    description: "A steadier cadence with more breathing room.",
  },
  {
    value: "focus_50",
    label: "50m focus / 10m break",
    description: "Balanced default with a slightly earlier reset.",
  },
  {
    value: "focus_90",
    label: "90m focus / 15m break",
    description: "Longer deep-work pushes with explicit recovery.",
  },
];

const paceModeOptions: Array<{
  description: string;
  label: string;
  value: PaceMode;
}> = [
  {
    value: "finish_sooner",
    label: "Finish sooner",
    description: "Front-load the day and wrap earlier when there is room.",
  },
  {
    value: "spread_out",
    label: "Spread out",
    description: "Use visible open-time buffers when the day has real slack.",
  },
];

const profileJourneyOptions = [
  {
    value: "starting",
    label: "Starting out",
    summaryTitle: "Wayfinder",
    helper: "Give me a clear first route and fewer assumptions.",
  },
  {
    value: "building",
    label: "Building",
    summaryTitle: "Builder",
    helper: "Help me create momentum and make today feel usable.",
  },
  {
    value: "deepening",
    label: "Deepening",
    summaryTitle: "Deepener",
    helper: "Protect quality, craft, and the work that matters most.",
  },
] as const;

const profilePriorityOptions = [
  {
    value: "focus",
    label: "Focus",
    helper: "Protect deep work and reduce task switching.",
  },
  {
    value: "creativity",
    label: "Creativity",
    helper: "Make room for original work and idea shaping.",
  },
  {
    value: "learning",
    label: "Learning",
    helper: "Keep study, reading, and reflection visible.",
  },
  {
    value: "health",
    label: "Health",
    helper: "Preserve movement, food, rest, and recovery.",
  },
  {
    value: "relationships",
    label: "Relationships",
    helper: "Hold space for calls, care, and shared commitments.",
  },
  {
    value: "purpose",
    label: "Purpose",
    helper: "Keep the day connected to why it matters.",
  },
] as const;

const profileRhythmOptions = [
  {
    value: "steady_builder",
    label: "Steady builder",
    helper: "Use a calm route with visible buffers and a clean close.",
  },
  {
    value: "morning_focus",
    label: "Morning focus",
    helper: "Make the first deep-work block feel protected.",
  },
  {
    value: "meeting_weave",
    label: "Meeting weave",
    helper: "Help me recover between anchors and follow-ups.",
  },
  {
    value: "evening_closer",
    label: "Evening closer",
    helper: "Leave space to wrap the day without a cliff edge.",
  },
] as const;

const DAY_SETUP_TIMELINE_MINUTE_HEIGHT = 1.12;
const DAY_SETUP_TIMELINE_CARD_OFFSET = 64;
const BRAIN_DUMP_COLUMN_WIDTH = 13;
const BRAIN_DUMP_COLUMN_GAP = 1.75;

function shouldAutoCommitAnchorTime(rawValue: string) {
  const compactValue = rawValue.trim().toLowerCase().replace(/\s+/g, "");

  return /([ap]m?|:\d{2}|\d{3,4})$/.test(compactValue);
}

export function TaskIntakePanel({
  aiSlowPrompt,
  csvImportReport,
  draft,
  draftScheduleResponse,
  errors,
  feedbackToast,
  intakeCarryForwardItems,
  isCsvImportReplacePending,
  isRouteUpdating,
  onAcceptDetectedDueDate,
  onAddCarryForwardToToday,
  onCancelCsvImportReplace,
  onAddFixedEvent,
  onBackToDaySetup,
  onBackToReview,
  onBreakCadenceChange,
  onBreakModeChange,
  onConfirmCsvImportReplace,
  onCsvTextChange,
  onInputModeChange,
  onPaceModeChange,
  onBuildDayPlan,
  onDueAtChange,
  onDismissDetectedDueDate,
  onDurationChange,
  onIgnoreCarryForward,
  onKeepTaskFlexible,
  onKeepWaitingForAi,
  onLockTaskToDetectedTime,
  onUnlockTaskFromTime,
  onPlanningWindowChange,
  onProfileFieldChange,
  onProfilePriorityToggle,
  onRawTextChange,
  onRemoveFixedEvent,
  onSubmit,
  onUseLocalNowForAi,
  onUpdateFixedEvent,
  pendingFixedEventPreviews,
  parsedTaskResponse,
  plannerWarnings,
  stage,
  warnings,
}: TaskIntakePanelProps) {
  if (stage === "day_setup") {
    return (
      <DaySetupConcept
        csvImportReport={csvImportReport}
        draft={draft}
        errors={errors}
        isCsvImportReplacePending={isCsvImportReplacePending}
        onAddFixedEvent={onAddFixedEvent}
        onBreakCadenceChange={onBreakCadenceChange}
        onBreakModeChange={onBreakModeChange}
        onCancelCsvImportReplace={onCancelCsvImportReplace}
        onConfirmCsvImportReplace={onConfirmCsvImportReplace}
        onCsvTextChange={onCsvTextChange}
        onInputModeChange={onInputModeChange}
        onPaceModeChange={onPaceModeChange}
        onPlanningWindowChange={onPlanningWindowChange}
        onProfileFieldChange={onProfileFieldChange}
        onProfilePriorityToggle={onProfilePriorityToggle}
        onRawTextChange={onRawTextChange}
        onRemoveFixedEvent={onRemoveFixedEvent}
        onSubmit={onSubmit}
        onUpdateFixedEvent={onUpdateFixedEvent}
        pendingFixedEventPreviews={pendingFixedEventPreviews}
        warnings={warnings}
      />
    );
  }

  const parsedTasks = parsedTaskResponse?.tasks ?? [];
  const orderedParsedTasks = sortTasksForInterpretation(parsedTasks);
  const lockedTasks = orderedParsedTasks
    .filter((task) => Boolean(task.hardStartTime && task.hardEndTime))
    .sort((left, right) => {
      const leftStartMs = new Date(left.hardStartTime!).getTime();
      const rightStartMs = new Date(right.hardStartTime!).getTime();

      return leftStartMs - rightStartMs;
    });
  const flexibleTasks = orderedParsedTasks.filter(
    (task) => !task.hardStartTime || !task.hardEndTime
  );
  const hardEvents = parsedTaskResponse?.hardEvents ?? [];
  const anchorCount = hardEvents.length + lockedTasks.length;
  const pendingAnchorCount = pendingFixedEventPreviews.length;
  const planningWindowMinutes = getPlanningWindowMinutes(
    draft.planningStart,
    draft.planningEnd
  );
  const interpretedTaskMinutes = orderedParsedTasks.reduce(
    (totalMinutes, task) => totalMinutes + task.estimatedMinutes,
    0
  );
  const hardEventMinutes = hardEvents.reduce(
    (totalMinutes, event) =>
      totalMinutes + getMinutesBetween(event.startTime, event.endTime),
    0
  );
  const overloadMinutes = Math.max(
    0,
    interpretedTaskMinutes + hardEventMinutes - planningWindowMinutes
  );
  const scheduledBlocks =
    draftScheduleResponse?.dayPlan.blocks.filter(
      (block) => block.blockType !== "appointment"
    ) ?? [];
  const routeExists = stage === "draft_route" && Boolean(draftScheduleResponse);
  const showPrebuildOverloadWarning = !routeExists && overloadMinutes > 0;
  const combinedWarnings = Array.from(
    new Set([...warnings.global, ...plannerWarnings])
  );
  const followUpQuestions = parsedTaskResponse?.followUpQuestions ?? [];
  const activeCarryForwardIntakeItems = intakeCarryForwardItems.filter(
    (item) => item.carryForwardStatus !== "ignored"
  );
  const ignoredCarryForwardIntakeItems = intakeCarryForwardItems.filter(
    (item) => item.carryForwardStatus === "ignored"
  );
  const overflowCount = draftScheduleResponse?.unplacedTasks.length ?? 0;
  const carryForwardCount = draftScheduleResponse?.carryForwardItems.length ?? 0;

  return (
    <section
      aria-label={routeExists ? "Draft route" : "Task interpretation"}
      data-testid="task-intake-panel"
      className="waykeeper-panel-glow rounded-[24px] border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-4 shadow-[var(--planner-shadow-panel)] backdrop-blur sm:p-5"
    >
      <div className="border-b border-[color:var(--planner-border)] pb-3.5">
        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[color:var(--wk-amethyst)]">
          {routeExists ? "Draft route" : "Task interpretation"}
        </p>
        <h2 className="mt-1.5 font-display text-[1.9rem] font-semibold leading-none tracking-[-0.05em] text-stone-950">
          {routeExists ? "The day has a route now" : "Review the interpreted tasks"}
        </h2>
      </div>

      <div className="mt-3.5 space-y-3">
        {isRouteUpdating ? (
          <div
            aria-live="polite"
            data-testid="route-updating-indicator"
            role="status"
            className="inline-flex items-center gap-2 rounded-[10px] border border-stone-200/80 bg-stone-50/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600"
          >
            <span className="size-2 animate-pulse rounded-full bg-stone-500" />
            Route updating...
          </div>
        ) : null}

        {aiSlowPrompt ? (
          <div
            aria-live="polite"
            data-testid="ai-slow-prompt"
            className="rounded-[12px] border border-stone-200/80 bg-stone-50/90 p-3"
          >
            <p className="text-[13px] leading-5 text-stone-700">
              {aiSlowPrompt.message}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onKeepWaitingForAi}
                className="inline-flex items-center justify-center rounded-[10px] border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-stone-50"
              >
                Keep waiting
              </button>
              {aiSlowPrompt.canUseLocalNow ? (
                <button
                  type="button"
                  onClick={onUseLocalNowForAi}
                  className="inline-flex items-center justify-center rounded-[10px] border border-stone-300 bg-[color:var(--planner-surface-card)] px-3 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-white"
                >
                  Use local now
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {combinedWarnings.map((message, index) => (
          <InlineMessage key={`combined-warning-${index}`} tone="warning">
            {message}
          </InlineMessage>
        ))}

        {followUpQuestions.length > 0 ? (
          <div className="rounded-[12px] border border-stone-200/80 bg-stone-50/90 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Follow-up questions
            </p>
            <ul className="mt-2 space-y-1.5 text-[13px] leading-5 text-stone-700">
              {followUpQuestions.map((question, index) => (
                <li key={`follow-up-question-${index}`}>{question}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {showPrebuildOverloadWarning ? (
          <InlineMessage tone="warning">
            Too full for today: {formatMinutesAsHoursAndMinutes(planningWindowMinutes)}{" "}
            available, {formatMinutesAsHoursAndMinutes(
              interpretedTaskMinutes + hardEventMinutes
            )}{" "}
            planned. Some work will spill unless you widen the window, reduce
            anchors, or defer something.
          </InlineMessage>
        ) : null}

        {!routeExists && intakeCarryForwardItems.length > 0 ? (
          <InspectorDisclosure
            countLabel={`${intakeCarryForwardItems.length}`}
            defaultOpen
            label="Secondary intake"
            title="From yesterday"
          >
            <div data-testid="carry-forward-intake" className="space-y-3">
              {activeCarryForwardIntakeItems.length > 0 ? (
                <ul className="space-y-2.5">
                  {activeCarryForwardIntakeItems.map((carryForwardItem) => (
                    <CarryForwardIntakeCard
                      key={carryForwardItem.id}
                      carryForwardItem={carryForwardItem}
                      onAccept={() =>
                        onAddCarryForwardToToday(carryForwardItem, "accepted")
                      }
                      onIgnore={() => onIgnoreCarryForward(carryForwardItem.id)}
                      onReview={() =>
                        onAddCarryForwardToToday(carryForwardItem, "review")
                      }
                    />
                  ))}
                </ul>
              ) : null}

              {ignoredCarryForwardIntakeItems.length > 0 ? (
                <div
                  data-testid="carry-forward-intake-ignored"
                  className="rounded-[12px] border border-stone-200/80 bg-[color:var(--planner-surface-card)] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Ignored for now
                    </p>
                    <span className="rounded-full border border-stone-300 bg-stone-50 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                      {ignoredCarryForwardIntakeItems.length}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {ignoredCarryForwardIntakeItems.map((carryForwardItem) => (
                      <CarryForwardIntakeCard
                        key={carryForwardItem.id}
                        carryForwardItem={carryForwardItem}
                        compact
                        onAccept={() =>
                          onAddCarryForwardToToday(carryForwardItem, "accepted")
                        }
                        onIgnore={() => onIgnoreCarryForward(carryForwardItem.id)}
                        onReview={() =>
                          onAddCarryForwardToToday(carryForwardItem, "review")
                        }
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </InspectorDisclosure>
        ) : null}

        <div className="grid gap-1.5 sm:grid-cols-3">
          <SurfaceMetric
            label="Tasks"
            value={`${parsedTasks.length} interpreted`}
          />
          <SurfaceMetric
            label="Anchors"
            value={
              pendingAnchorCount > 0
                ? `${anchorCount} fixed · ${pendingAnchorCount} pending`
                : `${anchorCount} fixed`
            }
          />
          <SurfaceMetric
            label={routeExists ? "Placed today" : "Break style"}
            value={
              routeExists
                ? `${scheduledBlocks.length} blocks`
                : capitalize(draft.breakMode)
            }
            />
        </div>

        {!routeExists ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="rounded-[12px] border border-amber-200 bg-amber-50/82 p-3">
              <label className="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-900">
                Work until break
                <select
                  value={draft.breakCadence}
                  onChange={(event) =>
                    onBreakCadenceChange(
                      event.currentTarget.value as BreakCadence
                    )
                  }
                  className="min-h-10 rounded-[10px] border border-amber-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-900 outline-none transition focus:border-amber-400"
                >
                  {breakCadenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal normal-case tracking-normal text-amber-900/85">
                  {
                    breakCadenceOptions.find(
                      (option) => option.value === draft.breakCadence
                    )?.description
                  }
                </span>
              </label>
            </div>

            <div className="rounded-[12px] border border-violet-200 bg-violet-50/82 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-900">
                Pace
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {paceModeOptions.map((option) => {
                  const isSelected = draft.paceMode === option.value;

                  return (
                    <button
                      key={option.value}
                      aria-pressed={isSelected}
                      type="button"
                      onClick={() => onPaceModeChange(option.value)}
                      className={`rounded-[10px] border px-3 py-2.5 text-left transition ${
                        isSelected
                          ? "border-violet-500 bg-violet-600 text-white shadow-[0_10px_24px_rgba(109,40,217,0.14)]"
                          : "border-violet-200 bg-white text-stone-900 hover:border-violet-300"
                      }`}
                    >
                      <span className="block text-sm font-semibold">
                        {option.label}
                      </span>
                      <span
                        className={`mt-1 block text-xs leading-5 ${
                          isSelected ? "text-violet-100" : "text-stone-600"
                        }`}
                      >
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {(anchorCount > 0 || pendingAnchorCount > 0) && (
          <InspectorDisclosure
            countLabel={`${anchorCount + pendingAnchorCount}`}
            defaultOpen={routeExists || pendingAnchorCount > 0}
            label="Fixed first"
            title="Anchors"
          >
            <ul className="space-y-2">
              {hardEvents.map((event) => (
                <AnchorListItem
                  key={event.id}
                  meta={event.source === "user" ? "Manual" : "Inferred"}
                  timeLabel={formatRange(event.startTime, event.endTime)}
                  title={event.title}
                />
              ))}
              {lockedTasks.map((task) => (
                <AnchorListItem
                  key={task.id}
                  action={
                    <button
                      type="button"
                      onClick={() => onUnlockTaskFromTime(task.id)}
                      className="inline-flex min-h-8 items-center justify-center rounded-[8px] border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                    >
                      Unlock time
                    </button>
                  }
                  meta={`Locked · ${taskTypeLabels[task.type]}`}
                  timeLabel={formatRange(task.hardStartTime!, task.hardEndTime!)}
                  title={task.title}
                />
              ))}
              {pendingFixedEventPreviews.map((event) => (
                <AnchorListItem
                  key={event.id}
                  pending
                  meta={event.pendingLabel}
                  timeLabel={event.timeLabel}
                  title={event.title}
                />
              ))}
            </ul>
          </InspectorDisclosure>
        )}

        <InspectorDisclosure
          countLabel={`${flexibleTasks.length}`}
          defaultOpen={!routeExists}
          label={routeExists ? "Details on demand" : "Review before build"}
          title={routeExists ? "Tasks behind the route" : "Tasks to route"}
        >
          <ul className="space-y-3">
            {feedbackToast &&
            !flexibleTasks.some((task) => task.id === feedbackToast.taskId) ? (
              <li
                key={`feedback-${feedbackToast.taskId}`}
                className="animate-soft-fade rounded-[12px] border border-stone-200/80 bg-[color:var(--planner-surface-card)] p-3.5"
                style={{ height: `${feedbackToast.placeholderHeight}px` }}
              >
                <TaskSummary task={feedbackToast.taskSnapshot} />
                <InlineFeedbackToast className="mt-4 flex-1">
                  {feedbackToast.message}
                </InlineFeedbackToast>
              </li>
            ) : null}

            {flexibleTasks.map((task) => (
              <TaskReviewCard
                key={task.id}
                feedbackToast={
                  feedbackToast?.taskId === task.id ? feedbackToast : null
                }
                onAcceptDetectedDueDate={onAcceptDetectedDueDate}
                onDismissDetectedDueDate={onDismissDetectedDueDate}
                onDueAtChange={onDueAtChange}
                onDurationChange={onDurationChange}
                onKeepTaskFlexible={onKeepTaskFlexible}
                onLockTaskToDetectedTime={onLockTaskToDetectedTime}
                task={task}
              />
            ))}

            {flexibleTasks.length === 0 ? (
              <li className="rounded-[12px] border border-dashed border-stone-300/90 bg-stone-50/90 px-4 py-3.5 text-[13px] leading-5 text-stone-600">
                No flexible tasks left here.
              </li>
            ) : null}
          </ul>
        </InspectorDisclosure>

        {carryForwardCount > 0 ? (
          <InspectorDisclosure
            countLabel={`${carryForwardCount}`}
            defaultOpen
            label="Overflow result"
            title="Carried forward"
          >
            <ul className="space-y-2">
              {draftScheduleResponse?.carryForwardItems.map((carryForwardItem) => (
                <CarryForwardOverflowCard
                  key={carryForwardItem.id}
                  carryForwardItem={carryForwardItem}
                />
              ))}
            </ul>
          </InspectorDisclosure>
        ) : null}

        {overflowCount > 0 ? (
          <InspectorDisclosure
            countLabel={`${overflowCount}`}
            defaultOpen
            label="Honest overflow"
            title="Still unplaced today"
          >
            <ul className="space-y-2">
              {draftScheduleResponse?.unplacedTasks.map((task) => (
                <li
                  key={task.taskId}
                  className="rounded-[12px] border border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-accent-warning-surface)] p-3.5"
                >
                  <p className="text-[13px] font-semibold text-stone-900">
                    {task.title}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-600">
                    {unplacedReasonLabels[task.reason]}
                  </p>
                </li>
              ))}
            </ul>
          </InspectorDisclosure>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-stone-200/80 pt-3.5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={routeExists ? onBackToReview : onBackToDaySetup}
            className="inline-flex items-center justify-center rounded-[10px] border border-stone-300 bg-[color:var(--planner-surface-card)] px-4 py-2.5 text-sm font-semibold text-stone-900 transition hover:border-stone-400 hover:bg-white"
          >
            <span className="text-stone-900">
              {routeExists ? "Back to review" : "Back to day setup"}
            </span>
          </button>
          <button
            type="button"
            onClick={onBuildDayPlan}
            aria-busy={isRouteUpdating}
            disabled={isRouteUpdating}
            className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-[color:var(--planner-ink-surface)] bg-[color:var(--planner-ink-surface)] px-4 py-2.5 text-sm font-semibold leading-none text-[color:var(--planner-ink-text)] opacity-95 shadow-[0_12px_24px_rgba(52,68,82,0.16)] transition hover:bg-[color:var(--planner-ink-surface-strong)] disabled:cursor-wait disabled:border-[color:var(--planner-disabled-border)] disabled:bg-[color:var(--planner-disabled-surface)] disabled:text-[color:var(--planner-disabled-text)] disabled:opacity-100 disabled:[-webkit-text-fill-color:var(--planner-disabled-text)]"
          >
            {isRouteUpdating ? (
              <span
                aria-hidden="true"
                className="inline-flex size-2.5 animate-pulse rounded-full bg-current"
              />
            ) : null}
            <span className="text-current">
              {routeExists ? "Rebuild day plan" : "Build day plan"}
            </span>
          </button>
        </div>

      </div>
    </section>
  );
}

function DaySetupConcept({
  csvImportReport,
  draft,
  errors,
  isCsvImportReplacePending,
  onAddFixedEvent,
  onBreakCadenceChange,
  onBreakModeChange,
  onCancelCsvImportReplace,
  onConfirmCsvImportReplace,
  onCsvTextChange,
  onInputModeChange,
  onPaceModeChange,
  onPlanningWindowChange,
  onProfileFieldChange,
  onProfilePriorityToggle,
  onRawTextChange,
  onRemoveFixedEvent,
  onSubmit,
  onUpdateFixedEvent,
  pendingFixedEventPreviews,
  warnings,
}: {
  csvImportReport: PlannerCsvImportResult | null;
  draft: DaySetupDraft;
  errors: DaySetupErrors;
  isCsvImportReplacePending: boolean;
  onAddFixedEvent: () => void;
  onBreakCadenceChange: (breakCadence: BreakCadence) => void;
  onBreakModeChange: (breakMode: BreakMode) => void;
  onCancelCsvImportReplace: () => void;
  onConfirmCsvImportReplace: () => void;
  onCsvTextChange: (csvText: string) => void;
  onInputModeChange: (inputMode: DaySetupInputMode) => void;
  onPaceModeChange: (paceMode: PaceMode) => void;
  onPlanningWindowChange: (
    field: "planningStart" | "planningEnd",
    value: string
  ) => void;
  onProfileFieldChange: (
    field: "profileName" | "profileJourney" | "profileRhythm" | "profilePreference",
    value: string
  ) => void;
  onProfilePriorityToggle: (priority: string) => void;
  onRawTextChange: (rawText: string) => void;
  onRemoveFixedEvent: (eventId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateFixedEvent: (
    eventId: string,
    field: keyof DraftFixedEvent,
    value: string
  ) => void;
  pendingFixedEventPreviews: PendingFixedEventPreview[];
  warnings: DaySetupWarnings;
}) {
  const profileJourney = getProfileJourneyOption(draft.profileJourney);
  const profileRhythm = getProfileRhythmOption(draft.profileRhythm);
  const prioritySummary = buildProfilePrioritySummary(draft.profilePriorities);
  const profileName = draft.profileName.trim();
  const profileCardTitle = profileName
    ? `${profileName}'s Waykeeper Profile`
    : "Your Waykeeper Profile";

  return (
    <section
      aria-label="Day setup"
      data-testid="task-intake-panel"
      className="overflow-hidden rounded-[8px] border border-[rgba(255,247,214,0.18)] bg-[color:var(--wk-paper)] shadow-[0_30px_90px_rgba(3,8,34,0.28)]"
    >
      <form className="grid min-h-[42rem] lg:grid-cols-[8.5rem_minmax(0,1fr)_18rem]" onSubmit={onSubmit} noValidate>
        <aside className="relative hidden bg-[color:var(--wk-ink)] p-5 text-white lg:block">
          <ol className="space-y-5 text-sm">
            {[
              ["1", "You", "Who you are"],
              ["2", "Intentions", "What matters"],
              ["3", "Rhythms", "Your patterns"],
              ["4", "Preferences", "Style & tone"],
              ["5", "Review", "Confirm & begin"],
            ].map(([number, label, note], index) => (
              <li className="flex gap-3" key={label}>
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs ${
                    index === 0
                      ? "border-[color:var(--wk-spectral-cyan)] bg-[color:var(--wk-spectral-cyan)] text-[color:var(--wk-ink)]"
                      : "border-white/42 text-white/72"
                  }`}
                >
                  {number}
                </span>
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-[0.67rem] leading-4 text-white/58">
                    {note}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <div className="absolute bottom-0 left-0 right-0 h-40 overflow-hidden">
            <BotanicalGlyph className="absolute bottom-4 left-4 h-24 w-16" tone="jade" />
            <BotanicalGlyph className="absolute bottom-2 left-14 h-32 w-20" tone="blue" />
            <Starcut className="absolute bottom-24 left-5 size-7" />
          </div>
        </aside>

        <div className="space-y-6 p-6 md:p-8">
          <div>
            <p className="text-[0.72rem] font-black uppercase tracking-[0.28em] text-[color:var(--wk-amethyst)]">
              Let&apos;s get to know you
            </p>
            <h1 className="mt-3 font-display text-[clamp(2.4rem,5vw,4.6rem)] leading-[0.9] tracking-[-0.07em] text-[color:var(--wk-ink)]">
              Let&apos;s get to know your day.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--wk-ink-muted)]">
              Waykeeper shapes a plan around the person and the constraints.
              This profile stays local and lightweight for the submission pass.
            </p>
          </div>

          {warnings.global.length > 0 ? (
            <InlineMessage tone="warning">
              {warnings.global.join(" ")}
            </InlineMessage>
          ) : null}

          <section className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
            <label className="space-y-2">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--wk-ink-muted)]">
                What should we call you?
              </span>
              <input
                aria-label="Your name"
                className="h-11 w-full rounded-[4px] border border-[rgba(14,20,51,0.18)] bg-white/70 px-3 text-sm outline-none transition focus:border-[color:var(--wk-cobalt)]"
                onChange={(event) =>
                  onProfileFieldChange("profileName", event.currentTarget.value)
                }
                placeholder="Alex"
                type="text"
                value={draft.profileName}
              />
            </label>

            <div className="space-y-2">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--wk-ink-muted)]">
                Where are you on your journey?
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {profileJourneyOptions.map((option) => (
                  <button
                    aria-pressed={draft.profileJourney === option.value}
                    className={`rounded-[10px] border px-3 py-2 text-left text-xs font-semibold normal-case tracking-normal transition ${
                      draft.profileJourney === option.value
                        ? "border-[color:var(--wk-verdigris)] bg-[color:var(--wk-verdigris)] text-white"
                        : "border-[rgba(14,20,51,0.14)] bg-white/72 text-[color:var(--wk-ink)] hover:border-[color:var(--wk-verdigris)]"
                    }`}
                    key={option.value}
                    onClick={() =>
                      onProfileFieldChange("profileJourney", option.value)
                    }
                    type="button"
                  >
                    <span className="block">{option.label}</span>
                    <span className="mt-1 block text-[0.68rem] font-normal leading-4 opacity-75">
                      {option.helper}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--wk-ink-muted)]">
              What matters most right now? Choose up to 3.
            </p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--wk-ink-muted)]">
              These show up in the review and share brief so the plan has a
              human reason, not just a list of blocks.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {profilePriorityOptions.map((option) => {
                const isSelected = draft.profilePriorities.includes(option.value);

                return (
                  <button
                    aria-pressed={isSelected}
                    className={`rounded-[10px] border px-3 py-2 text-left text-xs font-semibold normal-case tracking-normal transition ${
                      isSelected
                        ? "border-[color:var(--wk-verdigris)] bg-[color:var(--wk-verdigris)] text-white"
                        : "border-[rgba(14,20,51,0.14)] bg-white/72 text-[color:var(--wk-ink)] hover:border-[color:var(--wk-cobalt)]"
                    }`}
                    key={option.value}
                    onClick={() => onProfilePriorityToggle(option.value)}
                    type="button"
                  >
                    <span className="block">{option.label}</span>
                    <span className="mt-1 block text-[0.68rem] font-normal leading-4 opacity-75">
                      {option.helper}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--wk-ink-muted)]">
              Which rhythm should Waykeeper respect?
            </p>
            <p className="mt-1 text-xs leading-5 text-[color:var(--wk-ink-muted)]">
              Local-only context for the profile summary and route brief. The
              deterministic scheduler still uses the concrete window, breaks,
              anchors, and tasks below.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {profileRhythmOptions.map((option) => (
                <button
                  aria-pressed={draft.profileRhythm === option.value}
                  className={`rounded-[10px] border px-3 py-2 text-left text-xs font-semibold normal-case tracking-normal transition ${
                    draft.profileRhythm === option.value
                      ? "border-[color:var(--wk-cobalt)] bg-[color:var(--wk-cobalt)] text-white"
                      : "border-[rgba(14,20,51,0.14)] bg-white/72 text-[color:var(--wk-ink)] hover:border-[color:var(--wk-cobalt)]"
                  }`}
                  key={option.value}
                  onClick={() =>
                    onProfileFieldChange("profileRhythm", option.value)
                  }
                  type="button"
                >
                  <span className="block">{option.label}</span>
                  <span className="mt-1 block text-[0.68rem] font-normal leading-4 opacity-75">
                    {option.helper}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="rounded-[8px] border border-[rgba(14,20,51,0.12)] bg-white/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <SectionHeading
                  label="Brain dump"
                  note={
                    draft.inputMode === "csv"
                      ? "CSV still maps through the same planner review."
                      : "Messy multiline is welcome."
                  }
                />
                <div aria-label="Input mode" className="grid gap-2 sm:grid-cols-2">
                  {([
                    ["brain_dump", "Brain dump"],
                    ["csv", "CSV import"],
                  ] as const).map(([inputMode, label]) => (
                    <button
                      aria-pressed={draft.inputMode === inputMode}
                      className={`rounded-[8px] border px-3 py-2 text-xs font-semibold normal-case tracking-normal transition ${
                        draft.inputMode === inputMode
                          ? "border-[color:var(--wk-cobalt)] bg-[color:var(--wk-cobalt)] text-white"
                          : "border-[rgba(14,20,51,0.14)] bg-white text-[color:var(--wk-ink)]"
                      }`}
                      key={inputMode}
                      onClick={() => onInputModeChange(inputMode)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {draft.inputMode === "csv" ? (
                <CsvImportEditor
                  csvText={draft.csvText}
                  error={errors.rawText}
                  importReport={csvImportReport}
                  isReplacePending={isCsvImportReplacePending}
                  onCancelReplace={onCancelCsvImportReplace}
                  onChange={onCsvTextChange}
                  onConfirmReplace={onConfirmCsvImportReplace}
                />
              ) : (
                <>
                  <BrainDumpEditor
                    placeholder={[
                      "Prep Q2 client update",
                      "Pick up prescription",
                      "Wash gym clothes",
                      "Text Sam back",
                    ].join("\n")}
                    value={draft.rawText}
                    onChange={onRawTextChange}
                  />
                  {errors.rawText ? (
                    <div className="mt-3">
                      <InlineMessage tone="error">{errors.rawText}</InlineMessage>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-[8px] border border-[rgba(14,20,51,0.12)] bg-white/70 p-4">
                <SectionHeading label="Rhythms" note="Window, breaks, and pace." />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--wk-ink-muted)]">
                      Start
                    </span>
                    <input
                      aria-label="Start"
                      className="h-10 w-full rounded-[6px] border border-[rgba(14,20,51,0.16)] bg-white px-3 text-sm outline-none focus:border-[color:var(--wk-cobalt)]"
                      onChange={(event) =>
                        onPlanningWindowChange("planningStart", event.target.value)
                      }
                      onKeyDown={preventImplicitSubmitOnEnter}
                      type="time"
                      value={draft.planningStart}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--wk-ink-muted)]">
                      End
                    </span>
                    <input
                      aria-label="End"
                      className="h-10 w-full rounded-[6px] border border-[rgba(14,20,51,0.16)] bg-white px-3 text-sm outline-none focus:border-[color:var(--wk-cobalt)]"
                      onChange={(event) =>
                        onPlanningWindowChange("planningEnd", event.target.value)
                      }
                      onKeyDown={preventImplicitSubmitOnEnter}
                      type="time"
                      value={draft.planningEnd}
                    />
                  </label>
                </div>
                {errors.planningWindow ? (
                  <div className="mt-3">
                    <InlineMessage tone="error">{errors.planningWindow}</InlineMessage>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3">
                  <label className="flex flex-col gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--wk-ink-muted)]">
                    Work until break
                    <select
                      className="min-h-10 rounded-[6px] border border-[rgba(14,20,51,0.16)] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[color:var(--wk-ink)] outline-none focus:border-[color:var(--wk-cobalt)]"
                      onChange={(event) =>
                        onBreakCadenceChange(
                          event.currentTarget.value as BreakCadence
                        )
                      }
                      value={draft.breakCadence}
                    >
                      {breakCadenceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["restful", "productive"] as const).map((breakMode) => (
                      <button
                        aria-pressed={draft.breakMode === breakMode}
                        className={`rounded-[8px] border px-3 py-2 text-left text-sm font-semibold normal-case tracking-normal transition ${
                          draft.breakMode === breakMode
                            ? "border-[color:var(--wk-ink)] bg-[color:var(--wk-ink)] text-white"
                            : "border-[rgba(14,20,51,0.14)] bg-white text-[color:var(--wk-ink)]"
                        }`}
                        key={breakMode}
                        onClick={() => onBreakModeChange(breakMode)}
                        type="button"
                      >
                        {capitalize(breakMode)}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {paceModeOptions.map((option) => (
                      <button
                        aria-pressed={draft.paceMode === option.value}
                        className={`rounded-[8px] border px-3 py-2 text-left text-sm font-semibold normal-case tracking-normal transition ${
                          draft.paceMode === option.value
                            ? "border-[color:var(--wk-amethyst)] bg-[color:var(--wk-amethyst)] text-white"
                            : "border-[rgba(14,20,51,0.14)] bg-white text-[color:var(--wk-ink)]"
                        }`}
                        key={option.value}
                        onClick={() => onPaceModeChange(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[8px] border border-[rgba(14,20,51,0.12)] bg-white/70 p-4">
                <label className="space-y-2">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--wk-ink-muted)]">
                    What should the route feel like?
                  </span>
                  <span className="block text-xs leading-5 text-[color:var(--wk-ink-muted)]">
                    This becomes visible guidance in the profile and share
                    brief; it does not override the scheduler.
                  </span>
                  <textarea
                    className="min-h-20 w-full resize-y rounded-[6px] border border-[rgba(14,20,51,0.16)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--wk-cobalt)]"
                    maxLength={160}
                    onChange={(event) =>
                      onProfileFieldChange("profilePreference", event.currentTarget.value)
                    }
                    placeholder="Focused work, time to create, movement, and quiet evenings."
                    value={draft.profilePreference}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-[8px] border border-[rgba(14,20,51,0.12)] bg-white/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <SectionHeading
                label="Fixed anchors"
                note="Keep only the commitments that cannot move."
              />
              <button
                className="rounded-[8px] border border-[rgba(14,20,51,0.18)] bg-white px-3 py-2 text-xs font-semibold normal-case tracking-normal text-[color:var(--wk-ink)] transition hover:border-[color:var(--wk-cobalt)]"
                onClick={onAddFixedEvent}
                type="button"
              >
                Add event
              </button>
            </div>
            <div className="mt-4">
              <DaySetupAnchorTimelineEditor
                draft={draft}
                errors={errors}
                onRemoveFixedEvent={onRemoveFixedEvent}
                onUpdateFixedEvent={onUpdateFixedEvent}
                pendingFixedEventPreviews={pendingFixedEventPreviews}
                warnings={warnings}
              />
            </div>
          </section>

          <div className="flex flex-col gap-3 border-t border-[rgba(14,20,51,0.12)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button className="normal-case tracking-normal text-[color:var(--wk-ink)]" type="button">
              Save & exit
            </button>
            <WaykeeperButton
              aria-label={draft.inputMode === "csv" ? "Import CSV" : "Interpret tasks"}
              className="sm:min-w-44"
              tone="jade"
              type="submit"
            >
              {draft.inputMode === "csv" ? "Import CSV" : "Continue"}
            </WaykeeperButton>
          </div>
        </div>

        <aside className="hidden border-l border-[rgba(14,20,51,0.1)] bg-[rgba(255,252,244,0.7)] p-5 xl:block">
          <div
            className="rounded-[8px] border border-[rgba(14,20,51,0.1)] bg-white/78 p-4"
            data-testid="waykeeper-profile-summary"
          >
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--wk-ink-muted)]">
              {profileCardTitle}
            </p>
            <ProfileSignal
              icon={<BotanicalGlyph className="h-10 w-8" tone="jade" />}
              title={profileJourney.summaryTitle}
            >
              {profileJourney.helper}
            </ProfileSignal>
            <ProfileSignal
              icon={<Starcut className="size-8" />}
              title={prioritySummary.title}
            >
              {prioritySummary.description}
            </ProfileSignal>
            <ProfileSignal
              icon={<BotanicalGlyph className="h-10 w-8" tone="blue" />}
              title={profileRhythm.label}
            >
              {profileRhythm.helper}
            </ProfileSignal>
            {draft.profilePreference.trim() ? (
              <ProfileSignal
                icon={<BotanicalGlyph className="h-10 w-8" tone="violet" />}
                title="Day style"
              >
                {draft.profilePreference.trim()}
              </ProfileSignal>
            ) : null}
          </div>

          <div className="mt-5 overflow-hidden rounded-[8px] border border-[rgba(14,20,51,0.12)] bg-[color:var(--wk-ink)]">
            <GeneratedWaykeeperAsset
              {...waykeeperAssets.sampleDayHero}
              className="h-52 w-full"
            />
          </div>
        </aside>
      </form>
    </section>
  );
}

function ProfileSignal({
  children,
  icon,
  title,
}: {
  children: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="mt-5 flex gap-3">
      <span className="shrink-0">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-[color:var(--wk-ink)]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[color:var(--wk-ink-muted)]">
          {children}
        </p>
      </div>
    </div>
  );
}

function getProfileJourneyOption(value: string) {
  return (
    profileJourneyOptions.find((option) => option.value === value) ??
    profileJourneyOptions[1]
  );
}

function getProfileRhythmOption(value: string) {
  return (
    profileRhythmOptions.find((option) => option.value === value) ??
    profileRhythmOptions[0]
  );
}

function buildProfilePrioritySummary(priorities: string[]) {
  const selectedPriorityOptions = priorities.flatMap((priority) => {
    const option = profilePriorityOptions.find(
      (profilePriority) => profilePriority.value === priority
    );

    return option ? [option] : [];
  });

  if (selectedPriorityOptions.length === 0) {
    return {
      title: "Open priority",
      description: "No priority is locked yet, so the route should stay flexible.",
    };
  }

  if (selectedPriorityOptions.length === 1) {
    const [priority] = selectedPriorityOptions;

    return {
      title: priority.label,
      description: priority.helper,
    };
  }

  const priorityNames = selectedPriorityOptions
    .map((priority) => priority.label)
    .join(", ");

  return {
    title: priorityNames,
    description: `Today should preserve ${priorityNames.toLowerCase()} while keeping the route believable.`,
  };
}

function DaySetupAnchorTimelineEditor({
  draft,
  errors,
  onRemoveFixedEvent,
  onUpdateFixedEvent,
  pendingFixedEventPreviews,
  warnings,
}: {
  draft: DaySetupDraft;
  errors: DaySetupErrors;
  onRemoveFixedEvent: (eventId: string) => void;
  onUpdateFixedEvent: (
    eventId: string,
    field: keyof DraftFixedEvent,
    value: string
  ) => void;
  pendingFixedEventPreviews: PendingFixedEventPreview[];
  warnings: DaySetupWarnings;
}) {
  const planningWindowMinutes = getPlanningWindowMinutes(
    draft.planningStart,
    draft.planningEnd
  );
  const incompleteEvents = draft.fixedEvents.filter(
    (event) => !event.startTime || !event.endTime
  );
  const unscheduledEvents = draft.fixedEvents.filter((event) => !event.startTime);

  if (planningWindowMinutes <= 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-[13px] border border-dashed border-stone-300/90 bg-stone-50/90 px-4 py-4 text-sm leading-6 text-stone-600">
          Set a valid planning window to place anchors directly on the preview.
        </div>

        {incompleteEvents.length > 0 ? (
          <div className="rounded-[12px] border border-dashed border-stone-300/90 bg-[color:var(--planner-surface-card)] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Add anchor details
            </p>
            <div className="mt-2 space-y-2">
              {incompleteEvents.map((event) => {
                const inlineIssues = [
                  errors.fixedEvents[event.id],
                  ...(warnings.fixedEvents[event.id] ?? []),
                ].filter(Boolean) as string[];

                return (
                  <div
                    key={event.id}
                    className="rounded-[12px] border border-stone-200/80 bg-stone-50/90 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <label className="min-w-0 flex-1">
                        <span className="sr-only">Anchor title</span>
                        <input
                          aria-label="Anchor title"
                          type="text"
                          value={event.title}
                          onKeyDown={preventImplicitSubmitOnEnter}
                          onChange={(inputEvent) =>
                            onUpdateFixedEvent(event.id, "title", inputEvent.target.value)
                          }
                          placeholder="Fixed event"
                          className="h-10 w-full rounded-[10px] border border-stone-200/80 bg-white px-3 text-sm font-semibold text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => onRemoveFixedEvent(event.id)}
                        className="shrink-0 rounded-[10px] border border-stone-300 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                          Start
                        </span>
                        <AnchorTimeField
                          ariaLabel="Anchor start"
                          value={event.startTime}
                          onChange={(value) =>
                            onUpdateFixedEvent(event.id, "startTime", value)
                          }
                          className="h-10 w-full rounded-[10px] border border-stone-200/80 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-stone-400"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                          End
                        </span>
                        <AnchorTimeField
                          ariaLabel="Anchor end"
                          value={event.endTime}
                          onChange={(value) =>
                            onUpdateFixedEvent(event.id, "endTime", value)
                          }
                          className="h-10 w-full rounded-[10px] border border-stone-200/80 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-stone-400"
                        />
                      </label>
                    </div>

                    {inlineIssues.length > 0 ? (
                      <p className="mt-2 text-[11px] leading-5 text-amber-900">
                        {inlineIssues[0]}
                      </p>
                    ) : (
                      <p className="mt-2 text-[11px] leading-5 text-stone-500">
                        Add both times to place this event on the timeline.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const windowStartMs = getComparableTimeMs(draft.planningStart);
  const windowEndMs = getComparableTimeMs(draft.planningEnd);
  const timelineHeight = Math.max(
    560,
    planningWindowMinutes * DAY_SETUP_TIMELINE_MINUTE_HEIGHT
  );
  const placedEvents = draft.fixedEvents
    .filter((event) => Boolean(event.startTime))
    .sort(
      (left, right) =>
        getComparableTimeMs(left.startTime) - getComparableTimeMs(right.startTime)
    );

  return (
    <div className="flex h-full min-h-[36rem] flex-col gap-3">
      <div className="flex flex-1 flex-col rounded-[13px] border border-stone-200/80 bg-stone-50/90 p-2.5">
        <div
          className="relative h-full min-h-[35rem] overflow-hidden rounded-[12px] border border-stone-200/80 bg-[color:var(--planner-surface-card)]"
          style={{ height: `${timelineHeight}px` }}
        >
          <div
            aria-hidden="true"
            className="absolute bottom-0 top-0 w-px bg-stone-300"
            style={{ left: `${DAY_SETUP_TIMELINE_CARD_OFFSET - 10}px` }}
          />

          {buildSetupTimeMarkers(windowStartMs, windowEndMs).map((marker) => (
            <SetupTimelineMarker
              key={marker.label}
              label={marker.label}
              top={marker.top}
            />
          ))}

          {placedEvents.length === 0 &&
          pendingFixedEventPreviews.length === 0 &&
          draft.fixedEvents.length === 0 ? (
            <div
              className="absolute top-4 rounded-[12px] border border-dashed border-stone-300/90 bg-stone-50/90 px-3 py-3 text-xs leading-5 text-stone-600 sm:text-sm"
              style={{
                left: `${DAY_SETUP_TIMELINE_CARD_OFFSET + 8}px`,
                right: "12px",
              }}
            >
              <p className="font-semibold text-stone-700">No anchors yet</p>
              <p className="mt-1">Add a start time and the block will appear here.</p>
            </div>
          ) : null}

          {placedEvents.map((event) => (
            <DaySetupAnchorEditorBlock
              key={event.id}
              errors={errors}
              event={event}
              onRemoveFixedEvent={onRemoveFixedEvent}
              onUpdateFixedEvent={onUpdateFixedEvent}
              planningWindowEndMs={windowEndMs}
              planningWindowStartMs={windowStartMs}
              timelineHeight={timelineHeight}
              warnings={warnings}
            />
          ))}
        </div>
      </div>

      {pendingFixedEventPreviews.length > 0 ? (
        <div className="rounded-[12px] border border-dashed border-amber-300 bg-amber-50/75 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-900/80">
            Pending anchors
          </p>
          <ul className="mt-2 space-y-2">
            {pendingFixedEventPreviews.map((event) => (
              <li
                key={event.id}
                className="rounded-[10px] border border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-surface-card)] px-3 py-2"
              >
                <p className="text-[13px] font-semibold text-stone-900">
                  {event.title}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-600">
                  {event.timeLabel} · {event.pendingLabel}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unscheduledEvents.length > 0 ? (
        <div className="rounded-[12px] border border-dashed border-stone-300/90 bg-[color:var(--planner-surface-card)] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Add anchor details
          </p>
          <div className="mt-2 space-y-2">
            {unscheduledEvents.map((event) => {
              const inlineIssues = [
                errors.fixedEvents[event.id],
                ...(warnings.fixedEvents[event.id] ?? []),
              ].filter(Boolean) as string[];

              return (
                <div
                  key={event.id}
                  className="rounded-[12px] border border-stone-200/80 bg-stone-50/90 p-3"
                >
                  <div className="flex items-start gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Anchor title</span>
                      <input
                        aria-label="Anchor title"
                        type="text"
                        value={event.title}
                        onKeyDown={preventImplicitSubmitOnEnter}
                        onChange={(inputEvent) =>
                          onUpdateFixedEvent(event.id, "title", inputEvent.target.value)
                        }
                        placeholder="Fixed event"
                        className="h-10 w-full rounded-[10px] border border-stone-200/80 bg-white px-3 text-sm font-semibold text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => onRemoveFixedEvent(event.id)}
                      className="shrink-0 rounded-[10px] border border-stone-300 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                        Start
                      </span>
                      <AnchorTimeField
                        ariaLabel="Anchor start"
                        value={event.startTime}
                        onChange={(value) =>
                          onUpdateFixedEvent(event.id, "startTime", value)
                        }
                        className="h-10 w-full rounded-[10px] border border-stone-200/80 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-stone-400"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                        End
                      </span>
                      <AnchorTimeField
                        ariaLabel="Anchor end"
                        value={event.endTime}
                        onChange={(value) =>
                          onUpdateFixedEvent(event.id, "endTime", value)
                        }
                        className="h-10 w-full rounded-[10px] border border-stone-200/80 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-stone-400"
                      />
                    </label>
                  </div>

                  {inlineIssues.length > 0 ? (
                    <p className="mt-2 text-[11px] leading-5 text-amber-900">
                      {inlineIssues[0]}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] leading-5 text-stone-500">
                      Add both times to place this event on the timeline.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DaySetupAnchorEditorBlock({
  errors,
  event,
  onRemoveFixedEvent,
  onUpdateFixedEvent,
  planningWindowEndMs,
  planningWindowStartMs,
  timelineHeight,
  warnings,
}: {
  errors: DaySetupErrors;
  event: DraftFixedEvent;
  onRemoveFixedEvent: (eventId: string) => void;
  onUpdateFixedEvent: (
    eventId: string,
    field: keyof DraftFixedEvent,
    value: string
  ) => void;
  planningWindowEndMs: number;
  planningWindowStartMs: number;
  timelineHeight: number;
  warnings: DaySetupWarnings;
}) {
  if (!event.startTime) {
    return null;
  }

  const startMs = getComparableTimeMs(event.startTime);
  const hasEndTime = Boolean(event.endTime);
  const endMs = hasEndTime
    ? getComparableTimeMs(event.endTime)
    : planningWindowEndMs;
  const clampedStartMs = Math.max(startMs, planningWindowStartMs);
  const clampedEndMs = Math.min(
    Number.isNaN(endMs) ? planningWindowEndMs : endMs,
    planningWindowEndMs
  );
  const top =
    ((clampedStartMs - planningWindowStartMs) / 60000) *
    DAY_SETUP_TIMELINE_MINUTE_HEIGHT;
  const rawHeight =
    ((Math.max(clampedEndMs, clampedStartMs) - clampedStartMs) / 60000) *
    DAY_SETUP_TIMELINE_MINUTE_HEIGHT;
  const inlineIssues = [
    errors.fixedEvents[event.id],
    ...(warnings.fixedEvents[event.id] ?? []),
  ].filter(Boolean) as string[];
  const showNoteField =
    Boolean(event.note.trim()) || !hasEndTime || inlineIssues.length > 0;
  const minHeight = hasEndTime
    ? showNoteField
      ? 96
      : 72
    : showNoteField
      ? 148
      : 108;
  const height = Math.min(
    Math.max(rawHeight, minHeight),
    Math.max(hasEndTime ? 72 : 112, timelineHeight - top - 10)
  );
  const isCompactTimedBlock = hasEndTime && !showNoteField;
  const blockStyle: CSSProperties = {
    top: `${top}px`,
    left: `${DAY_SETUP_TIMELINE_CARD_OFFSET}px`,
    height: `${height}px`,
    right: "10px",
  };

  return (
    <article
      aria-label={`${event.title || "Fixed event"} anchor editor`}
      className={`absolute overflow-hidden rounded-[18px] border border-[color:var(--planner-border-strong)] bg-[linear-gradient(180deg,rgba(252,252,251,0.98)_0%,rgba(241,244,246,0.96)_100%)] shadow-[var(--planner-shadow-soft)] ${
        isCompactTimedBlock ? "p-1.5" : "p-3.5"
      }`}
      style={blockStyle}
    >
      {!hasEndTime ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent via-[color:var(--planner-surface-muted)]/88 to-[color:var(--planner-surface-soft)]"
        />
      ) : null}

      <div className="relative z-10 flex h-full flex-col">
        <div className={`flex items-start ${isCompactTimedBlock ? "gap-1.5" : "gap-2"}`}>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Title</span>
            <input
              aria-label="Anchor title"
              type="text"
              value={event.title}
              onKeyDown={preventImplicitSubmitOnEnter}
              onChange={(inputEvent) =>
                onUpdateFixedEvent(event.id, "title", inputEvent.target.value)
              }
              placeholder="Fixed event"
              className={`w-full rounded-[11px] border border-stone-300/90 bg-white/88 font-semibold text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-500 focus:bg-white ${
                isCompactTimedBlock
                  ? "h-7 px-2 text-[12px]"
                  : "h-10 px-3.5 text-sm"
              }`}
            />
          </label>
          <button
            type="button"
            onClick={() => onRemoveFixedEvent(event.id)}
            className={`shrink-0 rounded-[11px] border border-stone-300/90 bg-white/82 font-semibold uppercase tracking-[0.16em] text-stone-700 transition hover:border-stone-400 hover:bg-white ${
              isCompactTimedBlock
                ? "h-7 px-2 text-[9px]"
                : "px-3 py-2.5 text-[11px]"
            }`}
          >
            Remove
          </button>
        </div>

        {showNoteField ? (
          <label className={isCompactTimedBlock ? "mt-1.5" : "mt-2.5"}>
            <span className="sr-only">Anchor note</span>
            <input
              aria-label="Anchor note"
              type="text"
              value={event.note}
              onKeyDown={preventImplicitSubmitOnEnter}
              onChange={(inputEvent) =>
                onUpdateFixedEvent(event.id, "note", inputEvent.target.value)
              }
              placeholder={!hasEndTime ? "Optional note. End time still needed." : "Location or note (optional)"}
              className={`w-full rounded-[11px] border border-stone-300/90 bg-white/84 px-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500 focus:bg-white ${
                isCompactTimedBlock ? "h-8 text-[11px]" : "h-9 text-[12px]"
              }`}
            />
          </label>
        ) : null}

        <div
          className={`mt-2.5 grid grid-cols-2 ${
            isCompactTimedBlock ? "gap-1.5" : "gap-2.5"
          }`}
        >
          <label
            className={`flex items-center rounded-[11px] border border-stone-200/90 bg-white/78 ${
              isCompactTimedBlock
                ? "gap-1.5 px-1.5 py-0.5"
                : "gap-2 px-2.5 py-2"
            }`}
          >
            <span
              className={`shrink-0 font-semibold uppercase tracking-[0.18em] ${
                isCompactTimedBlock
                  ? "text-[8px] text-stone-500"
                  : "text-[9px] text-stone-500"
              }`}
            >
              Start
            </span>
            <AnchorTimeField
              ariaLabel="Anchor start"
              value={event.startTime}
              onChange={(value) =>
                onUpdateFixedEvent(event.id, "startTime", value)
              }
              className={`w-full rounded-[10px] border border-stone-300/90 bg-white/88 px-2.5 font-medium text-stone-950 outline-none transition focus:border-stone-500 focus:bg-white ${
                isCompactTimedBlock
                  ? "h-6 border-transparent bg-transparent px-0 text-[11px]"
                  : "h-9 text-[12px]"
              }`}
            />
          </label>
          <label
            className={`flex items-center rounded-[11px] border border-stone-200/90 bg-white/78 ${
              isCompactTimedBlock
                ? "gap-1.5 px-1.5 py-0.5"
                : "gap-2 px-2.5 py-2"
            }`}
          >
            <span
              className={`shrink-0 font-semibold uppercase tracking-[0.18em] ${
                isCompactTimedBlock
                  ? "text-[8px] text-stone-500"
                  : "text-[9px] text-stone-500"
              }`}
            >
              End
            </span>
            <AnchorTimeField
              ariaLabel="Anchor end"
              value={event.endTime}
              onChange={(value) =>
                onUpdateFixedEvent(event.id, "endTime", value)
              }
              className={`w-full rounded-[10px] border border-stone-300/90 bg-white/88 px-2.5 font-medium text-stone-950 outline-none transition focus:border-stone-500 focus:bg-white ${
                isCompactTimedBlock
                  ? "h-6 border-transparent bg-transparent px-0 text-[11px]"
                  : "h-9 text-[12px]"
              }`}
            />
          </label>
        </div>

        {inlineIssues.length > 0 ? (
          <p className="mt-2.5 text-[11px] leading-4 text-amber-900">
            {inlineIssues[0]}
          </p>
        ) : !hasEndTime ? (
          <p className="mt-2.5 text-[11px] leading-4 text-stone-600">
            Fades until you set an end time.
          </p>
        ) : null}
      </div>
    </article>
  );
}

function AnchorTimeField({
  ariaLabel,
  className,
  onChange,
  value,
}: {
  ariaLabel: string;
  className: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [draftValue, setDraftValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const displayValue = isFocused
    ? draftValue
    : value
      ? formatClockInputValue(value)
      : "";

  const commitValue = (rawValue: string) => {
    const trimmedValue = rawValue.trim();

    if (!trimmedValue) {
      onChange("");
      return;
    }

    const parsedTime = parseFlexibleTimeInput(trimmedValue);

    if (!parsedTime) {
      return;
    }

    onChange(parsedTime);
    setDraftValue(formatClockInputValue(parsedTime));
  };

  return (
    <input
      aria-label={ariaLabel}
      type="text"
      inputMode="text"
      value={displayValue}
      placeholder="4p"
      onFocus={(event) => {
        setDraftValue(value ? formatClockInputValue(value) : "");
        setIsFocused(true);
        event.currentTarget.select();
      }}
      onBlur={(event) => {
        setIsFocused(false);
        commitValue(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitValue(event.currentTarget.value);
          event.currentTarget.blur();
          return;
        }

        preventImplicitSubmitOnEnter(event);
      }}
      onChange={(event) => {
        const nextValue = event.currentTarget.value;
        setDraftValue(nextValue);

        if (shouldAutoCommitAnchorTime(nextValue)) {
          commitValue(nextValue);
        }
      }}
      className={className}
    />
  );
}

function SetupTimelineMarker({
  label,
  top,
}: {
  label: string;
  top: number;
}) {
  const isTopMarker = top <= 0;

  return (
    <div
      aria-hidden="true"
      className="absolute left-0 right-0"
      style={{ top: `${top}px` }}
    >
      <p
        className={`absolute left-2 whitespace-nowrap pr-2 text-[10px] font-medium text-stone-500 ${
          isTopMarker ? "top-1" : "top-0 -translate-y-1/2"
        }`}
      >
        {label}
      </p>
      <div
        className="border-t border-dashed border-stone-200/90"
        style={{ marginLeft: `${DAY_SETUP_TIMELINE_CARD_OFFSET - 10}px` }}
      />
    </div>
  );
}

function BrainDumpEditor({
  onChange,
  placeholder,
  value,
}: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [showOverflowCue, setShowOverflowCue] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const currentValue = normalizeEditableText(editor.innerText);

    if (currentValue !== value) {
      editor.innerHTML = buildBrainDumpEditorMarkup(value);
    }
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    const updateEditorLayout = () => {
      setShowOverflowCue(editor.scrollWidth - editor.clientWidth > 12);
    };

    updateEditorLayout();

    const resizeObserver = new ResizeObserver(() => {
      updateEditorLayout();
    });

    resizeObserver.observe(editor);
    editor.addEventListener("scroll", updateEditorLayout, { passive: true });
    window.addEventListener("resize", updateEditorLayout);

    return () => {
      resizeObserver.disconnect();
      editor.removeEventListener("scroll", updateEditorLayout);
      window.removeEventListener("resize", updateEditorLayout);
    };
  }, [value]);

  return (
    <div className="relative mt-2.5 rounded-[14px] border border-stone-200/80 bg-[color:var(--planner-surface-card)] transition focus-within:border-stone-400">
      {value.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 px-4 py-3 text-sm leading-6 text-stone-400">
          {placeholder}
        </div>
      ) : null}

      {showOverflowCue ? (
        <>
          <div className="pointer-events-none absolute inset-y-3 right-0 w-16 bg-gradient-to-r from-transparent via-[color:var(--planner-surface-card)]/78 to-[color:var(--planner-surface-card)]" />
          <div className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-stone-300/90 bg-[color:var(--planner-surface-card)]/96 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500 shadow-[var(--planner-shadow-card)]">
            More to the right
          </div>
        </>
      ) : null}

      <div
        ref={editorRef}
        aria-label="Brain dump"
        contentEditable
        role="textbox"
        spellCheck={false}
        suppressContentEditableWarning
        aria-multiline="true"
        className="h-[18rem] overflow-x-auto overflow-y-hidden px-4 py-3 text-sm text-stone-900 outline-none xl:h-[16rem] [&>div]:break-inside-avoid [&>div]:mb-3 [&>div]:whitespace-pre-wrap [&>div]:leading-[1.28]"
        style={{
          columnGap: `${BRAIN_DUMP_COLUMN_GAP}rem`,
          columnWidth: `${BRAIN_DUMP_COLUMN_WIDTH}rem`,
          columnFill: "auto",
          scrollbarGutter: "stable",
        }}
        onInput={(event) =>
          onChange(normalizeEditableText(event.currentTarget.innerText))
        }
        onPaste={handleBrainDumpPaste}
      />
    </div>
  );
}

function preventImplicitSubmitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") {
    event.preventDefault();
  }
}

function handleBrainDumpPaste(event: ClipboardEvent<HTMLDivElement>) {
  event.preventDefault();
  const plainText = event.clipboardData.getData("text/plain");

  document.execCommand("insertText", false, plainText);
}

function normalizeEditableText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+$/g, "");
}

function buildBrainDumpEditorMarkup(value: string) {
  if (value.length === 0) {
    return "<div><br></div>";
  }

  return value
    .split("\n")
    .map((line) =>
      line.length === 0
        ? "<div><br></div>"
        : `<div>${escapeBrainDumpHtml(line)}</div>`
    )
    .join("");
}

function escapeBrainDumpHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function CsvImportEditor({
  csvText,
  error,
  importReport,
  isReplacePending,
  onCancelReplace,
  onChange,
  onConfirmReplace,
}: {
  csvText: string;
  error?: string;
  importReport: PlannerCsvImportResult | null;
  isReplacePending: boolean;
  onCancelReplace: () => void;
  onChange: (csvText: string) => void;
  onConfirmReplace: () => void;
}) {
  return (
    <div className="mt-2.5 space-y-3">
      <label className="block">
        <span className="sr-only">CSV import text</span>
        <textarea
          aria-label="CSV import text"
          data-testid="csv-import-text"
          value={csvText}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={[
            "title,start,end,type,priority",
            "Study cardiology,10:20,11:10,focus,high",
            "Lunch with preceptor,12:00,1:00,appointment,high",
          ].join("\n")}
          className="min-h-[15rem] w-full rounded-[14px] border border-stone-200/80 bg-[color:var(--planner-surface-card)] px-4 py-3 text-sm leading-6 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:bg-white"
          spellCheck={false}
        />
      </label>

      <p className="text-xs leading-5 text-stone-500">
        Supports flexible aliases like <code>start time</code>, <code>stop</code>,
        <code>task name</code>, <code>deadline</code>, and
        <code> fixed/locked/required</code>.
      </p>

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      {importReport ? (
        <div
          data-testid="csv-import-summary"
          className="rounded-[12px] border border-stone-200/80 bg-stone-50/90 p-3"
        >
          <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-stone-600">
            <Pill>{`${importReport.summary.rowCount} rows`}</Pill>
            <Pill>{`${importReport.summary.taskCount} tasks`}</Pill>
            <Pill>{`${importReport.summary.fixedEventCount} anchors`}</Pill>
            {importReport.summary.warningCount > 0 ? (
              <Pill tone="warning">{`${importReport.summary.warningCount} warnings`}</Pill>
            ) : null}
            {importReport.summary.issueCount > 0 ? (
              <Pill tone="error">{`${importReport.summary.issueCount} issues`}</Pill>
            ) : null}
          </div>

          {importReport.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-[12px] leading-5 text-stone-700">
              {importReport.warnings.map((warning, index) => (
                <li key={`csv-warning-${index}`}>{warning}</li>
              ))}
            </ul>
          ) : null}

          {importReport.rowIssues.length > 0 ? (
            <ul
              data-testid="csv-import-issues"
              className="mt-3 space-y-2 rounded-[10px] border border-[color:var(--planner-accent-danger-border)] bg-[color:var(--planner-accent-danger-surface)] p-3 text-[12px] leading-5 text-[color:var(--planner-accent-danger-strong)]"
            >
              {importReport.rowIssues.map((issue, index) => (
                <li key={`csv-issue-${index}`}>{`Row ${issue.rowNumber}: ${issue.message}`}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {isReplacePending ? (
        <div
          data-testid="csv-import-replace-confirmation"
          className="rounded-[12px] border border-amber-200 bg-amber-50/80 p-3"
        >
          <p className="text-[13px] font-semibold text-amber-950">
            Replace the current working draft with this CSV?
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-900/90">
            This clears the current brain dump, anchor draft, carry-forward intake,
            and interpreted route-in-progress before loading the imported rows into
            review.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <InlineActionButton
              label="Replace with CSV"
              onClick={() => {
                onConfirmReplace();
              }}
              tone="primary"
            />
            <InlineActionButton
              label="Keep current setup"
              onClick={() => {
                onCancelReplace();
              }}
              tone="secondary"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionHeading({
  label,
  note,
}: {
  label: string;
  note: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
        {label}
      </h3>
      <p className="mt-1 text-xs leading-5 text-stone-500">{note}</p>
    </div>
  );
}

function InlineMessage({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "warning";
}) {
  return (
    <div
      className={`rounded-[10px] border px-3 py-2 text-sm leading-6 ${
        tone === "error"
          ? "border-[color:var(--planner-accent-danger-border)] bg-[color:var(--planner-accent-danger-surface)] text-[color:var(--planner-accent-danger-strong)]"
          : "border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-accent-warning-surface)] text-[color:var(--planner-accent-warning-strong)]"
      }`}
    >
      {children}
    </div>
  );
}

function SurfaceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-stone-200/80 bg-stone-50/90 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500">
        {label}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function InspectorDisclosure({
  children,
  countLabel,
  defaultOpen = false,
  label,
  title,
}: {
  children: ReactNode;
  countLabel: string;
  defaultOpen?: boolean;
  label: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="rounded-[14px] border border-stone-200/80 bg-stone-50/90 p-3.5 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="list-none cursor-pointer">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold tracking-tight text-stone-950">
              {title}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              {label}
            </p>
          </div>
          <span className="rounded-full border border-stone-300 bg-[color:var(--planner-surface-card)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600">
            {countLabel}
          </span>
        </div>
      </summary>

      <div className="mt-3">{children}</div>
    </details>
  );
}

function AnchorListItem({
  action,
  meta,
  pending = false,
  timeLabel,
  title,
}: {
  action?: ReactNode;
  meta: string;
  pending?: boolean;
  timeLabel: string;
  title: string;
}) {
  return (
    <li
      className={`rounded-[12px] border p-3.5 ${
        pending
          ? "border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-accent-warning-surface)]"
          : "border-stone-200/80 bg-[color:var(--planner-surface-card)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[13px] font-semibold text-stone-900">{title}</h4>
          <p className="mt-1 text-xs leading-5 text-stone-600">{timeLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-[8px] border border-stone-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-700">
            {meta}
          </span>
          {action}
        </div>
      </div>
    </li>
  );
}

function DurationField({
  isOpen,
  onClose,
  onDurationChange,
  task,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDurationChange: (taskId: string, minutes: number) => void;
  task: Task;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftMinutes, setDraftMinutes] = useState(String(task.estimatedMinutes));

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isOpen, task.estimatedMinutes]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="mt-3 rounded-[10px] border border-stone-200/80 bg-stone-50/90 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="sr-only">Duration minutes</span>
          <input
            ref={inputRef}
            aria-label={`Minutes for ${task.title}`}
            type="number"
            min={5}
            max={240}
            step={5}
            value={draftMinutes}
            onChange={(event) => setDraftMinutes(event.currentTarget.value)}
            onBlur={(event) => {
              const nextValue = Number.parseInt(event.currentTarget.value, 10);

              if (Number.isNaN(nextValue)) {
                setDraftMinutes(String(task.estimatedMinutes));
                return;
              }

              onDurationChange(task.id, nextValue);
              setDraftMinutes(String(nextValue));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const nextValue = Number.parseInt(event.currentTarget.value, 10);

                if (Number.isNaN(nextValue)) {
                  setDraftMinutes(String(task.estimatedMinutes));
                  return;
                }

                onDurationChange(task.id, nextValue);
                setDraftMinutes(String(nextValue));
              }

              if (event.key === "Escape") {
                setDraftMinutes(String(task.estimatedMinutes));
                onClose();
              }
            }}
            className="min-h-10 w-full rounded-[10px] border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-900 outline-none transition focus:border-sky-400 sm:max-w-[8rem]"
          />
          <span className="shrink-0 text-sm font-medium text-stone-600">min</span>
        </label>
        <button
          type="button"
          aria-label={`Close duration editor for ${task.title}`}
          onClick={() => {
            setDraftMinutes(String(task.estimatedMinutes));
            onClose();
          }}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-stone-300 bg-white text-lg font-semibold leading-none text-stone-500 transition hover:border-stone-400 hover:bg-stone-50"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function DueAtField({
  autoFocusNonce,
  isOpen,
  onClose,
  onDueAtChange,
  task,
}: {
  autoFocusNonce: number;
  isOpen: boolean;
  onClose: () => void;
  onDueAtChange: (taskId: string, dueAt: string) => void;
  task: Task;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickerInputRef = useRef<HTMLInputElement | null>(null);
  const [draftValue, setDraftValue] = useState(() =>
    task.dueAt ? formatDueInputValue(task.dueAt) : ""
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const pickerValue = extractDateTimeLocalInput(task.dueAt ?? "");

  function commitDraftValue(nextValue: string) {
    const trimmedValue = nextValue.trim();

    if (!trimmedValue) {
      onDueAtChange(task.id, "");
      setDraftValue("");
      setParseError(null);
      return;
    }

    const parsedLocalDateTime = parseFlexibleLocalDateTimeInput(trimmedValue);

    if (!parsedLocalDateTime) {
      setParseError("Try 3/20/26 3p or 2026-03-20T15:00.");
      return;
    }

    onDueAtChange(task.id, parsedLocalDateTime);
    setDraftValue(formatDueInputValue(`${parsedLocalDateTime}:00`));
    setParseError(null);
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [autoFocusNonce, isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="mt-3 rounded-[10px] border border-stone-200/80 bg-stone-50/90 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Due time (optional)</span>
          <input
            ref={inputRef}
            aria-label={`Due for ${task.title}`}
            type="text"
            inputMode="text"
            placeholder="3/20/26 3p"
            value={draftValue}
            onChange={(event) => {
              setDraftValue(event.currentTarget.value);
              setParseError(null);
            }}
            onBlur={(event) => commitDraftValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDraftValue(event.currentTarget.value);
              }

              if (event.key === "Escape") {
                const nextValue = task.dueAt ? formatDueInputValue(task.dueAt) : "";
                setDraftValue(nextValue);
                setParseError(null);
              }
            }}
            className="min-h-10 w-full rounded-[10px] border border-stone-300 bg-white px-3 text-sm font-medium text-stone-900 outline-none transition focus:border-sky-400"
          />
        </label>
        <div className="relative shrink-0">
          <input
            ref={pickerInputRef}
            aria-hidden="true"
            tabIndex={-1}
            type="datetime-local"
            value={pickerValue}
            onChange={(event) => {
              const nextValue = event.currentTarget.value;

              onDueAtChange(task.id, nextValue);
              setDraftValue(nextValue ? formatDueInputValue(`${nextValue}:00`) : "");
              setParseError(null);
            }}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />
          <button
            type="button"
            aria-label={`Open date picker for ${task.title}`}
            onClick={() => {
              pickerInputRef.current?.focus();
              pickerInputRef.current?.showPicker?.();
            }}
            className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-[10px] border border-stone-300 bg-white px-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
          >
            Pick
          </button>
        </div>
        <button
          type="button"
          aria-label={`Clear due date for ${task.title}`}
          onClick={() => {
            onDueAtChange(task.id, "");
            setDraftValue("");
            setParseError(null);
            onClose();
          }}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-rose-200 bg-rose-50 text-lg font-semibold leading-none text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
        >
          ×
        </button>
      </div>
      {parseError ? (
        <p className="mt-1 text-xs leading-5 text-amber-800">{parseError}</p>
      ) : null}
    </div>
  );
}

function CarryForwardIntakeCard({
  carryForwardItem,
  compact = false,
  onAccept,
  onIgnore,
  onReview,
}: {
  carryForwardItem: CarryForwardItem;
  compact?: boolean;
  onAccept: () => void;
  onIgnore: () => void;
  onReview: () => void;
}) {
  const isPastDue =
    carryForwardItem.dueWarningKinds.includes("carried_forward_late");

  return (
    <li
      className={`rounded-[12px] border p-3 ${
        isPastDue
          ? "border-[color:var(--planner-accent-danger-border)] bg-[color:var(--planner-accent-danger-surface)]"
          : "border-stone-200/80 bg-[color:var(--planner-surface-card)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[13px] font-semibold text-stone-900">
            {carryForwardItem.title}
          </h4>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            {carryForwardItem.remainingMinutes} min remaining ·{" "}
            {getCarryForwardStatusLabel(carryForwardItem.carryForwardStatus)}
          </p>
        </div>
        <span className="rounded-[8px] border border-stone-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-700">
          {carryForwardItem.carriedFromDate}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-medium text-stone-600">
        <Pill>{priorityLabels[carryForwardItem.priority]}</Pill>
        <Pill>{carryForwardItem.mustDoToday ? "Must do" : "Flexible"}</Pill>
        {carryForwardItem.dueAt ? (
          <Pill tone={isPastDue ? "error" : "default"}>
            Due {formatDueAt(carryForwardItem.dueAt)}
          </Pill>
        ) : (
          <Pill>No due time</Pill>
        )}
        {carryForwardItem.deferCount > 0 ? (
          <Pill>Deferred {carryForwardItem.deferCount}x</Pill>
        ) : null}
      </div>

      <p className="mt-2 text-xs leading-5 text-stone-600">
        {carryForwardItem.explanation}
      </p>

      {isPastDue ? (
        <p className="mt-2 rounded-[8px] border border-[color:var(--planner-accent-danger-border)] bg-[color:var(--planner-surface-card)] px-2.5 py-2 text-xs leading-5 text-[color:var(--planner-accent-danger-strong)]">
          This item is already past its due point and needs visible review.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <InlineActionButton
          label={compact ? "Add now" : "Add to today"}
          onClick={() => onAccept()}
          tone="primary"
        />
        <InlineActionButton
          label="Review first"
          onClick={() => onReview()}
          tone="secondary"
        />
        <InlineActionButton
          label={compact ? "Keep ignored" : "Ignore for now"}
          onClick={() => onIgnore()}
          tone="secondary"
        />
      </div>
    </li>
  );
}

function CarryForwardOverflowCard({
  carryForwardItem,
}: {
  carryForwardItem: CarryForwardItem;
}) {
  const isLate = carryForwardItem.dueWarningKinds.includes("carried_forward_late");

  return (
    <li
      className={`rounded-[12px] border p-3.5 ${
        isLate
          ? "border-[color:var(--planner-accent-danger-border)] bg-[color:var(--planner-accent-danger-surface)]"
          : "border-stone-200/80 bg-[color:var(--planner-surface-card)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-stone-900">
            {carryForwardItem.title}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-600">
            {unplacedReasonLabels[carryForwardItem.unplacedReason]}
          </p>
        </div>
        <span className="rounded-[8px] border border-stone-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-700">
          {carryForwardItem.remainingMinutes}m
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-stone-600">
        {carryForwardItem.explanation}
      </p>
      {carryForwardItem.dueAt ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-medium text-stone-600">
          <Pill tone={isLate ? "error" : "default"}>
            Due {formatDueAt(carryForwardItem.dueAt)}
          </Pill>
          {carryForwardItem.deferCount > 0 ? (
            <Pill>Deferred {carryForwardItem.deferCount}x</Pill>
          ) : null}
        </div>
      ) : null}
      {isLate ? (
        <p className="mt-2 text-xs leading-5 text-[color:var(--planner-accent-danger-strong)]">
          Carrying this forward pushes it past its due point.
        </p>
      ) : null}
    </li>
  );
}

function TaskReviewCard({
  feedbackToast,
  onAcceptDetectedDueDate,
  onDismissDetectedDueDate,
  onDueAtChange,
  onDurationChange,
  onKeepTaskFlexible,
  onLockTaskToDetectedTime,
  task,
}: {
  feedbackToast: TaskIntakePanelProps["feedbackToast"];
  onAcceptDetectedDueDate: (taskId: string) => void;
  onDismissDetectedDueDate: (taskId: string) => void;
  onDueAtChange: (taskId: string, dueAt: string) => void;
  onDurationChange: (taskId: string, minutes: number) => void;
  onKeepTaskFlexible: (taskId: string, placeholderHeight: number) => void;
  onLockTaskToDetectedTime: (taskId: string, placeholderHeight: number) => void;
  task: Task;
}) {
  const [isDueEditorOpen, setIsDueEditorOpen] = useState(Boolean(task.dueAt));
  const [focusDueInputNonce, setFocusDueInputNonce] = useState(0);
  const [isDurationEditorOpen, setIsDurationEditorOpen] = useState(false);

  return (
    <li className="rounded-[12px] border border-stone-200/80 bg-[color:var(--planner-surface-card)] p-3.5">
      <TaskSummary
        task={task}
        secondaryAction={
          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={() => setIsDurationEditorOpen((value) => !value)}
              className="inline-flex min-h-8 items-center justify-center rounded-[8px] border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
            >
              {task.estimatedMinutes} min
            </button>
            <button
              type="button"
              onClick={() => {
                setIsDueEditorOpen(true);
                setFocusDueInputNonce((value) => value + 1);
              }}
              className="inline-flex min-h-8 items-center justify-center rounded-[8px] border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
            >
              {task.dueAt ? `${formatDueAt(task.dueAt)}?` : "Due date?"}
            </button>
          </div>
        }
      />
      <DurationField
        key={`${task.id}:${task.estimatedMinutes}`}
        isOpen={isDurationEditorOpen}
        onClose={() => setIsDurationEditorOpen(false)}
        onDurationChange={onDurationChange}
        task={task}
      />
      <DueAtField
        key={`${task.id}:${task.dueAt ?? ""}`}
        autoFocusNonce={focusDueInputNonce}
        isOpen={isDueEditorOpen}
        onClose={() => setIsDueEditorOpen(false)}
        onDueAtChange={onDueAtChange}
        task={task}
      />
      {task.dueDatePreference?.decisionState === "pending" ? (
        <div className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50/80 px-3 py-3">
          <p className="text-[13px] font-semibold text-amber-950">
            {task.dueDatePreference.displayLabel} detected — use this as the due
            time?
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-900/90">
            Confirm it if this is really a deadline, not a preferred working
            time.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <InlineActionButton
              label="Use due time"
              tone="primary"
              onClick={() => onAcceptDetectedDueDate(task.id)}
            />
            <InlineActionButton
              label="No due date"
              tone="secondary"
              onClick={() => onDismissDetectedDueDate(task.id)}
            />
          </div>
        </div>
      ) : null}
      {task.timingPreference?.kind === "time_anchored_unconfirmed" &&
      task.timingPreference.decisionState === "pending" ? (
        <div className="mt-3 rounded-[10px] border border-amber-200 bg-amber-50/80 px-3 py-3">
          <p className="text-[13px] font-semibold text-amber-950">
            {task.timingPreference.displayLabel} detected — lock this to a time?
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-900/90">
            Confirm it only if this should become a true anchor in the route.
          </p>
          <div className="mt-2.5 flex flex-col gap-2 rounded-[10px] border border-amber-200/80 bg-white/80 px-3 py-2.5 sm:flex-row sm:items-center">
            <div className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[10px] border border-[#c9b37d] bg-[#f0e1bc] px-3.5 py-2 text-sm font-semibold text-amber-950 shadow-[0_8px_18px_rgba(120,84,24,0.08)] sm:min-w-[8.5rem]">
              Duration
            </div>
            <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-amber-950">
              <span className="sr-only">Duration minutes</span>
              <input
                type="number"
                min={5}
                max={240}
                step={5}
                value={task.estimatedMinutes}
                onChange={(event) => {
                  const nextValue = Number.parseInt(event.target.value, 10);

                  if (Number.isNaN(nextValue)) {
                    return;
                  }

                  onDurationChange(task.id, nextValue);
                }}
                className="min-h-10 w-full min-w-0 rounded-[10px] border border-[#d8c393] bg-white px-3 text-sm font-semibold text-stone-900 outline-none transition focus:border-amber-400 sm:max-w-[8rem]"
              />
              <span className="shrink-0 text-sm text-amber-950/80">min</span>
            </label>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <InlineActionButton
              label="Lock to time"
              tone="primary"
              onClick={(event) =>
                onLockTaskToDetectedTime(task.id, measureTaskCardHeight(event))
              }
            />
            <InlineActionButton
              label="Keep flexible"
              tone="secondary"
              onClick={(event) =>
                onKeepTaskFlexible(task.id, measureTaskCardHeight(event))
              }
            />
          </div>
        </div>
      ) : feedbackToast ? (
        <InlineFeedbackToast
          className="mt-4"
          style={{
            minHeight: `${getResolvedFeedbackMinHeight(
              feedbackToast.placeholderHeight
            )}px`,
          }}
        >
          {feedbackToast.message}
        </InlineFeedbackToast>
      ) : null}
    </li>
  );
}

function TaskSummary({
  secondaryAction,
  task,
}: {
  secondaryAction?: ReactNode;
  task: Task;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[13px] font-semibold text-stone-900">{task.title}</h4>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            {taskTypeLabels[task.type]} · {task.estimatedMinutes} min ·{" "}
            {priorityLabels[task.priority]}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {task.mustDoToday ? (
            <span className="rounded-[8px] border border-stone-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-700">
              Must do
            </span>
          ) : null}
          {secondaryAction}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-medium text-stone-600">
        <Pill>{task.splittable ? "Splittable" : "Single block"}</Pill>
        {task.breakEligible ? <Pill>Break-eligible</Pill> : null}
        <Pill>{task.deferrable ? "Deferrable" : "Keep today"}</Pill>
        <Pill>Energy {task.energyLevel}</Pill>
        {task.dueDatePreference?.decisionState === "pending" ? (
          <Pill tone="warning">
            Due suggestion {task.dueDatePreference.displayLabel}
          </Pill>
        ) : null}
        {task.carryForward && task.carriedFromDate ? (
          <Pill tone={task.carryForwardStatus === "review" ? "warning" : "default"}>
            From {task.carriedFromDate}
          </Pill>
        ) : null}
        {task.timingPreference?.kind === "preferred_time" ? (
          <Pill>Prefers around {task.timingPreference.displayLabel}</Pill>
        ) : null}
        {task.hardStartTime && task.hardEndTime ? (
          <Pill>Locked to {formatRange(task.hardStartTime, task.hardEndTime)}</Pill>
        ) : null}
      </div>
    </>
  );
}

function InlineFeedbackToast({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-live="polite"
      data-testid="feedback-toast"
      role="status"
      className={`rounded-[10px] border border-[color:var(--planner-accent-positive-border)] bg-[color:var(--planner-accent-positive-surface)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--planner-accent-positive-strong)] ${className ?? ""}`}
      style={style}
    >
      {children}
    </div>
  );
}

function Pill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "warning" | "error";
}) {
  return (
    <span
      className={`rounded-[8px] border px-2 py-0.5 ${
        tone === "warning"
          ? "border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-accent-warning-surface)] text-[color:var(--planner-accent-warning-strong)]"
          : tone === "error"
            ? "border-[color:var(--planner-accent-danger-border)] bg-[color:var(--planner-accent-danger-surface)] text-[color:var(--planner-accent-danger-strong)]"
            : "border-stone-200 bg-stone-50"
      }`}
    >
      {children}
    </span>
  );
}

function InlineActionButton({
  label,
  onClick,
  tone,
}: {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  tone: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex appearance-none items-center justify-center whitespace-nowrap rounded-[10px] px-2.5 py-1.5 transition ${
        tone === "primary"
          ? "border border-[color:var(--planner-ink-surface)] bg-[color:var(--planner-ink-surface)] text-[color:var(--planner-ink-text)] hover:bg-[color:var(--planner-ink-surface-strong)]"
          : "border border-stone-300 bg-[color:var(--planner-surface-card)] text-stone-800 hover:border-stone-400 hover:bg-white"
      }`}
    >
      <span
        className={`font-medium ${tone === "primary" ? "text-[color:var(--planner-ink-text)]" : ""}`}
        style={{ fontSize: "10.5px", lineHeight: "1.1" }}
      >
        {label}
      </span>
    </button>
  );
}

function measureTaskCardHeight(event: MouseEvent<HTMLButtonElement>) {
  const taskCard = event.currentTarget.closest("li");

  if (!taskCard) {
    return 0;
  }

  return Math.round(taskCard.getBoundingClientRect().height);
}

function getResolvedFeedbackMinHeight(placeholderHeight: number) {
  return Math.max(120, placeholderHeight - 104);
}

function sortTasksForInterpretation(tasks: Task[]) {
  return [...tasks]
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      const rankDifference =
        getInterpretationAttentionRank(left.task) -
        getInterpretationAttentionRank(right.task);

      if (rankDifference !== 0) {
        return rankDifference;
      }

      return left.index - right.index;
    })
    .map(({ task }) => task);
}

function getInterpretationAttentionRank(task: Task) {
  if (
    task.timingPreference?.kind === "time_anchored_unconfirmed" &&
    task.timingPreference.decisionState === "pending"
  ) {
    return 0;
  }

  if (task.dueDatePreference?.decisionState === "pending") {
    return 1;
  }

  if (task.carryForward && task.carryForwardStatus === "review") {
    return 2;
  }

  if (task.carryForward) {
    return 3;
  }

  return 4;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getPlanningWindowMinutes(startTime: string, endTime: string) {
  return getMinutesBetween(startTime, endTime);
}

function buildSetupTimeMarkers(startMs: number, endMs: number) {
  const markers: Array<{ label: string; top: number }> = [];
  const totalMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));

  for (let minuteOffset = 0; minuteOffset <= totalMinutes; minuteOffset += 60) {
    const markerTime = new Date(startMs + minuteOffset * 60000);

    markers.push({
      label: new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }).format(markerTime),
      top: minuteOffset * DAY_SETUP_TIMELINE_MINUTE_HEIGHT,
    });
  }

  return markers;
}

function getMinutesBetween(startTime: string, endTime: string) {
  const start = getComparableTimeMs(startTime);
  const end = getComparableTimeMs(endTime);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }

  return Math.max(0, Math.round((end - start) / 60000));
}

function getComparableTimeMs(value: string) {
  if (/^\d{2}:\d{2}$/.test(value)) {
    return new Date(`2026-03-25T${value}:00`).getTime();
  }

  return new Date(value).getTime();
}

function formatMinutesAsHoursAndMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }

  return `${hours}h ${minutes}m`;
}

function formatRange(startTime: string, endTime: string) {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDueAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

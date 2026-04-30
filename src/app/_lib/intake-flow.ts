import type {
  BreakCadence,
  BreakMode,
  HardEvent,
  MockPlannerState,
  PaceMode,
  PlanningWindow,
} from "@/app/_lib/planner-types";
import {
  DEFAULT_BREAK_CADENCE,
  DEFAULT_PACE_MODE,
} from "@/app/_lib/planner-types";

export type PlannerStage = "day_setup" | "interpretation" | "draft_route";
export type DaySetupInputMode = "brain_dump" | "csv";

export interface DraftFixedEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  note: string;
}

export interface DaySetupDraft {
  csvText: string;
  inputMode: DaySetupInputMode;
  rawText: string;
  profileName: string;
  profileJourney: string;
  profilePriorities: string[];
  profileRhythm: string;
  profilePreference: string;
  planningStart: string;
  planningEnd: string;
  breakMode: BreakMode;
  breakCadence: BreakCadence;
  paceMode: PaceMode;
  fixedEvents: DraftFixedEvent[];
}

export interface DaySetupErrors {
  rawText?: string;
  planningWindow?: string;
  fixedEvents: Record<string, string>;
}

export interface DaySetupWarnings {
  global: string[];
  fixedEvents: Record<string, string[]>;
}

export interface IntakeFlowContext {
  date: string;
  offset: string;
  fallbackPlanningWindow: PlanningWindow;
}

export interface PendingFixedEventPreview {
  id: string;
  pendingLabel: string;
  sortTime?: string;
  timeLabel: string;
  title: string;
}

export function createDaySetupDraft(planner: MockPlannerState): DaySetupDraft {
  return {
    csvText: "",
    inputMode: "brain_dump",
    rawText: "",
    profileName: "",
    profileJourney: "building",
    profilePriorities: ["focus", "learning"],
    profileRhythm: "steady_builder",
    profilePreference: "",
    planningStart: extractTimeInput(planner.dayPlan.planningWindow.startTime),
    planningEnd: extractTimeInput(planner.dayPlan.planningWindow.endTime),
    breakMode: planner.dayPlan.breakMode,
    breakCadence: planner.dayPlan.breakCadence ?? DEFAULT_BREAK_CADENCE,
    paceMode: planner.dayPlan.paceMode ?? DEFAULT_PACE_MODE,
    fixedEvents: [],
  };
}

export function createEmptyDaySetupErrors(): DaySetupErrors {
  return {
    fixedEvents: {},
  };
}

export function createEmptyDaySetupWarnings(): DaySetupWarnings {
  return {
    global: [],
    fixedEvents: {},
  };
}

export function getIntakeFlowContext(
  planner: MockPlannerState
): IntakeFlowContext {
  return {
    date: planner.dayPlan.date,
    offset: extractOffset(planner.dayPlan.planningWindow.startTime),
    fallbackPlanningWindow: planner.dayPlan.planningWindow,
  };
}

export function createDraftFixedEvent(): DraftFixedEvent {
  return {
    id: `draft-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    startTime: "",
    endTime: "",
    note: "",
  };
}

export function buildPreviewPlanningWindow(
  draft: DaySetupDraft,
  context: IntakeFlowContext
): PlanningWindow {
  if (!draft.planningStart || !draft.planningEnd) {
    return context.fallbackPlanningWindow;
  }

  return {
    startTime: toIsoDateTime(context.date, draft.planningStart, context.offset),
    endTime: toIsoDateTime(context.date, draft.planningEnd, context.offset),
  };
}

export function buildPreviewHardEvents(
  draft: DaySetupDraft,
  context: IntakeFlowContext
): HardEvent[] {
  return draft.fixedEvents
    .filter((event) => Boolean(event.startTime && event.endTime))
    .map((event) => ({
      id: event.id,
      title: event.title.trim() || "Fixed event",
      startTime: toIsoDateTime(context.date, event.startTime, context.offset),
      endTime: toIsoDateTime(context.date, event.endTime, context.offset),
      notes: event.note.trim() || undefined,
      locked: true as const,
      source: "user" as const,
    }))
    .filter((event) => new Date(event.endTime) > new Date(event.startTime))
    .sort(
      (left, right) =>
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    );
}

export function buildPendingFixedEventPreviews(
  draft: DaySetupDraft,
  context: IntakeFlowContext
): PendingFixedEventPreview[] {
  return draft.fixedEvents
    .filter(hasIncompleteFixedEventTime)
    .map((event) => {
      const previewTime = event.startTime
        ? toIsoDateTime(context.date, event.startTime, context.offset)
        : event.endTime
          ? toIsoDateTime(context.date, event.endTime, context.offset)
          : undefined;

      return {
        id: event.id,
        pendingLabel: event.startTime ? "Needs end time" : "Needs start time",
        sortTime: previewTime,
        timeLabel: event.startTime
          ? `Starts ${event.startTime}`
          : `Ends ${event.endTime}`,
        title: event.title.trim() || "Fixed event",
      };
    })
    .sort((left, right) => {
      if (!left.sortTime && !right.sortTime) {
        return 0;
      }

      if (!left.sortTime) {
        return 1;
      }

      if (!right.sortTime) {
        return -1;
      }

      return new Date(left.sortTime).getTime() - new Date(right.sortTime).getTime();
    });
}

export function validateDaySetupDraft(
  draft: DaySetupDraft,
  context: IntakeFlowContext
) {
  const errors = createEmptyDaySetupErrors();
  const warnings = createEmptyDaySetupWarnings();
  const planningWindow = buildPreviewPlanningWindow(draft, context);
  const planningWindowIsValid =
    new Date(planningWindow.endTime) > new Date(planningWindow.startTime);

  if (!getActivePlannerInputText(draft).trim()) {
    errors.rawText =
      draft.inputMode === "csv"
        ? "Paste at least one CSV row before importing."
        : "Paste at least one task or obligation before interpreting.";
  }

  if (draft.planningStart && draft.planningEnd && !planningWindowIsValid) {
    errors.planningWindow = "Set the end time later than the start time.";
  }

  let hasOutsideWindowWarning = false;
  let occupiedMinutes = 0;

  for (const event of draft.fixedEvents.filter(hasAnyFixedEventContent)) {
    const rowWarnings: string[] = [];
    const hasTitle = Boolean(event.title.trim());

    if (event.startTime || event.endTime) {
      if (!hasTitle) {
        errors.fixedEvents[event.id] = "Add a title for this fixed event.";
      }

      if (!(event.startTime && event.endTime)) {
        rowWarnings.push("Add both times to place this event on the timeline.");
      } else if (!errors.fixedEvents[event.id]) {
        const startTime = toIsoDateTime(
          context.date,
          event.startTime,
          context.offset
        );
        const endTime = toIsoDateTime(
          context.date,
          event.endTime,
          context.offset
        );

        if (new Date(endTime) <= new Date(startTime)) {
          errors.fixedEvents[event.id] =
            "Set the end time later than the start time.";
        } else if (
          planningWindowIsValid &&
          isOutsidePlanningWindow(startTime, endTime, planningWindow)
        ) {
          hasOutsideWindowWarning = true;
          rowWarnings.push(
            "Outside the planning window. It will stay visible as an anchor, but only the in-window portion will appear on the timeline."
          );
        }

        if (planningWindowIsValid) {
          occupiedMinutes += getClampedOverlapMinutes(
            startTime,
            endTime,
            planningWindow
          );
        }
      }
    }

    if (rowWarnings.length > 0) {
      warnings.fixedEvents[event.id] = rowWarnings;
    }
  }

  if (hasOutsideWindowWarning) {
    warnings.global.push(
      "Some fixed events sit outside the planning window and will only partially appear on the timeline."
    );
  }

  if (planningWindowIsValid) {
    const totalMinutes =
      (new Date(planningWindow.endTime).getTime() -
        new Date(planningWindow.startTime).getTime()) /
      60000;
    const remainingMinutes = totalMinutes - occupiedMinutes;

    if (occupiedMinutes > 0 && remainingMinutes <= 30) {
      warnings.global.push(
        "Fixed events leave little flexible time inside this planning window."
      );
    }
  }

  return { errors, warnings };
}

export function getActivePlannerInputText(draft: DaySetupDraft) {
  return draft.inputMode === "csv" ? draft.csvText : draft.rawText;
}

export function hasBlockingErrors(errors: DaySetupErrors) {
  return Boolean(
    errors.rawText ||
      errors.planningWindow ||
      Object.keys(errors.fixedEvents).length > 0
  );
}

function extractTimeInput(isoDateTime: string) {
  return isoDateTime.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
}

function extractOffset(isoDateTime: string) {
  return isoDateTime.match(/([+-]\d{2}:\d{2}|Z)$/)?.[1] ?? "Z";
}

function toIsoDateTime(date: string, time: string, offset: string) {
  return `${date}T${time}:00${offset}`;
}

function hasAnyFixedEventContent(event: DraftFixedEvent) {
  return Boolean(
    event.title.trim() || event.startTime || event.endTime || event.note.trim()
  );
}

function hasIncompleteFixedEventTime(event: DraftFixedEvent) {
  return Boolean(
    (event.startTime && !event.endTime) || (!event.startTime && event.endTime)
  );
}

function isOutsidePlanningWindow(
  startTime: string,
  endTime: string,
  planningWindow: PlanningWindow
) {
  return (
    new Date(startTime) < new Date(planningWindow.startTime) ||
    new Date(endTime) > new Date(planningWindow.endTime)
  );
}

function getClampedOverlapMinutes(
  startTime: string,
  endTime: string,
  planningWindow: PlanningWindow
) {
  const clampedStart = Math.max(
    new Date(startTime).getTime(),
    new Date(planningWindow.startTime).getTime()
  );
  const clampedEnd = Math.min(
    new Date(endTime).getTime(),
    new Date(planningWindow.endTime).getTime()
  );

  return Math.max(0, Math.round((clampedEnd - clampedStart) / 60000));
}

import {
  buildPreviewPlanningWindow,
  buildPreviewHardEvents,
  type DaySetupDraft,
  type IntakeFlowContext,
} from "@/app/_lib/intake-flow";
import { applyTimeAffinities } from "@/app/_lib/planner/time-affinity";
import type {
  EnergyLevel,
  HardEvent,
  ParsedTaskResponse,
  Priority,
  Task,
  TaskDueDatePreference,
  TaskTimingPreference,
  TaskType,
} from "@/app/_lib/planner-types";

interface InterpretDaySetupInput {
  draft: DaySetupDraft;
  context: IntakeFlowContext;
}

const EVENT_KEYWORDS =
  /\b(appointment|meeting|class|doctor|dentist|therapy|interview|pickup|dropoff|flight|train|lesson|call with|consult)\b/i;
const VAGUE_TIME_KEYWORDS =
  /\b(this morning|morning|afternoon|this afternoon|evening|tonight|after lunch|later today|before bed)\b/i;
const APPROXIMATE_TIME_KEYWORDS =
  /\?|\b(maybe|around|about|approx(?:imately)?|roughly)\b/i;
const BULLET_PREFIX = /^\s*(?:[-*•]+|\d+[.)]|(?:\[[ xX]\]))\s*/;

export function interpretDaySetup({
  draft,
  context,
}: InterpretDaySetupInput): ParsedTaskResponse {
  const manualHardEvents = buildPreviewHardEvents(draft, context);
  const planningWindow = buildPreviewPlanningWindow(draft, context);
  const warnings: string[] = [];
  const inferredHardEvents: HardEvent[] = [];
  const tasks: Task[] = [];

  const normalizedManualKeys = new Set(
    manualHardEvents.map((event) => buildEventKey(event.title, event.startTime, event.endTime))
  );

  normalizeRawLines(draft.rawText).forEach((line, index) => {
    const dueDateReference = detectDueDateReference(
      line,
      context,
      planningWindow
    );
    const lineForInterpretation =
      dueDateReference?.cleanedLine.trim() || line;
    const explicitHardEvent = parseExplicitHardEvent(
      lineForInterpretation,
      index,
      context,
      planningWindow
    );

    if (explicitHardEvent.warning) {
      warnings.push(explicitHardEvent.warning);
    }

    if (explicitHardEvent.hardEvent) {
      const eventKey = buildEventKey(
        explicitHardEvent.hardEvent.title,
        explicitHardEvent.hardEvent.startTime,
        explicitHardEvent.hardEvent.endTime
      );

      if (!normalizedManualKeys.has(eventKey)) {
        inferredHardEvents.push(explicitHardEvent.hardEvent);
      } else {
        warnings.push(
          `Kept the manual anchor for "${explicitHardEvent.hardEvent.title}" and skipped the duplicate inferred one from the raw list.`
        );
      }

      return;
    }

    tasks.push(
      createTaskFromLine(
        lineForInterpretation,
        index,
        explicitHardEvent.timingPreference,
        dueDateReference?.dueDatePreference
      )
    );
  });

  const hardEvents = [...manualHardEvents, ...inferredHardEvents].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
  const timeAwareTasks = applyTimeAffinities({
    hardEvents,
    planningWindow,
    tasks,
  });

  return {
    tasks: applyProfileHintsToTasks(timeAwareTasks, draft),
    hardEvents,
    warnings,
  };
}

function applyProfileHintsToTasks(tasks: Task[], draft: DaySetupDraft) {
  const priorities = new Set(draft.profilePriorities);
  const rhythm = draft.profileRhythm;

  return tasks.map((task, index) => {
    let nextTask = task;
    const normalizedTitle = task.title.toLowerCase();

    if (priorities.has("focus") && task.type === "deep_work") {
      nextTask = withPriorityAtLeast(nextTask, "high");
    }

    if (
      priorities.has("learning") &&
      /\b(study|read|reading|review|practice|problem set|homework|class|lecture|research)\b/.test(normalizedTitle)
    ) {
      nextTask = withPriorityAtLeast(nextTask, "high");
    }

    if (
      priorities.has("creativity") &&
      /\b(write|draft|design|create|record|sketch|polish|outline|launch|idea|demo|copy)\b/.test(normalizedTitle)
    ) {
      nextTask = withPriorityAtLeast(nextTask, "high");
    }

    if (
      priorities.has("health") &&
      (task.type === "self_care" ||
        task.type === "break_candidate" ||
        /\b(walk|gym|exercise|meal|lunch|dinner|eat|sleep|rest|prescription|meds|therapy)\b/.test(normalizedTitle))
    ) {
      nextTask = {
        ...withPriorityAtLeast(nextTask, "medium"),
        mustDoToday: true,
        deferrable: false,
      };
    }

    if (
      priorities.has("relationships") &&
      /\b(call|text|email|reply|respond|message|meet|check in|follow up|follow-up|sam|mom|dad|friend|client)\b/.test(normalizedTitle)
    ) {
      nextTask = withPriorityAtLeast(nextTask, "medium");
    }

    if (priorities.has("purpose") && (task.mustDoToday || index === 0)) {
      nextTask = withPriorityAtLeast(nextTask, "high");
    }

    if (rhythm === "morning_focus" && task.type === "deep_work") {
      nextTask = withPriorityAtLeast(nextTask, "high");
    }

    if (
      rhythm === "meeting_weave" &&
      /\b(meeting|call|email|reply|follow up|follow-up|agenda|notes)\b/.test(normalizedTitle)
    ) {
      nextTask = withPriorityAtLeast(nextTask, "medium");
    }

    if (
      rhythm === "evening_closer" &&
      /\b(wrap|close|plan tomorrow|tomorrow|pack|tidy|reset|send)\b/.test(normalizedTitle)
    ) {
      nextTask = withPriorityAtLeast(nextTask, "medium");
    }

    return nextTask;
  });
}

function withPriorityAtLeast(task: Task, minimumPriority: Priority): Task {
  if (getPriorityRank(task.priority) >= getPriorityRank(minimumPriority)) {
    return task;
  }

  return {
    ...task,
    priority: minimumPriority,
  };
}

function getPriorityRank(priority: Priority) {
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

function normalizeRawLines(rawText: string) {
  return rawText
    .split("\n")
    .map((line) => line.replace(BULLET_PREFIX, "").trim())
    .filter(Boolean);
}

function parseExplicitHardEvent(
  rawLine: string,
  index: number,
  context: IntakeFlowContext,
  planningWindow: { startTime: string; endTime: string }
) {
  const line = rawLine.trim();
  const rangeMatch = line.match(
    /\b(\d{1,2}(?::\d{2})?\s?(?:am|pm)|[01]?\d:\d{2}|2[0-3]:\d{2})\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s?(?:am|pm)|[01]?\d:\d{2}|2[0-3]:\d{2})\b/i
  );

  if (rangeMatch) {
    const startTime = parseClockTime(rangeMatch[1], context, planningWindow);
    const endTime = parseClockTime(rangeMatch[2], context, planningWindow);
    const title = line
      .replace(rangeMatch[0], "")
      .replace(/\bat\b/i, "")
      .trim();

    if (startTime && endTime && title) {
      return {
        hardEvent: {
          id: `inferred-event-${index + 1}-${slugify(title) || "anchor"}`,
          title: toTitleCase(title),
          startTime,
          endTime,
          locked: true as const,
          source: "system" as const,
        },
      };
    }
  }

  const timeSignal = detectSingleTimeReference(line, context, planningWindow);

  if (!timeSignal) {
    return {
      warning: VAGUE_TIME_KEYWORDS.test(line)
        ? `Kept "${line}" as a flexible task because the timing is still vague.`
        : undefined,
    };
  }

  if (timeSignal.approximate || !EVENT_KEYWORDS.test(line)) {
    return {
      timingPreference: {
        kind: "time_anchored_unconfirmed" as const,
        preferredStartTime: timeSignal.isoTime,
        displayLabel: timeSignal.displayLabel,
        decisionState: "pending" as const,
        suggestedMinutes: 0,
      },
    };
  }

  const title = line
    .replace(timeSignal.matchedText, "")
    .replace(/\bat\b/i, "")
    .trim();

  if (!title) {
    return {
      warning: `Found a clock time in "${line}" but not enough event detail to create a locked anchor.`,
    };
  }

  const defaultMinutes = inferSingleEventDuration(title);
  const inferredEnd = addMinutes(timeSignal.isoTime, defaultMinutes, context.offset);

  return {
    hardEvent: {
      id: `inferred-event-${index + 1}-${slugify(title) || "anchor"}`,
      title: toTitleCase(title),
      startTime: timeSignal.isoTime,
      endTime: inferredEnd,
      locked: true as const,
      source: "system" as const,
      notes: "Inferred from an explicit clock-based phrase in the raw task list.",
    },
    warning: `Inferred "${toTitleCase(
      title
    )}" as a fixed event from the explicit time in the raw list.`,
  };
}

export function createTaskFromLine(
  line: string,
  index: number,
  timingPreference?: TaskTimingPreference,
  dueDatePreference?: TaskDueDatePreference
): Task {
  const normalized = line.toLowerCase();
  const parsedDuration = parseDurationMinutes(line);
  const type = classifyTaskType(normalized);
  const mustDoToday =
    /\b(today|must|need to|deadline|due|exam|submit|appointment prep|important)\b/i.test(
      line
    ) || index < 3;
  const priority = classifyPriority(line, index, mustDoToday);
  const estimatedMinutes = parsedDuration ?? defaultMinutesForType(type, line);
  const breakEligible =
    type === "break_candidate" ||
    ((type === "admin" || type === "chore" || type === "self_care") &&
      estimatedMinutes <= 15 &&
      /\b(quick|brief|short|one|refill|water|stretch|laundry|dishes|email|medication|meds|tidy)\b/i.test(
        line
      ));
  const splittable =
    type === "deep_work" ||
    /\b(review|study|read|write|draft|research|practice|questions|outline)\b/i.test(
      line
    );
  const energyLevel = classifyEnergyLevel(type, line);
  const deferrable =
    !mustDoToday &&
    priority !== "critical" &&
    priority !== "high" &&
    !/\b(medication|meds|meal|shower|rest)\b/i.test(line);

  return {
    id: `task-${index + 1}-${slugify(line) || "task"}`,
    title: toTitleCase(line),
    rawText: line,
    type,
    estimatedMinutes,
    priority,
    mustDoToday,
    breakEligible,
    splittable,
    deferrable,
    energyLevel,
    dueDatePreference,
    timingPreference: timingPreference
      ? {
          ...timingPreference,
          suggestedMinutes: estimatedMinutes,
        }
      : undefined,
    source: "user",
  };
}

function detectDueDateReference(
  line: string,
  context: IntakeFlowContext,
  planningWindow: { startTime: string; endTime: string }
) {
  const dueMatch = line.match(
    /\b(?:by|before|until)\s+(noon|midnight|\d{1,2}(?::\d{2})?\s?(?:am|pm)|[01]?\d:\d{2}|2[0-3]:\d{2})\b/i
  );

  if (!dueMatch) {
    return null;
  }

  const suggestedDueAt = parseClockTime(
    dueMatch[1],
    context,
    planningWindow
  );

  if (!suggestedDueAt) {
    return null;
  }

  const cleanedLine = line
    .replace(dueMatch[0], "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,:;\-–\s]+/, "")
    .trim();

  return {
    cleanedLine,
    dueDatePreference: {
      suggestedDueAt,
      displayLabel: formatDisplayTime(suggestedDueAt),
      sourcePhrase: dueMatch[0],
      decisionState: "pending" as const,
    },
  };
}

function detectSingleTimeReference(
  line: string,
  context: IntakeFlowContext,
  planningWindow: { startTime: string; endTime: string }
) {
  const ishMatch = line.match(/\b(\d{1,2}(?::\d{2})?)\s*ish\b/i);

  if (ishMatch) {
    const isoTime = parseClockTime(ishMatch[1], context, planningWindow);

    if (!isoTime) {
      return null;
    }

    return {
      isoTime,
      displayLabel: formatDisplayTime(isoTime),
      approximate: true,
      matchedText: ishMatch[0],
    };
  }

  const explicitMatch = line.match(
    /\b(\d{1,2}(?::\d{2})?\s?(?:am|pm)|[01]?\d:\d{2}|2[0-3]:\d{2}|noon|midnight)\b/i
  );

  if (explicitMatch) {
    const isoTime = parseClockTime(explicitMatch[1], context, planningWindow);

    if (!isoTime) {
      return null;
    }

    return {
      isoTime,
      displayLabel: formatDisplayTime(isoTime),
      approximate: APPROXIMATE_TIME_KEYWORDS.test(line),
      matchedText: explicitMatch[0],
    };
  }

  const prefixedHourMatch = line.match(
    /\b(?:around|about|maybe)\s+(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm))?\b/i
  );

  if (!prefixedHourMatch) {
    return null;
  }

  const token = `${prefixedHourMatch[1]}${prefixedHourMatch[2] ? `:${prefixedHourMatch[2]}` : ""}${prefixedHourMatch[3] ?? ""}`;
  const isoTime = parseClockTime(token, context, planningWindow);

  if (!isoTime) {
    return null;
  }

  return {
    isoTime,
    displayLabel: formatDisplayTime(isoTime),
    approximate: true,
    matchedText: prefixedHourMatch[0],
  };
}

function classifyTaskType(normalized: string): TaskType {
  if (
    /\b(refill water|water refill|laundry transfer|take meds|take medication|one short email|quick email|quick tidy|wipe down)\b/i.test(
      normalized
    )
  ) {
    return "break_candidate";
  }

  if (
    /\b(study|review|write|draft|research|outline|practice|problem set|flashcards|project|reading)\b/i.test(
      normalized
    )
  ) {
    return "deep_work";
  }

  if (
    /\b(email|emails|inbox|insurance|call|form|forms|paperwork|bill|schedule|admin)\b/i.test(
      normalized
    )
  ) {
    return "admin";
  }

  if (
    /\b(tidy|clean|laundry|dishes|trash|groceries|errand|kitchen|pickup|dropoff)\b/i.test(
      normalized
    )
  ) {
    return normalized.includes("errand") || normalized.includes("groceries")
      ? "errand"
      : "chore";
  }

  if (
    /\b(lunch|breakfast|dinner|meal|shower|walk|stretch|nap|rest|meditation|snack)\b/i.test(
      normalized
    )
  ) {
    return "self_care";
  }

  return "other";
}

function classifyPriority(
  line: string,
  index: number,
  mustDoToday: boolean
): Priority {
  if (/\b(urgent|asap|critical|deadline|exam today|submit today)\b/i.test(line)) {
    return "critical";
  }

  if (
    mustDoToday ||
    /\b(important|must|need to|doctor|class|meeting|presentation)\b/i.test(line)
  ) {
    return index === 0 ? "critical" : "high";
  }

  if (index < 4) {
    return "medium";
  }

  return "low";
}

function classifyEnergyLevel(type: TaskType, line: string): EnergyLevel {
  if (type === "deep_work") {
    return "high";
  }

  if (
    type === "break_candidate" ||
    type === "chore" ||
    type === "self_care" ||
    /\b(refill|water|stretch|snack|walk|laundry transfer)\b/i.test(line)
  ) {
    return "low";
  }

  return "medium";
}

function defaultMinutesForType(type: TaskType, line: string) {
  if (/\b(40 practice questions|problem set)\b/i.test(line)) {
    return 75;
  }

  switch (type) {
    case "deep_work":
      return 60;
    case "admin":
      return 25;
    case "break_candidate":
      return 10;
    case "chore":
      return 20;
    case "errand":
      return 40;
    case "self_care":
      return /\b(lunch|dinner|meal)\b/i.test(line) ? 30 : 20;
    default:
      return 30;
  }
}

function parseDurationMinutes(value: string) {
  const combinedMatch = value.match(
    /\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\s*(\d{1,2})?\s*(m|min|mins|minutes)?\b/i
  );

  if (combinedMatch) {
    const hours = Number.parseFloat(combinedMatch[1]);
    const minutes = combinedMatch[3] ? Number.parseInt(combinedMatch[3], 10) : 0;
    return Math.round(hours * 60 + minutes);
  }

  const minuteMatch = value.match(/\b(\d{1,3})\s*(m|min|mins|minutes)\b/i);

  if (minuteMatch) {
    return Number.parseInt(minuteMatch[1], 10);
  }

  return null;
}

function parseClockTime(
  rawValue: string,
  context: IntakeFlowContext,
  planningWindow?: { startTime: string; endTime: string }
) {
  const normalized = rawValue.trim().toLowerCase().replace(/\s+/g, "");

  if (normalized === "noon") {
    return `${context.date}T12:00:00${context.offset}`;
  }

  if (normalized === "midnight") {
    return `${context.date}T00:00:00${context.offset}`;
  }

  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);

  if (!match) {
    return null;
  }

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2] ?? "0", 10);
  const meridiem = match[3];

  if (meridiem) {
    if (hours === 12) {
      hours = meridiem === "am" ? 0 : 12;
    } else if (meridiem === "pm") {
      hours += 12;
    }
  } else if (hours > 23) {
    return null;
  } else if (hours <= 12) {
    hours = resolveAmbiguousHour(hours, planningWindow);
  }

  if (hours > 23 || minutes > 59) {
    return null;
  }

  const hourText = String(hours).padStart(2, "0");
  const minuteText = String(minutes).padStart(2, "0");
  return `${context.date}T${hourText}:${minuteText}:00${context.offset}`;
}

function resolveAmbiguousHour(
  hour: number,
  planningWindow?: { startTime: string; endTime: string }
) {
  if (!planningWindow) {
    return hour <= 6 ? hour + 12 : hour;
  }

  const windowStartHour = Number.parseInt(planningWindow.startTime.slice(11, 13), 10);
  const windowEndHour = Number.parseInt(planningWindow.endTime.slice(11, 13), 10);
  const candidates = hour === 12 ? [12] : [hour, hour + 12];
  const insideWindow = candidates.filter((candidate) =>
    candidate >= windowStartHour && candidate <= windowEndHour
  );

  if (insideWindow.length === 1) {
    return insideWindow[0];
  }

  if (insideWindow.length > 1) {
    return hour <= 6 ? Math.max(...insideWindow) : Math.min(...insideWindow);
  }

  return hour <= 6 ? hour + 12 : hour;
}

function inferSingleEventDuration(title: string) {
  if (/\b(class|lesson|therapy|interview|meeting)\b/i.test(title)) {
    return 60;
  }

  if (/\b(doctor|dentist|consult)\b/i.test(title)) {
    return 45;
  }

  return 30;
}

function addMinutes(isoDateTime: string, minutes: number, offset: string) {
  const timestampMs = new Date(isoDateTime).getTime() + minutes * 60000;

  if (offset === "Z") {
    return new Date(timestampMs).toISOString().replace(/\.\d{3}Z$/, ":00Z");
  }

  const [rawHours, rawMinutes] = offset.slice(1).split(":");
  const direction = offset.startsWith("-") ? -1 : 1;
  const offsetMinutes =
    direction *
    (Number.parseInt(rawHours, 10) * 60 + Number.parseInt(rawMinutes, 10));
  const localMs = timestampMs + offsetMinutes * 60000;
  const localDate = new Date(localMs);
  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(localDate.getUTCDate()).padStart(2, "0");
  const hours = String(localDate.getUTCHours()).padStart(2, "0");
  const minutesText = String(localDate.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutesText}:00${offset}`;
}

function formatDisplayTime(isoDateTime: string) {
  const match = isoDateTime.match(/T(\d{2}):(\d{2})/);

  if (!match) {
    return "a detected time";
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = match[2];
  const meridiem = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;

  return minutes === "00"
    ? `${displayHour} ${meridiem}`
    : `${displayHour}:${minutes} ${meridiem}`;
}

function buildEventKey(title: string, startTime: string, endTime: string) {
  return `${slugify(title)}::${new Date(startTime).getTime()}::${new Date(endTime).getTime()}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .map((word) =>
      word.length <= 2 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1)
    )
    .join(" ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

import {
  extractTimeInput,
  formatClockInputValue,
  parseFlexibleLocalDateTimeInput,
  parseFlexibleTimeInput,
  toIsoDateTimeFromLocalInput,
} from "@/app/_lib/planner/date-time";
import { createTaskFromLine } from "@/app/_lib/planner/interpret";
import type {
  HardEvent,
  ParsedTaskResponse,
  Priority,
  Task,
  TaskType,
} from "@/app/_lib/planner-types";

export type PlannerCsvImportField =
  | "title"
  | "start"
  | "end"
  | "typeHint"
  | "duration"
  | "priority"
  | "due"
  | "notes"
  | "anchorSignal";

export interface PlannerCsvNormalizedRow {
  rowNumber: number;
  values: Partial<Record<PlannerCsvImportField, string>>;
}

export interface PlannerCsvImportRowIssue {
  message: string;
  rowNumber: number;
}

export interface PlannerCsvImportSummary {
  issueCount: number;
  rowCount: number;
  taskCount: number;
  warningCount: number;
  fixedEventCount: number;
}

export interface PlannerCsvImportResult {
  csvText: string;
  normalizedRows: PlannerCsvNormalizedRow[];
  parsedTaskResponse: ParsedTaskResponse;
  rowIssues: PlannerCsvImportRowIssue[];
  summary: PlannerCsvImportSummary;
  warnings: string[];
}

const HEADER_ALIASES: Record<PlannerCsvImportField, string[]> = {
  title: ["title", "task", "task name", "name", "event", "event name"],
  start: ["start", "start time", "from", "begin"],
  end: ["end", "end time", "stop", "finish", "to"],
  typeHint: ["type", "task type", "category", "block type"],
  duration: ["duration", "minutes", "mins", "duration minutes"],
  priority: ["priority"],
  due: ["due", "due at", "deadline"],
  notes: ["notes", "note", "details", "description"],
  anchorSignal: ["fixed", "locked", "anchor", "required"],
};

const APPOINTMENT_LIKE_KEYWORDS =
  /\b(appointment|meeting|class|lesson|interview|pickup|dropoff|doctor|dentist|therapy|consult|flight|train)\b/i;
const TRUEISH_VALUES = new Set([
  "1",
  "anchor",
  "anchored",
  "fixed",
  "locked",
  "required",
  "true",
  "yes",
  "y",
]);

const HEADER_ALIAS_TO_FIELD = new Map<string, PlannerCsvImportField>(
  (Object.entries(HEADER_ALIASES) as Array<
    [PlannerCsvImportField, string[]]
  >).flatMap(([field, aliases]) =>
    aliases.map((alias) => [normalizeHeader(alias), field] as const)
  )
);

export function parsePlannerCsvImport({
  csvText,
  date,
  offset,
}: {
  csvText: string;
  date: string;
  offset: string;
}): PlannerCsvImportResult {
  const warnings: string[] = [];
  const rowIssues: PlannerCsvImportRowIssue[] = [];
  const tasks: Task[] = [];
  const hardEvents: HardEvent[] = [];
  const normalizedRows: PlannerCsvNormalizedRow[] = [];
  const parsedRows = parseCsvRows(csvText);

  if (parsedRows.length === 0) {
    rowIssues.push({
      rowNumber: 1,
      message: "Paste a header row and at least one CSV data row before importing.",
    });

    return buildPlannerCsvImportResult({
      csvText,
      hardEvents,
      normalizedRows,
      rowIssues,
      tasks,
      warnings,
    });
  }

  const [headerRow, ...dataRows] = parsedRows;
  const { fieldIndexByName, headerWarnings } = buildFieldIndexByName(headerRow);

  warnings.push(...headerWarnings);

  if (dataRows.length === 0) {
    rowIssues.push({
      rowNumber: 2,
      message: "Add at least one CSV row under the header before importing.",
    });

    return buildPlannerCsvImportResult({
      csvText,
      hardEvents,
      normalizedRows,
      rowIssues,
      tasks,
      warnings,
    });
  }

  if (!fieldIndexByName.has("title")) {
    rowIssues.push({
      rowNumber: 1,
      message: "No title column was found. Use title, task, name, event, or event name.",
    });
  }

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const normalizedRow = buildNormalizedRow(row, rowNumber, fieldIndexByName);

    if (!normalizedRow) {
      return;
    }

    normalizedRows.push(normalizedRow);

    const mappedRow = mapCsvRowToPlannerArtifacts({
      date,
      normalizedRow,
      offset,
    });

    if (mappedRow.issue) {
      rowIssues.push({
        rowNumber,
        message: mappedRow.issue,
      });
      return;
    }

    if (mappedRow.warning) {
      warnings.push(mappedRow.warning);
    }

    if (mappedRow.hardEvent) {
      hardEvents.push(mappedRow.hardEvent);
    }

    if (mappedRow.task) {
      tasks.push(mappedRow.task);
    }
  });

  if (tasks.length === 0 && hardEvents.length === 0 && rowIssues.length === 0) {
    rowIssues.push({
      rowNumber: 1,
      message: "No importable rows were found in this CSV.",
    });
  }

  return buildPlannerCsvImportResult({
    csvText,
    hardEvents,
    normalizedRows,
    rowIssues,
    tasks,
    warnings,
  });
}

function buildPlannerCsvImportResult({
  csvText,
  hardEvents,
  normalizedRows,
  rowIssues,
  tasks,
  warnings,
}: {
  csvText: string;
  hardEvents: HardEvent[];
  normalizedRows: PlannerCsvNormalizedRow[];
  rowIssues: PlannerCsvImportRowIssue[];
  tasks: Task[];
  warnings: string[];
}): PlannerCsvImportResult {
  const dedupedWarnings = Array.from(new Set(warnings.filter(Boolean)));

  return {
    csvText,
    normalizedRows,
    parsedTaskResponse: {
      tasks,
      hardEvents,
      warnings: dedupedWarnings,
      followUpQuestions: [],
    },
    rowIssues,
    summary: {
      issueCount: rowIssues.length,
      rowCount: normalizedRows.length,
      taskCount: tasks.length,
      warningCount: dedupedWarnings.length,
      fixedEventCount: hardEvents.length,
    },
    warnings: dedupedWarnings,
  };
}

function buildFieldIndexByName(headerRow: string[]) {
  const warnings: string[] = [];
  const fieldIndexByName = new Map<PlannerCsvImportField, number>();
  const ignoredHeaders: string[] = [];

  headerRow.forEach((headerCell, index) => {
    const trimmedHeader = headerCell.trim();

    if (!trimmedHeader) {
      return;
    }

    const normalizedHeader = normalizeHeader(trimmedHeader);
    const fieldName = HEADER_ALIAS_TO_FIELD.get(normalizedHeader);

    if (!fieldName) {
      ignoredHeaders.push(trimmedHeader);
      return;
    }

    if (fieldIndexByName.has(fieldName)) {
      warnings.push(
        `Ignored duplicate ${formatFieldLabel(fieldName)} header "${trimmedHeader}" and kept the first matching column.`
      );
      return;
    }

    fieldIndexByName.set(fieldName, index);
  });

  if (ignoredHeaders.length > 0) {
    warnings.push(
      `Ignored unsupported columns: ${ignoredHeaders.join(", ")}.`
    );
  }

  return {
    fieldIndexByName,
    headerWarnings: warnings,
  };
}

function buildNormalizedRow(
  row: string[],
  rowNumber: number,
  fieldIndexByName: Map<PlannerCsvImportField, number>
) {
  const values = Object.fromEntries(
    Array.from(fieldIndexByName.entries()).map(([fieldName, index]) => [
      fieldName,
      (row[index] ?? "").trim(),
    ])
  ) as Partial<Record<PlannerCsvImportField, string>>;

  if (Object.values(values).every((value) => !value)) {
    return null;
  }

  return {
    rowNumber,
    values,
  } satisfies PlannerCsvNormalizedRow;
}

function mapCsvRowToPlannerArtifacts({
  date,
  normalizedRow,
  offset,
}: {
  date: string;
  normalizedRow: PlannerCsvNormalizedRow;
  offset: string;
}) {
  const title = normalizedRow.values.title?.trim() ?? "";
  const startInput = normalizedRow.values.start?.trim() ?? "";
  const endInput = normalizedRow.values.end?.trim() ?? "";
  const notes = normalizedRow.values.notes?.trim() ?? "";
  const typeHint = normalizedRow.values.typeHint?.trim() ?? "";
  const priorityHint = normalizedRow.values.priority?.trim() ?? "";
  const durationHint = normalizedRow.values.duration?.trim() ?? "";
  const dueHint = normalizedRow.values.due?.trim() ?? "";
  const anchorSignal = normalizedRow.values.anchorSignal?.trim() ?? "";

  if (!title) {
    return {
      issue: "Each row needs a title in the title/task/name/event column.",
    };
  }

  if (!startInput && endInput) {
    return {
      issue: `Row "${title}" needs a start time before it can use an end time.`,
    };
  }

  const parsedStartTime = startInput ? parseFlexibleTimeInput(startInput) : undefined;
  const parsedEndTime = endInput ? parseFlexibleTimeInput(endInput) : undefined;

  if (startInput && !parsedStartTime) {
    return {
      issue: `Could not parse the start time "${startInput}" for "${title}".`,
    };
  }

  if (endInput && !parsedEndTime) {
    return {
      issue: `Could not parse the end time "${endInput}" for "${title}".`,
    };
  }

  const startIso = parsedStartTime
    ? `${date}T${parsedStartTime}:00${offset}`
    : undefined;
  const endIso = parsedEndTime ? `${date}T${parsedEndTime}:00${offset}` : undefined;

  if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
    return {
      issue: `End time must be later than the start time for "${title}".`,
    };
  }

  const dueAt = parseDueAt({
    date,
    dueHint,
    offset,
  });

  const hasDueParseFailure = Boolean(dueHint && !dueAt);
  const rangeMinutes =
    startIso && endIso
      ? Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
      : undefined;
  const durationMinutes = parseDurationMinutes(durationHint);

  if (durationHint && durationMinutes == null) {
    return {
      issue: `Could not parse the duration "${durationHint}" for "${title}".`,
    };
  }

  const shouldBecomeAnchor =
    Boolean(startIso && endIso) &&
    (isTrueishValue(anchorSignal) || APPOINTMENT_LIKE_KEYWORDS.test(`${title} ${typeHint}`));

  if (shouldBecomeAnchor) {
    return {
      hardEvent: {
        id: `csv-anchor-${normalizedRow.rowNumber}-${slugify(title) || "event"}`,
        title: toTitleCase(title),
        startTime: startIso!,
        endTime: endIso!,
        locked: true as const,
        notes: notes || undefined,
        source: "user" as const,
      },
      warning: hasDueParseFailure
        ? `Imported "${title}" without a due time because "${dueHint}" could not be parsed.`
        : undefined,
    };
  }

  const estimatedMinutes = rangeMinutes ?? durationMinutes;
  const timingPreference = startIso
    ? {
        kind: "time_anchored_unconfirmed" as const,
        preferredStartTime: startIso,
        displayLabel: formatClockInputValue(extractTimeInput(startIso)),
        decisionState: "pending" as const,
        suggestedMinutes: estimatedMinutes ?? 0,
      }
    : undefined;
  const baseTask = createTaskFromLine(
    title,
    normalizedRow.rowNumber - 1,
    timingPreference
  );
  const type = parseTaskType(typeHint) ?? baseTask.type;
  const priority = parsePriority(priorityHint) ?? baseTask.priority;
  const task: Task = {
    ...baseTask,
    estimatedMinutes: estimatedMinutes ?? baseTask.estimatedMinutes,
    dueAt,
    notes: notes || undefined,
    mustDoToday: Boolean(dueAt) || baseTask.mustDoToday,
    priority,
    rawText: title,
    timingPreference: timingPreference
      ? {
          ...timingPreference,
          suggestedMinutes: estimatedMinutes ?? baseTask.estimatedMinutes,
        }
      : undefined,
    type,
  };

  return {
    task,
    warning: hasDueParseFailure
      ? `Imported "${title}" without a due time because "${dueHint}" could not be parsed.`
      : undefined,
  };
}

function parseCsvRows(csvText: string) {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;
  const sanitizedText = csvText.replace(/^\uFEFF/, "");

  for (let index = 0; index < sanitizedText.length; index += 1) {
    const character = sanitizedText[index];
    const nextCharacter = sanitizedText[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (!inQuotes && character === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      currentCell = "";

      if (currentRow.some((value) => value.trim().length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell);

  if (currentRow.some((value) => value.trim().length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function formatFieldLabel(fieldName: PlannerCsvImportField) {
  switch (fieldName) {
    case "typeHint":
      return "type";
    case "anchorSignal":
      return "anchor";
    default:
      return fieldName;
  }
}

function parseDurationMinutes(rawValue: string) {
  const trimmedValue = rawValue.trim().toLowerCase();

  if (!trimmedValue) {
    return undefined;
  }

  if (/^\d+$/.test(trimmedValue)) {
    return clampDuration(Number.parseInt(trimmedValue, 10));
  }

  const hourMinuteMatch = trimmedValue.match(
    /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/
  );

  if (hourMinuteMatch) {
    const hours = hourMinuteMatch[1] ? Number.parseFloat(hourMinuteMatch[1]) : 0;
    const minutes = hourMinuteMatch[2] ? Number.parseInt(hourMinuteMatch[2], 10) : 0;
    const totalMinutes = Math.round(hours * 60 + minutes);

    return totalMinutes > 0 ? clampDuration(totalMinutes) : undefined;
  }

  const clockMatch = trimmedValue.match(/^(\d{1,2}):(\d{2})$/);

  if (!clockMatch) {
    return undefined;
  }

  const hours = Number.parseInt(clockMatch[1], 10);
  const minutes = Number.parseInt(clockMatch[2], 10);

  if (minutes >= 60) {
    return undefined;
  }

  return clampDuration(hours * 60 + minutes);
}

function parseDueAt({
  date,
  dueHint,
  offset,
}: {
  date: string;
  dueHint: string;
  offset: string;
}) {
  if (!dueHint) {
    return undefined;
  }

  const timeOnly = parseFlexibleTimeInput(dueHint);

  if (timeOnly) {
    return `${date}T${timeOnly}:00${offset}`;
  }

  const parsedLocalDateTime = parseFlexibleLocalDateTimeInput(
    dueHint,
    new Date(`${date}T00:00:00Z`)
  );

  if (!parsedLocalDateTime) {
    return undefined;
  }

  return toIsoDateTimeFromLocalInput(parsedLocalDateTime, offset);
}

function parseTaskType(rawValue: string): TaskType | undefined {
  const normalizedValue = normalizeHeader(rawValue);

  if (!normalizedValue) {
    return undefined;
  }

  if (
    normalizedValue.includes("focus") ||
    normalizedValue.includes("deep") ||
    normalizedValue.includes("study") ||
    normalizedValue.includes("write") ||
    normalizedValue.includes("research")
  ) {
    return "deep_work";
  }

  if (
    normalizedValue.includes("admin") ||
    normalizedValue.includes("email") ||
    normalizedValue.includes("paperwork")
  ) {
    return "admin";
  }

  if (
    normalizedValue.includes("chore") ||
    normalizedValue.includes("clean") ||
    normalizedValue.includes("laundry")
  ) {
    return "chore";
  }

  if (
    normalizedValue.includes("self care") ||
    normalizedValue.includes("self-care") ||
    normalizedValue.includes("rest") ||
    normalizedValue.includes("meal")
  ) {
    return "self_care";
  }

  if (
    normalizedValue.includes("errand") ||
    normalizedValue.includes("grocery") ||
    normalizedValue.includes("pickup") ||
    normalizedValue.includes("dropoff")
  ) {
    return "errand";
  }

  if (
    normalizedValue.includes("appointment") ||
    normalizedValue.includes("meeting") ||
    normalizedValue.includes("class") ||
    normalizedValue.includes("lesson") ||
    normalizedValue.includes("doctor") ||
    normalizedValue.includes("therapy") ||
    normalizedValue.includes("interview")
  ) {
    return "appointment";
  }

  if (normalizedValue.includes("break")) {
    return "break_candidate";
  }

  return undefined;
}

function parsePriority(rawValue: string): Priority | undefined {
  const normalizedValue = normalizeHeader(rawValue);

  switch (normalizedValue) {
    case "critical":
    case "urgent":
      return "critical";
    case "high":
      return "high";
    case "medium":
    case "normal":
      return "medium";
    case "low":
      return "low";
    default:
      return undefined;
  }
}

function isTrueishValue(rawValue: string) {
  return TRUEISH_VALUES.has(normalizeHeader(rawValue));
}

function clampDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return undefined;
  }

  return Math.max(5, Math.min(240, Math.round(minutes)));
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

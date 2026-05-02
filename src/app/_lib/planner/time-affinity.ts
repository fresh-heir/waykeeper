import type {
  HardEvent,
  PlanningWindow,
  Task,
  TaskTimeAffinity,
} from "@/app/_lib/planner-types";
import {
  extractOffset,
  formatIsoWithOffset,
} from "@/app/_lib/planner/date-time";

const MINUTE_MS = 60 * 1000;

const PREP_VERB_PATTERN =
  /\b(prep|prepare|pack|make|cook|draft|review|outline|set up|setup)\b/i;

const STOP_WORDS = new Set([
  "a",
  "about",
  "and",
  "at",
  "before",
  "block",
  "call",
  "day",
  "do",
  "for",
  "from",
  "get",
  "go",
  "in",
  "into",
  "me",
  "my",
  "of",
  "on",
  "part",
  "project",
  "task",
  "the",
  "this",
  "to",
  "up",
  "with",
  "work",
]);

export function applyTimeAffinities({
  hardEvents,
  planningWindow,
  tasks,
}: {
  hardEvents: HardEvent[];
  planningWindow: PlanningWindow;
  tasks: Task[];
}) {
  const nextTasks = tasks.map((task) => ({
    ...task,
    beforeTaskIds: task.beforeTaskIds ? [...task.beforeTaskIds] : undefined,
  }));

  nextTasks.forEach((task) => {
    applyDirectAffinity(task, planningWindow);
  });

  applyPreparationOrdering(nextTasks, hardEvents, planningWindow);
  applyLaundryOrdering(nextTasks, planningWindow);
  applyGroceryCookingOrdering(nextTasks);

  return nextTasks;
}

function applyDirectAffinity(task: Task, planningWindow: PlanningWindow) {
  const normalized = normalizeText(`${task.title} ${task.rawText ?? ""}`);

  const mealAffinity = inferMealAffinity(normalized, planningWindow);

  if (mealAffinity) {
    setAffinity(task, mealAffinity, planningWindow);
  }

  const dayPartAffinity = inferDayPartAffinity(normalized, planningWindow);

  if (dayPartAffinity) {
    setAffinity(task, dayPartAffinity, planningWindow);
  }

  const businessAffinity = inferBusinessAffinity(normalized, planningWindow);

  if (businessAffinity) {
    setAffinity(task, businessAffinity, planningWindow);
  }
}

function inferMealAffinity(
  normalized: string,
  planningWindow: PlanningWindow
): TaskTimeAffinity | null {
  if (/\bbreakfast\b/.test(normalized)) {
    return createClockWindowAffinity({
      displayLabel: "Breakfast belongs near the morning meal window.",
      latestClock: "10:00",
      earliestClock: "06:30",
      planningWindow,
      source: "meal",
      strength: "strong",
      targetClock: "08:00",
    });
  }

  if (
    /\b(lunch|eat lunch|pack lunch|prepare lunch|prep lunch|make lunch)\b/.test(
      normalized
    )
  ) {
    return createClockWindowAffinity({
      displayLabel: "Lunch belongs near the middle of the day.",
      latestClock: "14:00",
      earliestClock: "11:00",
      planningWindow,
      source: "meal",
      strength: "strong",
      targetClock: "12:00",
    });
  }

  if (/\b(dinner|eat dinner|cook dinner|prep dinner|prepare dinner)\b/.test(normalized)) {
    return createClockWindowAffinity({
      displayLabel: "Dinner belongs in the evening.",
      latestClock: "20:30",
      earliestClock: "16:30",
      planningWindow,
      source: "meal",
      strength: "strong",
      targetClock: "18:00",
    });
  }

  return null;
}

function inferDayPartAffinity(
  normalized: string,
  planningWindow: PlanningWindow
): TaskTimeAffinity | null {
  if (/\b(before bed|wind down|plan tomorrow|pack bag)\b/.test(normalized)) {
    const windowStartMs = new Date(planningWindow.startTime).getTime();
    const windowEndMs = new Date(planningWindow.endTime).getTime();
    const finalQuarterStartMs =
      windowStartMs + Math.round((windowEndMs - windowStartMs) * 0.75);

    return normalizeAffinityToPlanningWindow(
      {
        displayLabel: "Wrap-up tasks fit best near the end of the route.",
        earliestStartTime: formatForWindow(finalQuarterStartMs, planningWindow),
        latestEndTime: planningWindow.endTime,
        source: "day_part",
        strength: "strong",
        targetTime: formatForWindow(
          finalQuarterStartMs + Math.round((windowEndMs - finalQuarterStartMs) / 2),
          planningWindow
        ),
      },
      planningWindow
    );
  }

  if (/\b(morning|this morning)\b/.test(normalized)) {
    const windowStartMs = new Date(planningWindow.startTime).getTime();
    const windowEndMs = new Date(planningWindow.endTime).getTime();
    const noonMs = localClockTimeMs(planningWindow, "12:00");
    const midpointMs = windowStartMs + Math.round((windowEndMs - windowStartMs) / 2);

    return normalizeAffinityToPlanningWindow(
      {
        displayLabel: "Morning tasks prefer the first half of the route.",
        earliestStartTime: planningWindow.startTime,
        latestEndTime: formatForWindow(
          Math.min(noonMs, midpointMs, windowEndMs),
          planningWindow
        ),
        source: "day_part",
        strength: "soft",
        targetTime: formatForWindow(
          Math.min(windowStartMs + 60 * MINUTE_MS, windowEndMs),
          planningWindow
        ),
      },
      planningWindow
    );
  }

  if (/\b(afternoon|this afternoon)\b/.test(normalized)) {
    return createClockWindowAffinity({
      displayLabel: "Afternoon tasks prefer the middle of the day.",
      latestClock: "17:00",
      earliestClock: "12:00",
      planningWindow,
      source: "day_part",
      strength: "soft",
      targetClock: "14:00",
    });
  }

  if (/\b(evening|tonight|after work)\b/.test(normalized)) {
    return normalizeAffinityToPlanningWindow(
      {
        displayLabel: "Evening tasks prefer the later part of the route.",
        earliestStartTime: formatForWindow(
          localClockTimeMs(planningWindow, "16:30"),
          planningWindow
        ),
        latestEndTime: planningWindow.endTime,
        source: "day_part",
        strength: "strong",
        targetTime: formatForWindow(
          localClockTimeMs(planningWindow, "18:30"),
          planningWindow
        ),
      },
      planningWindow
    );
  }

  return null;
}

function inferBusinessAffinity(
  normalized: string,
  planningWindow: PlanningWindow
): TaskTimeAffinity | null {
  if (
    !/\b(call|email|bank|pharmacy|post office|pickup|pick up|dropoff|drop off|errand|grocery|groceries)\b/.test(
      normalized
    )
  ) {
    return null;
  }

  return createClockWindowAffinity({
    displayLabel: "Calls, errands, and business-hour tasks prefer daytime.",
    latestClock: "17:30",
    earliestClock: "09:00",
    planningWindow,
    source: "business_hours",
    strength: "soft",
    targetClock: "10:30",
  });
}

function applyPreparationOrdering(
  tasks: Task[],
  hardEvents: HardEvent[],
  planningWindow: PlanningWindow
) {
  tasks.forEach((prepTask) => {
    const prepText = normalizeText(`${prepTask.title} ${prepTask.rawText ?? ""}`);

    if (!PREP_VERB_PATTERN.test(prepText)) {
      return;
    }

    const prepTokens = meaningfulTokens(prepText);

    if (prepTokens.size === 0) {
      return;
    }

    hardEvents.forEach((event) => {
      const eventTokens = meaningfulTokens(event.title);

      if (!hasSharedToken(prepTokens, eventTokens)) {
        return;
      }

      setAffinity(
        prepTask,
        normalizeAffinityToPlanningWindow(
          {
            displayLabel: `Prepare before ${event.title}.`,
            latestEndTime: event.startTime,
            source: "preparation",
            strength: "strong",
            targetTime: formatForWindow(
              Math.max(
                new Date(planningWindow.startTime).getTime(),
                new Date(event.startTime).getTime() -
                  Math.max(prepTask.estimatedMinutes, 30) * MINUTE_MS
              ),
              planningWindow
            ),
          },
          planningWindow
        ),
        planningWindow
      );
    });

    tasks.forEach((targetTask) => {
      if (targetTask.id === prepTask.id) {
        return;
      }

      const targetTokens = meaningfulTokens(
        normalizeText(`${targetTask.title} ${targetTask.rawText ?? ""}`)
      );

      if (!hasSharedToken(prepTokens, targetTokens)) {
        return;
      }

      addBeforeTaskId(prepTask, targetTask.id);

      if (targetTask.hardStartTime) {
        setAffinity(
          prepTask,
          normalizeAffinityToPlanningWindow(
            {
              displayLabel: `Prepare before ${targetTask.title}.`,
              latestEndTime: targetTask.hardStartTime,
              source: "preparation",
              strength: "strong",
              targetTime: formatForWindow(
                Math.max(
                  new Date(planningWindow.startTime).getTime(),
                  new Date(targetTask.hardStartTime).getTime() -
                    Math.max(prepTask.estimatedMinutes, 30) * MINUTE_MS
                ),
                planningWindow
              ),
            },
            planningWindow
          ),
          planningWindow
        );
      }
    });
  });
}

function applyLaundryOrdering(tasks: Task[], planningWindow: PlanningWindow) {
  const startTasks = tasks.filter((task) =>
    /\b(start wash|start laundry|wash laundry|laundry load)\b/.test(
      normalizeText(`${task.title} ${task.rawText ?? ""}`)
    )
  );
  const transferTasks = tasks.filter((task) =>
    /\b(transfer|switch)\b/.test(normalizeText(`${task.title} ${task.rawText ?? ""}`)) &&
    /\b(laundry|wash|dryer)\b/.test(normalizeText(`${task.title} ${task.rawText ?? ""}`))
  );
  const foldTasks = tasks.filter((task) =>
    /\bfold\b/.test(normalizeText(`${task.title} ${task.rawText ?? ""}`)) &&
    /\b(laundry|clothes)\b/.test(normalizeText(`${task.title} ${task.rawText ?? ""}`))
  );

  startTasks.forEach((startTask) => {
    transferTasks.forEach((transferTask) => addBeforeTaskId(startTask, transferTask.id));
    foldTasks.forEach((foldTask) => addBeforeTaskId(startTask, foldTask.id));
  });

  transferTasks.forEach((transferTask) => {
    foldTasks.forEach((foldTask) => addBeforeTaskId(transferTask, foldTask.id));
  });

  [...startTasks, ...transferTasks, ...foldTasks].forEach((task) => {
    setAffinity(
      task,
      {
        displayLabel: "Laundry steps should stay in a sensible order.",
        source: "sequence",
        strength: "soft",
      },
      planningWindow
    );
  });
}

function applyGroceryCookingOrdering(tasks: Task[]) {
  const groceryTasks = tasks.filter((task) =>
    /\b(grocery|groceries|supermarket|shop for food)\b/.test(
      normalizeText(`${task.title} ${task.rawText ?? ""}`)
    )
  );
  const cookingTasks = tasks.filter((task) =>
    /\b(cook|make dinner|prep dinner|prepare dinner|eat dinner|dinner)\b/.test(
      normalizeText(`${task.title} ${task.rawText ?? ""}`)
    )
  );

  groceryTasks.forEach((groceryTask) => {
    cookingTasks.forEach((cookingTask) => {
      if (groceryTask.id !== cookingTask.id) {
        addBeforeTaskId(groceryTask, cookingTask.id);
      }
    });
  });
}

function setAffinity(
  task: Task,
  affinity: TaskTimeAffinity,
  planningWindow: PlanningWindow
) {
  task.timeAffinity = mergeAffinities(
    task.timeAffinity,
    normalizeAffinityToPlanningWindow(affinity, planningWindow)
  );
}

function addBeforeTaskId(task: Task, targetTaskId: string) {
  const beforeTaskIds = new Set(task.beforeTaskIds ?? []);

  beforeTaskIds.add(targetTaskId);
  task.beforeTaskIds = [...beforeTaskIds];
}

function mergeAffinities(
  current: TaskTimeAffinity | undefined,
  incoming: TaskTimeAffinity
): TaskTimeAffinity {
  if (!current) {
    return incoming;
  }

  const currentStrength = current.strength === "strong" ? 2 : 1;
  const incomingStrength = incoming.strength === "strong" ? 2 : 1;
  const primary = incomingStrength >= currentStrength ? incoming : current;
  const fallback = primary === incoming ? current : incoming;

  return {
    displayLabel: primary.displayLabel,
    earliestStartTime: laterIso(
      current.earliestStartTime,
      incoming.earliestStartTime
    ),
    latestEndTime: earlierIso(current.latestEndTime, incoming.latestEndTime),
    source: primary.source,
    strength: primary.strength,
    targetTime: primary.targetTime ?? fallback.targetTime,
  };
}

function createClockWindowAffinity({
  displayLabel,
  earliestClock,
  latestClock,
  planningWindow,
  source,
  strength,
  targetClock,
}: {
  displayLabel: string;
  earliestClock: string;
  latestClock: string;
  planningWindow: PlanningWindow;
  source: TaskTimeAffinity["source"];
  strength: TaskTimeAffinity["strength"];
  targetClock: string;
}) {
  return normalizeAffinityToPlanningWindow(
    {
      displayLabel,
      earliestStartTime: formatForWindow(
        localClockTimeMs(planningWindow, earliestClock),
        planningWindow
      ),
      latestEndTime: formatForWindow(
        localClockTimeMs(planningWindow, latestClock),
        planningWindow
      ),
      source,
      strength,
      targetTime: formatForWindow(
        localClockTimeMs(planningWindow, targetClock),
        planningWindow
      ),
    },
    planningWindow
  );
}

function normalizeAffinityToPlanningWindow(
  affinity: TaskTimeAffinity,
  planningWindow: PlanningWindow
): TaskTimeAffinity {
  const windowStartMs = new Date(planningWindow.startTime).getTime();
  const windowEndMs = new Date(planningWindow.endTime).getTime();
  const earliestMs = affinity.earliestStartTime
    ? new Date(affinity.earliestStartTime).getTime()
    : windowStartMs;
  const latestMs = affinity.latestEndTime
    ? new Date(affinity.latestEndTime).getTime()
    : windowEndMs;
  const hasWindow = affinity.earliestStartTime || affinity.latestEndTime;
  const overlapStartMs = Math.max(windowStartMs, earliestMs);
  const overlapEndMs = Math.min(windowEndMs, latestMs);
  const targetMs = affinity.targetTime
    ? clampMs(new Date(affinity.targetTime).getTime(), windowStartMs, windowEndMs)
    : null;

  if (hasWindow && overlapStartMs > overlapEndMs) {
    return {
      displayLabel: affinity.displayLabel,
      source: affinity.source,
      strength: affinity.strength,
      ...(targetMs !== null
        ? { targetTime: formatForWindow(targetMs, planningWindow) }
        : {}),
    };
  }

  return {
    displayLabel: affinity.displayLabel,
    source: affinity.source,
    strength: affinity.strength,
    ...(affinity.earliestStartTime
      ? { earliestStartTime: formatForWindow(overlapStartMs, planningWindow) }
      : {}),
    ...(affinity.latestEndTime
      ? { latestEndTime: formatForWindow(overlapEndMs, planningWindow) }
      : {}),
    ...(targetMs !== null
      ? { targetTime: formatForWindow(targetMs, planningWindow) }
      : {}),
  };
}

function localClockTimeMs(planningWindow: PlanningWindow, clockTime: string) {
  const [hours = 0, minutes = 0] = clockTime.split(":").map(Number);
  const date = planningWindow.startTime.slice(0, 10);
  const offset = extractOffset(planningWindow.startTime);

  return new Date(
    `${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:00${offset}`
  ).getTime();
}

function formatForWindow(timestampMs: number, planningWindow: PlanningWindow) {
  return formatIsoWithOffset(timestampMs, extractOffset(planningWindow.startTime));
}

function clampMs(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function laterIso(left?: string, right?: string) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function earlierIso(left?: string, right?: string) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return new Date(left).getTime() <= new Date(right).getTime() ? left : right;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ");
}

function meaningfulTokens(value: string) {
  const normalized = normalizeText(value)
    .replace(PREP_VERB_PATTERN, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  return new Set(normalized);
}

function hasSharedToken(left: Set<string>, right: Set<string>) {
  for (const token of left) {
    if (right.has(token)) {
      return true;
    }
  }

  return false;
}

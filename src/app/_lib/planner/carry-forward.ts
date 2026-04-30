import type {
  CarryForwardItem,
  CarryForwardReason,
  CarryForwardStatus,
  DayPlan,
  DueWarning,
  DueWarningKind,
  SourceTag,
  Task,
  UnplacedTask,
  UnplacedTaskReason,
} from "@/app/_lib/planner-types";

const CARRY_FORWARD_STORAGE_KEY = "waykeeper-milestone-6-carry-forward";

export function buildCarryForwardProjection({
  carryForwardReason,
  carriedFromDate,
  dayPlan,
  sourceTasks,
  unplacedTasks,
}: {
  carryForwardReason: CarryForwardReason;
  carriedFromDate: string;
  dayPlan: DayPlan;
  sourceTasks: Task[];
  unplacedTasks: UnplacedTask[];
}) {
  const tasksById = new Map(sourceTasks.map((task) => [task.id, task]));
  const carryForwardItems = unplacedTasks.flatMap((unplacedTask) => {
    const task = tasksById.get(unplacedTask.taskId);

    if (!task) {
      return [];
    }

    const item = createCarryForwardItem({
      carryForwardReason,
      carriedFromDate,
      task,
      remainingMinutes: unplacedTask.remainingMinutes,
      unplacedReason: unplacedTask.reason,
    });

    return [item];
  });
  const carryForwardTaskIds = carryForwardItems.map((item) => item.taskId);
  const dueWarnings = deriveCarryForwardLateWarnings(
    carryForwardItems,
    dayPlan.planningWindow.endTime
  );
  const carryForwardWarningKindsByTaskId = new Map(
    dueWarnings.map((warning) => [warning.taskId, warning.kind])
  );
  const normalizedCarryForwardItems = carryForwardItems.map((item) => ({
    ...item,
    dueWarningKinds: carryForwardWarningKindsByTaskId.has(item.taskId)
      ? [carryForwardWarningKindsByTaskId.get(item.taskId)!]
      : item.dueWarningKinds,
  }));

  return {
    carryForwardItems: normalizedCarryForwardItems,
    carryForwardTaskIds,
    dueWarnings,
    unplacedTasks: [] as UnplacedTask[],
  };
}

export function applyCarryForwardStateToTasks({
  carryForwardItems,
  carriedFromDate,
  sourceTasks,
}: {
  carryForwardItems: CarryForwardItem[];
  carriedFromDate: string;
  sourceTasks: Task[];
}) {
  const carryForwardItemByTaskId = new Map(
    carryForwardItems.map((item) => [item.taskId, item])
  );

  return sourceTasks.map((task) => {
    const carryForwardItem = carryForwardItemByTaskId.get(task.id);

    if (!carryForwardItem) {
      if (
        task.carriedFromDate === carriedFromDate &&
        task.carryForwardStatus === "pending"
      ) {
        return {
          ...task,
          carryForward: false,
          carryForwardReason: undefined,
          carryForwardStatus: undefined,
        };
      }

      return task;
    }

    return {
      ...task,
      carryForward: true,
      carriedFromDate: carryForwardItem.carriedFromDate,
      carryForwardReason: carryForwardItem.carryForwardReason,
      carryForwardStatus: carryForwardItem.carryForwardStatus,
      deferCount: Math.max(
        carryForwardItem.deferCount,
        task.deferCount ?? 0
      ),
    };
  });
}

export function deriveScheduledDueWarnings(dayPlan: DayPlan): DueWarning[] {
  return dayPlan.tasks.flatMap((task) => {
    if (!task.dueAt) {
      return [];
    }

    const taskBlocks = dayPlan.blocks
      .filter((block) => block.taskId === task.id)
      .sort(
        (left, right) =>
          new Date(left.endTime).getTime() - new Date(right.endTime).getTime()
      );
    const lastBlock = taskBlocks.at(-1);

    if (!lastBlock || new Date(lastBlock.endTime) <= new Date(task.dueAt)) {
      return [];
    }

    return [
      createDueWarning({
        dueAt: task.dueAt,
        kind: "scheduled_late",
        relevantTime: lastBlock.endTime,
        taskId: task.id,
        taskTitle: task.title,
      }),
    ];
  });
}

export function deriveCarryForwardLateWarnings(
  carryForwardItems: CarryForwardItem[],
  planningWindowEndTime: string
): DueWarning[] {
  return carryForwardItems.flatMap((item) => {
    if (!item.dueAt || new Date(item.dueAt) > new Date(planningWindowEndTime)) {
      return [];
    }

    return [
      createDueWarning({
        dueAt: item.dueAt,
        kind: "carried_forward_late",
        relevantTime: planningWindowEndTime,
        taskId: item.taskId,
        taskTitle: item.title,
      }),
    ];
  });
}

export function normalizeCarryForwardItemsForDayPlan(
  dayPlan: DayPlan,
  carryForwardItems: CarryForwardItem[]
) {
  const completedTaskIds = new Set(dayPlan.completedTaskIds ?? []);
  const skippedTaskIds = new Set(
    dayPlan.blocks
      .filter((block) => block.status === "skipped" && Boolean(block.taskId))
      .map((block) => block.taskId!)
  );
  const existingByTaskId = new Map(
    carryForwardItems.map((carryForwardItem) => [carryForwardItem.taskId, carryForwardItem])
  );
  const normalizedCarryForwardItems = dayPlan.tasks.flatMap((task) => {
    const existingItem = existingByTaskId.get(task.id);

    if (!existingItem || completedTaskIds.has(task.id) || skippedTaskIds.has(task.id)) {
      return [];
    }

    return [
      {
        ...existingItem,
        deferCount: Math.max(existingItem.deferCount, task.deferCount ?? 0),
        dueAt: task.dueAt ?? existingItem.dueAt,
      },
    ];
  });
  const carryForwardLateWarnings = deriveCarryForwardLateWarnings(
    normalizedCarryForwardItems,
    dayPlan.planningWindow.endTime
  );
  const warningKindsByTaskId = new Map(
    carryForwardLateWarnings.map((warning) => [warning.taskId, warning.kind])
  );

  return normalizedCarryForwardItems.map((carryForwardItem) => ({
    ...carryForwardItem,
    dueWarningKinds: warningKindsByTaskId.has(carryForwardItem.taskId)
      ? [warningKindsByTaskId.get(carryForwardItem.taskId)!]
      : [],
  }));
}

export function isCarryForwardItemPastDue(
  carryForwardItem: Pick<CarryForwardItem, "dueAt">,
  referenceTime: string
) {
  return Boolean(
    carryForwardItem.dueAt &&
      new Date(carryForwardItem.dueAt) <= new Date(referenceTime)
  );
}

export function getCarryForwardStatusLabel(status: CarryForwardStatus) {
  switch (status) {
    case "accepted":
      return "Added to today";
    case "consumed":
      return "Consumed";
    case "ignored":
      return "Ignored";
    case "review":
      return "Review first";
    case "pending":
    default:
      return "From yesterday";
  }
}

export function loadCarryForwardInbox() {
  if (typeof window === "undefined") {
    return [] as CarryForwardItem[];
  }

  try {
    const rawValue = window.localStorage.getItem(CARRY_FORWARD_STORAGE_KEY);

    if (!rawValue) {
      return [] as CarryForwardItem[];
    }

    const parsedValue = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return [] as CarryForwardItem[];
    }

    return parsedValue.filter(isCarryForwardItem);
  } catch {
    return [] as CarryForwardItem[];
  }
}

export function persistCarryForwardInbox(carryForwardItems: CarryForwardItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    CARRY_FORWARD_STORAGE_KEY,
    JSON.stringify(carryForwardItems)
  );
}

export function mergeCarryForwardInboxForDay(
  carryForwardInbox: CarryForwardItem[],
  carryForwardItems: CarryForwardItem[],
  dayDate: string
) {
  const existingById = new Map(
    carryForwardInbox.map((carryForwardItem) => [carryForwardItem.id, carryForwardItem])
  );
  const nextCarryForwardIds = new Set(carryForwardItems.map((item) => item.id));
  const mergedCarryForwardItems: CarryForwardItem[] = [];

  carryForwardInbox.forEach((existingItem) => {
    if (
      existingItem.carriedFromDate === dayDate &&
      !nextCarryForwardIds.has(existingItem.id)
    ) {
      return;
    }

    mergedCarryForwardItems.push(existingItem);
  });

  carryForwardItems.forEach((nextItem) => {
    const existingItem = existingById.get(nextItem.id);

    if (
      existingItem &&
      (existingItem.carryForwardStatus === "accepted" ||
        existingItem.carryForwardStatus === "review" ||
        existingItem.carryForwardStatus === "ignored" ||
        existingItem.carryForwardStatus === "consumed")
    ) {
      mergedCarryForwardItems.push({
        ...nextItem,
        carryForwardStatus: existingItem.carryForwardStatus,
      });
      return;
    }

    mergedCarryForwardItems.push(nextItem);
  });

  return dedupeCarryForwardItems(mergedCarryForwardItems);
}

export function getCarryForwardItemsForIntake(
  carryForwardInbox: CarryForwardItem[],
  plannerDate: string
) {
  return carryForwardInbox.filter(
    (carryForwardItem) =>
      carryForwardItem.carriedFromDate < plannerDate &&
      carryForwardItem.carryForwardStatus !== "consumed"
  );
}

export function updateCarryForwardItemStatus(
  carryForwardInbox: CarryForwardItem[],
  carryForwardItemId: string,
  carryForwardStatus: CarryForwardStatus
) {
  return carryForwardInbox.map((carryForwardItem) =>
    carryForwardItem.id === carryForwardItemId
      ? {
          ...carryForwardItem,
          carryForwardStatus,
        }
      : carryForwardItem
  );
}

export function createTaskFromCarryForwardItem(
  carryForwardItem: CarryForwardItem
): Task {
  return {
    id: `${carryForwardItem.id}-intake`,
    title: carryForwardItem.title,
    rawText: `[from ${carryForwardItem.carriedFromDate}] ${carryForwardItem.title}`,
    type: carryForwardItem.type,
    estimatedMinutes: carryForwardItem.remainingMinutes,
    priority: carryForwardItem.priority,
    mustDoToday: carryForwardItem.mustDoToday,
    breakEligible: carryForwardItem.breakEligible,
    splittable: carryForwardItem.splittable,
    deferrable: carryForwardItem.deferrable,
    deferCount: carryForwardItem.deferCount,
    energyLevel: carryForwardItem.energyLevel,
    dueAt: carryForwardItem.dueAt,
    carryForward: true,
    carriedFromDate: carryForwardItem.carriedFromDate,
    carryForwardReason: carryForwardItem.carryForwardReason,
    carryForwardStatus: carryForwardItem.carryForwardStatus,
    notes: carryForwardItem.notes,
    source: carryForwardItem.source,
  };
}

export function createCarryForwardSeedItem({
  breakEligible = false,
  carriedFromDate,
  carryForwardReason = "overflow",
  carryForwardStatus = "pending",
  deferrable = true,
  deferCount = 1,
  dueAt,
  energyLevel = "medium",
  mustDoToday = false,
  notes,
  priority = "medium",
  remainingMinutes,
  source = "system",
  splittable = true,
  taskId,
  title,
  type = "other",
}: {
  breakEligible?: boolean;
  carriedFromDate: string;
  carryForwardReason?: CarryForwardReason;
  carryForwardStatus?: CarryForwardStatus;
  deferrable?: boolean;
  deferCount?: number;
  dueAt?: string;
  energyLevel?: Task["energyLevel"];
  mustDoToday?: boolean;
  notes?: string;
  priority?: Task["priority"];
  remainingMinutes: number;
  source?: SourceTag;
  splittable?: boolean;
  taskId: string;
  title: string;
  type?: Task["type"];
}) {
  return createCarryForwardItem({
    carryForwardReason,
    carriedFromDate,
    task: {
      id: taskId,
      title,
      type,
      estimatedMinutes: remainingMinutes,
      priority,
      mustDoToday,
      breakEligible,
      splittable,
      deferrable,
      deferCount,
      energyLevel,
      dueAt,
      notes,
      source,
    },
    remainingMinutes,
    unplacedReason: deferrable ? "lower_priority_deferred" : "did_not_fit_today",
    carryForwardStatus,
  });
}

function createCarryForwardItem({
  carryForwardReason,
  carriedFromDate,
  carryForwardStatus = "pending",
  remainingMinutes,
  task,
  unplacedReason,
}: {
  carryForwardReason: CarryForwardReason;
  carriedFromDate: string;
  carryForwardStatus?: CarryForwardStatus;
  remainingMinutes: number;
  task: Task;
  unplacedReason: UnplacedTaskReason;
}) {
  return {
    id: `carry-forward-${carriedFromDate}-${task.id}`,
    taskId: task.id,
    carriedFromDate,
    title: task.title,
    remainingMinutes,
    carryForwardReason,
    carryForwardStatus,
    deferCount: (task.deferCount ?? 0) + 1,
    dueAt: task.dueAt,
    dueWarningKinds: [],
    unplacedReason,
    explanation: getCarryForwardExplanation(unplacedReason),
    type: task.type,
    priority: task.priority,
    mustDoToday: task.mustDoToday,
    breakEligible: task.breakEligible,
    splittable: task.splittable,
    deferrable: task.deferrable,
    energyLevel: task.energyLevel,
    notes: task.notes,
    source: task.source,
  } satisfies CarryForwardItem;
}

function getCarryForwardExplanation(reason: UnplacedTaskReason) {
  switch (reason) {
    case "lower_priority_deferred":
      return "Lower urgency and higher deferrability made this the safer item to move out of today.";
    case "needs_longer_open_slot":
      return "This needs a longer uninterrupted slot than today could realistically provide.";
    case "did_not_fit_today":
    default:
      return "There was not enough believable room left in today for the unfinished remainder.";
  }
}

function createDueWarning({
  dueAt,
  kind,
  relevantTime,
  taskId,
  taskTitle,
}: {
  dueAt: string;
  kind: DueWarningKind;
  relevantTime: string;
  taskId: string;
  taskTitle: string;
}) {
  const label =
    kind === "scheduled_late"
      ? `Scheduled past due: "${taskTitle}" extends beyond its due time.`
      : `Carry forward lands late: "${taskTitle}" would move beyond its due time.`;

  return {
    taskId,
    taskTitle,
    kind,
    dueAt,
    relevantTime,
    message: label,
  } satisfies DueWarning;
}

function dedupeCarryForwardItems(carryForwardItems: CarryForwardItem[]) {
  const uniqueItems = new Map<string, CarryForwardItem>();

  carryForwardItems.forEach((carryForwardItem) => {
    uniqueItems.set(carryForwardItem.id, carryForwardItem);
  });

  return [...uniqueItems.values()].sort((left, right) =>
    left.carriedFromDate === right.carriedFromDate
      ? left.title.localeCompare(right.title)
      : left.carriedFromDate.localeCompare(right.carriedFromDate)
  );
}

function isCarryForwardItem(value: unknown): value is CarryForwardItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CarryForwardItem>;

  return Boolean(
    typeof candidate.id === "string" &&
      typeof candidate.taskId === "string" &&
      typeof candidate.carriedFromDate === "string" &&
      typeof candidate.title === "string" &&
      typeof candidate.remainingMinutes === "number" &&
      typeof candidate.carryForwardReason === "string" &&
      typeof candidate.carryForwardStatus === "string" &&
      Array.isArray(candidate.dueWarningKinds)
  );
}

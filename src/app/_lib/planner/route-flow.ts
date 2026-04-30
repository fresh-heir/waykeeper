import type {
  RouteFlowContext,
  RouteLocationContext,
  ScheduleBlock,
  Task,
} from "@/app/_lib/planner-types";

const STRONG_OUT_OF_HOME_PATTERNS = [
  /\bgrocery(?:\s+(?:run|store|pickup))?\b/i,
  /\bpharmacy\s+pickup\b/i,
  /\bpick\s*up\b/i,
  /\bpickup\b/i,
  /\bdrop\s*off\b/i,
  /\breturn\s+package\b/i,
  /\bpost\s+office\b/i,
  /\bgo\s+to\s+(?:the\s+)?(?:bank|store|pharmacy|post office|clinic)\b/i,
  /\bdrive\s+to\b/i,
  /\btrip\s+to\b/i,
  /\bgas(?:\s+station)?\b/i,
  /\bgo\s+to\s+bank\b/i,
  /\bbank\s+run\b/i,
];

const DESK_CONTACT_PATTERNS = [
  /\bcall\b/i,
  /\bemail\b/i,
  /\breply\b/i,
  /\btext\b/i,
  /\bmessage\b/i,
  /\bportal\b/i,
  /\bonline\b/i,
  /\bsubmit\b/i,
];

const HOME_PATTERNS = [
  /\bshower\b/i,
  /\blaundry\b/i,
  /\bfold\b/i,
  /\bdishes\b/i,
  /\bclean\b/i,
  /\btidy\b/i,
  /\bvacuum\b/i,
  /\btrash\b/i,
  /\bcounters?\b/i,
  /\bkitchen\b/i,
  /\bmeal\s+prep\b/i,
  /\bcook\b/i,
  /\blunch\b/i,
  /\bdinner\b/i,
  /\bbreakfast\b/i,
  /\brest\b/i,
  /\bnap\b/i,
];

const DESK_PATTERNS = [
  ...DESK_CONTACT_PATTERNS,
  /\breview\b/i,
  /\bstudy\b/i,
  /\bwrite\b/i,
  /\bread\b/i,
  /\bquestions?\b/i,
  /\bflashcards?\b/i,
  /\bnotes?\b/i,
  /\bslides?\b/i,
  /\bform\b/i,
  /\bmockup\b/i,
  /\bcredentialing\b/i,
  /\binsurance\b/i,
];

export interface RouteFlowAnalysis {
  anchorSeparatedLocationSwitchCount: number;
  hasForcedAwkwardInterleaving: boolean;
  knownLocationContexts: RouteLocationContext[];
  locationSwitchCount: number;
  modeSwitchCount: number;
}

export function inferTaskRouteFlowContext(task: Task): RouteFlowContext {
  const normalizedText = buildTaskRouteFlowText(task);
  const hasDeskContactCue = DESK_CONTACT_PATTERNS.some((pattern) =>
    pattern.test(normalizedText)
  );

  let locationContext: RouteLocationContext = "unknown";

  if (
    STRONG_OUT_OF_HOME_PATTERNS.some((pattern) => pattern.test(normalizedText)) &&
    !hasDeskContactCue
  ) {
    locationContext = "out_of_home";
  } else if (
    HOME_PATTERNS.some((pattern) => pattern.test(normalizedText)) ||
    (task.type === "self_care" && /\bshower\b/i.test(normalizedText))
  ) {
    locationContext = "home";
  } else if (
    task.type === "deep_work" ||
    task.type === "admin" ||
    task.type === "break_candidate" ||
    hasDeskContactCue ||
    DESK_PATTERNS.some((pattern) => pattern.test(normalizedText))
  ) {
    locationContext = "desk";
  } else if (task.type === "errand" && !hasDeskContactCue) {
    locationContext = "out_of_home";
  }

  const cognitiveMode =
    task.type === "deep_work"
      ? "deep_focus"
      : task.type === "admin" ||
          task.type === "break_candidate" ||
          hasDeskContactCue ||
          (task.energyLevel === "low" && task.estimatedMinutes <= 30)
        ? "light_admin"
        : "other";

  return {
    locationContext,
    cognitiveMode,
  };
}

export function analyzeRouteFlowSequence(
  blocks: ScheduleBlock[],
  tasks: Task[]
): RouteFlowAnalysis {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const sortedBlocks = [...blocks].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
  const knownLocationContexts = new Set<RouteLocationContext>();
  let previousLocationContext: RouteLocationContext | null = null;
  let previousCognitiveMode: RouteFlowContext["cognitiveMode"] | null = null;
  let locationSwitchCount = 0;
  let modeSwitchCount = 0;
  let anchorSeparatedLocationSwitchCount = 0;
  let sawLockedSeparator = false;

  sortedBlocks.forEach((block) => {
    if (block.locked) {
      sawLockedSeparator = true;
      return;
    }

    if (
      !block.taskId ||
      block.blockType === "break" ||
      block.blockType === "buffer" ||
      block.blockType === "transition"
    ) {
      return;
    }

    const task = tasksById.get(block.taskId);

    if (!task) {
      return;
    }

    const routeContext = inferTaskRouteFlowContext(task);

    if (routeContext.locationContext !== "unknown") {
      knownLocationContexts.add(routeContext.locationContext);
    }

    if (
      previousLocationContext &&
      routeContext.locationContext !== "unknown" &&
      previousLocationContext !== "unknown" &&
      previousLocationContext !== routeContext.locationContext
    ) {
      locationSwitchCount += 1;

      if (sawLockedSeparator) {
        anchorSeparatedLocationSwitchCount += 1;
      }
    }

    if (
      previousCognitiveMode &&
      routeContext.cognitiveMode !== "other" &&
      previousCognitiveMode !== "other" &&
      previousCognitiveMode !== routeContext.cognitiveMode
    ) {
      modeSwitchCount += 1;
    }

    if (routeContext.locationContext !== "unknown") {
      previousLocationContext = routeContext.locationContext;
    }
    if (routeContext.cognitiveMode !== "other") {
      previousCognitiveMode = routeContext.cognitiveMode;
    }

    sawLockedSeparator = false;
  });

  return {
    anchorSeparatedLocationSwitchCount,
    hasForcedAwkwardInterleaving:
      anchorSeparatedLocationSwitchCount >= 1 && locationSwitchCount >= 2,
    knownLocationContexts: Array.from(knownLocationContexts),
    locationSwitchCount,
    modeSwitchCount,
  };
}

function buildTaskRouteFlowText(task: Task) {
  return [task.title, task.rawText, task.notes].filter(Boolean).join(" ").toLowerCase();
}

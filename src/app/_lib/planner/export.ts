import {
  formatBlockRange,
  formatDueAt,
  getSafeBlockTitle,
} from "@/app/_lib/planner/oracle";
import type {
  CarryForwardItem,
  DayPlan,
  DraftScheduleResponse,
  DueWarning,
  ReplanPreview,
  ScheduleBlock,
  UnplacedTask,
} from "@/app/_lib/planner-types";

export type PlannerExportVariant = "daily_brief" | "llm_ready" | "raw_text";
export type PlannerExportSourceKind = "route" | "replan_preview";

export interface PlannerExportProfile {
  name?: string;
  journey?: string;
  preference?: string;
  priorities?: string[];
  rhythm?: string;
}

export interface PlannerExportSource {
  badgeLabel: string;
  carryForwardItems: CarryForwardItem[];
  currentTime?: string;
  dayPlan: DayPlan;
  headingLabel: string;
  kind: PlannerExportSourceKind;
  oracleAdvice: string[];
  profile?: PlannerExportProfile;
  routeWarnings: string[];
  unplacedTasks: UnplacedTask[];
}

export interface PlannerExportBundle {
  dailyBriefText: string;
  llmText: string;
  rawText: string;
  source: PlannerExportSource;
}

const routeDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const routeTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const scheduleStatusLabels: Partial<Record<ScheduleBlock["status"], string>> = {
  active: "active",
  deferred: "deferred",
  done: "done",
  expired: "expired",
  skipped: "skipped",
};

const carryForwardReasonLabels: Record<CarryForwardItem["carryForwardReason"], string> =
  {
    manual: "Manual carry forward",
    overflow: "Overflow",
    replan_overflow: "Replan overflow",
    unplaced: "Unplaced work",
  };

const unplacedReasonLabels: Record<UnplacedTask["reason"], string> = {
  did_not_fit_today: "Did not fit today",
  lower_priority_deferred: "Deferred first",
  needs_longer_open_slot: "Needs a longer open slot",
};

export function selectPlannerExportSource({
  currentTime,
  draftScheduleResponse,
  profile,
  replanPreview,
  routeWarnings,
}: {
  currentTime?: string;
  draftScheduleResponse: DraftScheduleResponse | null;
  profile?: PlannerExportProfile;
  replanPreview: ReplanPreview | null;
  routeWarnings?: string[];
}): PlannerExportSource | null {
  if (replanPreview) {
    return createPlannerExportSourceFromReplanPreview(
      replanPreview,
      currentTime,
      profile
    );
  }

  if (draftScheduleResponse) {
    return createPlannerExportSourceFromDraftScheduleResponse(
      draftScheduleResponse,
      routeWarnings,
      currentTime,
      profile
    );
  }

  return null;
}

export function createPlannerExportSourceFromDraftScheduleResponse(
  draftScheduleResponse: DraftScheduleResponse,
  routeWarnings?: string[],
  currentTime?: string,
  profile?: PlannerExportProfile
): PlannerExportSource {
  return {
    kind: "route",
    badgeLabel: "Current route",
    headingLabel: "Current route",
    currentTime,
    dayPlan: draftScheduleResponse.dayPlan,
    carryForwardItems: draftScheduleResponse.carryForwardItems,
    unplacedTasks: draftScheduleResponse.unplacedTasks,
    oracleAdvice: dedupeStrings(draftScheduleResponse.oracleAdvice ?? []),
    profile,
    routeWarnings:
      routeWarnings && routeWarnings.length > 0
        ? dedupeStrings(routeWarnings)
        : derivePlannerExportWarnings({
            carryForwardItems: draftScheduleResponse.carryForwardItems,
            dueWarnings: draftScheduleResponse.dueWarnings,
            validationWarnings: draftScheduleResponse.warnings,
          }),
  };
}

export function createPlannerExportSourceFromReplanPreview(
  replanPreview: ReplanPreview,
  currentTime?: string,
  profile?: PlannerExportProfile
): PlannerExportSource {
  return {
    kind: "replan_preview",
    badgeLabel: "Visible preview",
    headingLabel: "Visible replan preview",
    currentTime,
    dayPlan: replanPreview.dayPlan,
    carryForwardItems: replanPreview.carryForwardItems,
    unplacedTasks: replanPreview.unplacedTasks,
    oracleAdvice: dedupeStrings(replanPreview.oracleAdvice ?? []),
    profile,
    routeWarnings: derivePlannerExportWarnings({
      carryForwardItems: replanPreview.carryForwardItems,
      dueWarnings: replanPreview.dueWarnings,
      validationWarnings: replanPreview.warnings,
    }),
  };
}

export function createPlannerExportBundle(
  source: PlannerExportSource
): PlannerExportBundle {
  const rawText = buildPlannerExportRawText(source);
  const dailyBriefText = buildPlannerExportDailyBrief(source);

  return {
    source,
    dailyBriefText,
    rawText,
    llmText: [
      "Use the following Waykeeper export as the current working plan. Ground your response in this schedule and do not assume details that are not shown here.",
      rawText,
    ].join("\n\n"),
  };
}

export function getPlannerExportText(
  bundle: PlannerExportBundle,
  variant: PlannerExportVariant
) {
  switch (variant) {
    case "daily_brief":
      return bundle.dailyBriefText;
    case "raw_text":
      return bundle.rawText;
    default:
      return bundle.llmText;
  }
}

function buildPlannerExportDailyBrief(source: PlannerExportSource) {
  return [
    `Waykeeper route for ${formatRouteDate(source.dayPlan.date)}`,
    buildDailyShapeSection(source),
    buildNowNextSection(source),
    buildScheduleSection(source.dayPlan),
    buildOracleNoteSection(source.oracleAdvice),
    buildOverflowSection(source),
    buildHowToUseSection(source),
  ].join("\n\n");
}

function buildPlannerExportRawText(source: PlannerExportSource) {
  const sections = [
    buildScheduleSection(source.dayPlan),
    buildSimpleListSection("Warnings", source.routeWarnings),
    buildCarryForwardSection(source.carryForwardItems),
    buildUnplacedSection(source.unplacedTasks),
    buildSimpleListSection("Oracle guidance", source.oracleAdvice),
  ].filter(Boolean);

  return [
    `${source.headingLabel} for ${formatRouteDate(source.dayPlan.date)}`,
    ...sections,
  ].join("\n\n");
}

function buildDailyShapeSection(source: PlannerExportSource) {
  const lines = [
    `- ${source.kind === "replan_preview" ? "Visible replan preview" : "Current route"}`,
    `- Planning window: ${formatBlockRange(
      source.dayPlan.planningWindow.startTime,
      source.dayPlan.planningWindow.endTime
    )}`,
    `- Blocks: ${source.dayPlan.blocks.length}`,
    `- Break rhythm: ${formatBreakCadence(source.dayPlan.breakCadence)} (${source.dayPlan.breakMode})`,
    `- Pace: ${formatPaceMode(source.dayPlan.paceMode)}`,
    buildProfileLine(source.profile),
  ].filter(Boolean);

  return ["Today's shape", ...lines].join("\n");
}

function buildNowNextSection(source: PlannerExportSource) {
  const { currentBlock, nextBlock } = getNowNextBlocks(source);
  const nowLabel = source.currentTime
    ? `Now (${formatRouteTime(source.currentTime)})`
    : "Now";
  const lines = [
    currentBlock
      ? `- ${nowLabel}: ${getSafeBlockTitle(currentBlock)} (${formatBlockRange(
          currentBlock.startTime,
          currentBlock.endTime
        )})`
      : `- ${nowLabel}: Review the route from top to bottom.`,
    nextBlock
      ? `- Next: ${getSafeBlockTitle(nextBlock)} (${formatBlockRange(
          nextBlock.startTime,
          nextBlock.endTime
        )})`
      : "- Next: No later block is currently visible.",
  ];

  return ["Now / Next", ...lines].join("\n");
}

function buildOracleNoteSection(oracleAdvice: string[]) {
  const advice = dedupeStrings(oracleAdvice).slice(0, 2);

  if (advice.length === 0) {
    advice.push(
      "Follow the route as the working plan; tune the remainder when reality changes."
    );
  }

  return ["Oracle note", ...advice.map((note) => `- ${note}`)].join("\n");
}

function buildOverflowSection(source: PlannerExportSource) {
  const lines = [
    ...source.carryForwardItems.map((item) => `- ${buildCarryForwardLine(item)}`),
    ...source.unplacedTasks.map((task) => `- ${buildUnplacedLine(task)}`),
    ...source.routeWarnings.map((warning) => `- ${warning}`),
  ];

  if (lines.length === 0) {
    return "Overflow / carry-forward\n- No overflow is currently carried forward.";
  }

  return ["Overflow / carry-forward", ...dedupeStrings(lines)].join("\n");
}

function buildHowToUseSection(source: PlannerExportSource) {
  const routeLabel =
    source.kind === "replan_preview" ? "previewed route" : "current route";

  return [
    "How to use this",
    `- Use this as the ${routeLabel} for the day.`,
    "- Start with Now / Next, then follow the schedule in order.",
    "- If reality changes, tune the remainder rather than rebuilding by hand.",
  ].join("\n");
}

function buildScheduleSection(dayPlan: DayPlan) {
  const scheduleLines = [...dayPlan.blocks]
    .sort(
      (left, right) =>
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    )
    .map((block) => `- ${buildScheduleLine(block)}`);

  return ["Schedule", ...scheduleLines].join("\n");
}

function buildSimpleListSection(label: string, values: string[]) {
  const lines = dedupeStrings(values);

  if (lines.length === 0) {
    return "";
  }

  return [label, ...lines.map((value) => `- ${value}`)].join("\n");
}

function buildCarryForwardSection(carryForwardItems: CarryForwardItem[]) {
  if (carryForwardItems.length === 0) {
    return "";
  }

  return [
    "Carry forward",
    ...carryForwardItems.map((item) => `- ${buildCarryForwardLine(item)}`),
  ].join("\n");
}

function buildUnplacedSection(unplacedTasks: UnplacedTask[]) {
  if (unplacedTasks.length === 0) {
    return "";
  }

  return [
    "Unplaced today",
    ...unplacedTasks.map((task) => `- ${buildUnplacedLine(task)}`),
  ].join("\n");
}

function buildScheduleLine(block: ScheduleBlock) {
  const annotations = [
    scheduleStatusLabels[block.status],
    block.locked ? "locked anchor" : undefined,
  ].filter(Boolean);
  const annotationSuffix =
    annotations.length > 0 ? ` [${annotations.join(", ")}]` : "";

  return `${formatBlockRange(block.startTime, block.endTime)} | ${getSafeBlockTitle(block)}${annotationSuffix}`;
}

function buildCarryForwardLine(item: CarryForwardItem) {
  const details = [
    `${item.remainingMinutes}m remaining`,
    carryForwardReasonLabels[item.carryForwardReason],
    `From ${item.carriedFromDate}`,
    item.dueAt ? `Due ${formatDueAt(item.dueAt)}` : undefined,
    item.explanation || undefined,
  ].filter(Boolean);

  return [item.title, ...details].join(" | ");
}

function buildUnplacedLine(task: UnplacedTask) {
  return [
    task.title,
    `${task.remainingMinutes}m remaining`,
    unplacedReasonLabels[task.reason],
  ].join(" | ");
}

function getNowNextBlocks(source: PlannerExportSource) {
  const orderedBlocks = getOrderedBlocks(source.dayPlan.blocks);
  const nowMs = source.currentTime ? new Date(source.currentTime).getTime() : NaN;

  if (!Number.isFinite(nowMs)) {
    const activeBlock =
      orderedBlocks.find((block) => block.status === "active") ?? null;

    return {
      currentBlock: activeBlock,
      nextBlock: activeBlock
        ? (orderedBlocks[orderedBlocks.indexOf(activeBlock) + 1] ?? null)
        : (orderedBlocks[0] ?? null),
    };
  }

  const currentBlock =
    orderedBlocks.find((block) => {
      const startMs = new Date(block.startTime).getTime();
      const endMs = new Date(block.endTime).getTime();

      return startMs <= nowMs && endMs > nowMs;
    }) ?? null;
  const nextBlock =
    orderedBlocks.find((block) => new Date(block.startTime).getTime() > nowMs) ??
    null;

  return { currentBlock, nextBlock };
}

function getOrderedBlocks(blocks: ScheduleBlock[]) {
  return [...blocks].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
}

function buildProfileLine(profile: PlannerExportProfile | undefined) {
  if (!profile) {
    return "";
  }

  const profileDetails = [
    profile.name?.trim(),
    profile.journey ? formatProfileJourney(profile.journey) : undefined,
    profile.priorities && profile.priorities.length > 0
      ? `Priorities: ${profile.priorities
          .map(formatProfilePriority)
          .join(", ")}`
      : undefined,
    profile.rhythm ? `Rhythm: ${formatProfileRhythm(profile.rhythm)}` : undefined,
    profile.preference?.trim()
      ? `Style: ${profile.preference.trim()}`
      : undefined,
  ].filter(Boolean);

  return profileDetails.length > 0 ? `- Profile: ${profileDetails.join(" | ")}` : "";
}

function formatBreakCadence(breakCadence: DayPlan["breakCadence"]) {
  switch (breakCadence) {
    case "focus_25":
      return "25m focus / 5m break";
    case "focus_45":
      return "45m focus / 10m break";
    case "focus_90":
      return "90m focus / 15m break";
    default:
      return "50m focus / 10m break";
  }
}

function formatPaceMode(paceMode: DayPlan["paceMode"]) {
  return paceMode === "spread_out" ? "Spread out" : "Finish sooner";
}

function formatProfileJourney(value: string) {
  switch (value) {
    case "deepening":
      return "Deepening";
    case "starting":
      return "Starting out";
    default:
      return "Building";
  }
}

function formatProfilePriority(value: string) {
  const priorityLabels: Record<string, string> = {
    creativity: "Creativity",
    focus: "Focus",
    health: "Health",
    learning: "Learning",
    purpose: "Purpose",
    relationships: "Relationships",
  };

  return priorityLabels[value] ?? value;
}

function formatProfileRhythm(value: string) {
  const rhythmLabels: Record<string, string> = {
    evening_closer: "Evening closer",
    meeting_weave: "Meeting weave",
    morning_focus: "Morning focus",
    steady_builder: "Steady builder",
  };

  return rhythmLabels[value] ?? value;
}

function derivePlannerExportWarnings({
  carryForwardItems,
  dueWarnings,
  validationWarnings,
}: {
  carryForwardItems: CarryForwardItem[];
  dueWarnings: DueWarning[];
  validationWarnings: string[];
}) {
  return dedupeStrings([
    ...(carryForwardItems.length > 0
      ? [
          "Not everything fit inside this planning window, so overflow was carried forward explicitly.",
        ]
      : []),
    ...dueWarnings.map((warning) => warning.message),
    ...validationWarnings,
  ]);
}

function dedupeStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean))) as string[];
}

function formatRouteDate(date: string) {
  const [year, month, day] = date.split("-").map((part) => Number.parseInt(part, 10));
  return routeDateFormatter.format(new Date(year, month - 1, day, 12));
}

function formatRouteTime(dateTime: string) {
  return routeTimeFormatter.format(new Date(dateTime));
}

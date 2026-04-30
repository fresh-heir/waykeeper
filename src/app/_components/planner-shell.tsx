import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { DayTimeline } from "@/app/_components/day-timeline";
import { RouteWaypointList } from "@/app/_components/route-waypoint-list";
import {
  BotanicalGlyph,
  Starcut,
  WaykeeperButton,
  type WaykeeperThemeMode,
} from "@/app/_components/waykeeper-ui";
import { OracleSparkle, WaykeeperMark } from "@/app/_components/waykeeper-brand";
import {
  getPlannerExportText,
  type PlannerExportBundle,
  type PlannerExportVariant,
} from "@/app/_lib/planner/export";
import {
  deriveOracleViewModel,
  formatBlockRange,
  getSafeBlockTitle,
  type OraclePanelPreference,
  type OracleRecentEvent,
} from "@/app/_lib/planner/oracle";
import type {
  PlannerAiFlow,
  PlannerDevEngineSettings,
  PlannerEngineMode,
  PlannerFlowDiagnosticsState,
} from "@/app/_lib/planner/ai/types";
import type { PlannerDevScenario } from "@/app/_lib/planner/dev-scenarios";
import { extractTimeInput } from "@/app/_lib/planner/date-time";
import { deriveDayPlanExecutionSnapshot } from "@/app/_lib/planner/scheduler";
import type {
  CarryForwardItem,
  MockPlannerState,
  ReplanChangeSummary,
  ReplanMode,
  ReplanPreview,
  ScheduleBlock,
  UnplacedTask,
} from "@/app/_lib/planner-types";

interface PlannerShellProps {
  aiDiagnostics: PlannerFlowDiagnosticsState;
  devEngineSettings: PlannerDevEngineSettings;
  devScenarios: PlannerDevScenario[];
  lastAppliedReplanSummary: ReplanChangeSummary | null;
  leftRail: ReactNode;
  onAdjustPlannerTime: (minutes: number) => void;
  onApplyDraftAiRefinementOffer: () => void;
  onApplyReplanPreview: () => void;
  onApplyReplanAiRefinementOffer: () => void;
  onCancelReplanPreview: () => void;
  onDelayBlock: (blockId: string, minutes: number) => void;
  onDismissDraftAiRefinementOffer: () => void;
  onDismissReplanAiRefinementOffer: () => void;
  onGenerateReplanPreview: () => void;
  onKeepWaitingForAi: () => void;
  onLoadAndBuildDevScenario: (scenarioId: string) => void;
  onLoadDevScenario: (scenarioId: string) => void;
  onBackToDaySetup: () => void;
  onMarkBlockComplete: (blockId: string) => void;
  onOracleCloseAdjust: () => void;
  onOracleOpenAdjust: () => void;
  onResetPlannerTime: () => void;
  onResetBlankDay: () => void;
  onSetDevEngineMode: (
    flow: keyof PlannerDevEngineSettings,
    mode: PlannerEngineMode
  ) => void;
  onSelectDevScenario: (scenarioId: string) => void;
  onSelectReplanMode: (mode: ReplanMode) => void;
  onSetPlannerTime: (time: string) => void;
  onSkipBlock: (blockId: string) => void;
  onToggleTaskBlockComplete: (blockId: string) => void;
  onUseLocalNowForAi: () => void;
  oraclePanelPreference: OraclePanelPreference;
  oracleRecentEvent: OracleRecentEvent | null;
  planner: MockPlannerState;
  plannerExportBundle: PlannerExportBundle | null;
  pendingDraftAiRefinementOffer: {
    summaryLines: string[];
  } | null;
  pendingReplanAiRefinementOffer: {
    summaryLines: string[];
  } | null;
  preRouteHardEvents: MockPlannerState["dayPlan"]["hardEvents"];
  replanAiSlowPrompt: {
    canUseLocalNow: boolean;
    message: string;
  } | null;
  replanErrors: string[];
  replanPreview: ReplanPreview | null;
  routeExists: boolean;
  routeCarryForwardItems: CarryForwardItem[];
  routeWarnings: string[];
  routeOracleAdvice: string[];
  routeUnplacedTasks: UnplacedTask[];
  stage: "day_setup" | "interpretation" | "draft_route";
  selectedReplanMode: ReplanMode;
  selectedDevScenarioId: string;
  seededCurrentTime: string;
  showPlannerTimeReset: boolean;
  showDevTools: boolean;
  themeMode: WaykeeperThemeMode;
  onThemeModeChange: (themeMode: WaykeeperThemeMode) => void;
  timelineViewportRequest: {
    reason: "build" | "replan" | "time";
    token: number;
  };
}

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const summaryTypeLabels: Partial<Record<ScheduleBlock["blockType"], string>> = {
  admin: "Admin block",
  appointment: "Locked anchor",
  break: "Break",
  buffer: "Open time",
  chore: "Chore block",
  focus: "Focus block",
  other: "Task block",
  self_care: "Self-care block",
  transition: "Transition",
};

const replanModeOptions: Array<{
  description: string;
  label: string;
  mode: ReplanMode;
}> = [
  {
    mode: "replan_from_now",
    label: "Replan from now",
    description:
      "Rebuild only the unfinished blocks from the current time.",
  },
  {
    mode: "keep_essentials_only",
    label: "Keep essentials only",
    description:
      "Drop optional and lower-priority work before compressing must-do work.",
  },
  {
    mode: "gentler_remainder",
    label: "Gentler remainder",
    description:
      "Add more space and avoid a packed end of day.",
  },
  {
    mode: "use_productive_breaks",
    label: "Use productive breaks",
    description:
      "Allow some brief low-effort work inside break windows while preserving real recovery.",
  },
  {
    mode: "preserve_focus_first",
    label: "Preserve focus first",
    description:
      "Keep the highest-value work first; move lighter work later if needed.",
  },
];

const unplacedReasonLabels: Record<UnplacedTask["reason"], string> = {
  did_not_fit_today: "Did not fit today",
  lower_priority_deferred: "Deferred first",
  needs_longer_open_slot: "Needs a longer open slot",
};
type OracleViewModelData = ReturnType<typeof deriveOracleViewModel>;
type OracleDeckMode = OracleViewModelData["mode"];

const ORACLE_DECK_TRANSITION_MS = 280;
const oracleHeadingLabels: Record<OracleDeckMode, string> = {
  adjust: "Adjust remainder",
  after_action: "What changed",
  now: "Now",
};
const oracleBackdropStyles: Record<
  OracleViewModelData["dayPart"],
  CSSProperties
> = {
  morning: {
    backgroundImage:
      "linear-gradient(180deg, rgba(250, 240, 221, 0.84) 0%, rgba(243, 239, 248, 0.4) 58%, rgba(255, 255, 255, 0.14) 100%)",
  },
  day: {
    backgroundImage:
      "linear-gradient(180deg, rgba(232, 242, 251, 0.82) 0%, rgba(243, 239, 248, 0.36) 58%, rgba(255, 255, 255, 0.12) 100%)",
  },
  evening: {
    backgroundImage:
      "linear-gradient(180deg, rgba(248, 229, 216, 0.82) 0%, rgba(241, 230, 241, 0.38) 58%, rgba(255, 255, 255, 0.12) 100%)",
  },
  night: {
    backgroundImage:
      "linear-gradient(180deg, rgba(224, 229, 244, 0.78) 0%, rgba(235, 229, 244, 0.42) 58%, rgba(255, 255, 255, 0.1) 100%)",
  },
};

export function PlannerShell({
  aiDiagnostics,
  devEngineSettings,
  devScenarios,
  lastAppliedReplanSummary,
  leftRail,
  onAdjustPlannerTime,
  onApplyDraftAiRefinementOffer,
  onApplyReplanPreview,
  onApplyReplanAiRefinementOffer,
  onCancelReplanPreview,
  onDelayBlock,
  onDismissDraftAiRefinementOffer,
  onDismissReplanAiRefinementOffer,
  onGenerateReplanPreview,
  onKeepWaitingForAi,
  onLoadAndBuildDevScenario,
  onLoadDevScenario,
  onBackToDaySetup,
  onMarkBlockComplete,
  onOracleCloseAdjust,
  onOracleOpenAdjust,
  onResetPlannerTime,
  onResetBlankDay,
  onSetDevEngineMode,
  onSelectDevScenario,
  onSelectReplanMode,
  onSetPlannerTime,
  onSkipBlock,
  onToggleTaskBlockComplete,
  onUseLocalNowForAi,
  oraclePanelPreference,
  oracleRecentEvent,
  planner,
  plannerExportBundle,
  pendingDraftAiRefinementOffer,
  pendingReplanAiRefinementOffer,
  preRouteHardEvents,
  replanAiSlowPrompt,
  replanErrors,
  replanPreview,
  routeExists,
  routeCarryForwardItems,
  routeOracleAdvice,
  routeWarnings,
  routeUnplacedTasks,
  stage,
  selectedReplanMode,
  selectedDevScenarioId,
  seededCurrentTime,
  showPlannerTimeReset,
  showDevTools,
  themeMode,
  onThemeModeChange,
  timelineViewportRequest,
}: PlannerShellProps) {
  const { currentTime, dayPlan } = planner;
  const execution = deriveDayPlanExecutionSnapshot(dayPlan, currentTime);
  const oracleViewModel = deriveOracleViewModel({
    currentTime,
    dayPlan,
    execution,
    panelPreference: oraclePanelPreference,
    recentEvent: oracleRecentEvent,
    routeCarryForwardItems,
    routeOracleAdvice,
    routeUnplacedTasks,
    routeWarnings,
  });
  const isLightTheme = themeMode === "light";
  const routePanelClass = isLightTheme
    ? "space-y-4 rounded-[8px] border border-[rgba(14,20,51,0.14)] bg-[rgba(255,252,244,0.94)] p-5 text-[color:var(--wk-ink)] shadow-[0_24px_80px_rgba(2,8,32,0.18)]"
    : "space-y-4 rounded-[8px] border border-[rgba(255,247,214,0.16)] bg-[rgba(3,10,35,0.82)] p-5 shadow-[0_24px_80px_rgba(2,8,32,0.34)]";
  const routeHeaderBorderClass = isLightTheme
    ? "border-b border-[rgba(14,20,51,0.12)]"
    : "border-b border-white/10";
  const routeIntroTextClass = isLightTheme
    ? "text-[color:var(--wk-ink-muted)]"
    : "text-white/68";

  return (
    <main
      className={`waykeeper-app-shell min-h-screen text-stone-900 ${
        isLightTheme ? "waykeeper-theme-light" : "waykeeper-theme-dark"
      }`}
      data-waykeeper-theme={themeMode}
    >
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-2.5 px-4 py-3 sm:px-5 lg:px-6 lg:py-4">
        {showDevTools ? (
          <DeveloperUtilityTray
            aiDiagnostics={aiDiagnostics}
            currentTime={currentTime}
            devEngineSettings={devEngineSettings}
            devScenarios={devScenarios}
            onAdjustPlannerTime={onAdjustPlannerTime}
            onLoadAndBuildDevScenario={onLoadAndBuildDevScenario}
            onLoadDevScenario={onLoadDevScenario}
            onResetPlannerTime={onResetPlannerTime}
            onResetBlankDay={onResetBlankDay}
            onSetDevEngineMode={onSetDevEngineMode}
            onSelectDevScenario={onSelectDevScenario}
            onSetPlannerTime={onSetPlannerTime}
            selectedDevScenarioId={selectedDevScenarioId}
            seededCurrentTime={seededCurrentTime}
            showPlannerTimeReset={showPlannerTimeReset}
          />
        ) : null}

        {routeExists ? (
          <div className="grid gap-4 xl:grid-cols-[9.5rem_minmax(0,1fr)_minmax(22rem,25rem)] xl:items-start">
            <WaykeeperSidebar themeMode={themeMode} />

            <div className={routePanelClass}>
              <div className={`grid gap-3 pb-4 2xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.64fr)] ${routeHeaderBorderClass}`}>
                <div className="flex items-start gap-3">
                  <BotanicalGlyph className="mt-1 h-12 w-9" tone="jade" />
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.26em] text-[color:var(--wk-spectral-cyan)]">
                      Route
                    </p>
                    <p className={`mt-1 text-sm leading-6 ${routeIntroTextClass}`}>
                      Follow the route. Use Oracle when the rest of the day needs adjusting.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <ThemeModeToggle
                    onThemeModeChange={onThemeModeChange}
                    themeMode={themeMode}
                  />
                  {plannerExportBundle ? (
                    <RouteExportPanel exportBundle={plannerExportBundle} />
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <WaykeeperButton
                      className="min-h-10 flex-1 justify-center py-2"
                      onClick={onBackToDaySetup}
                      tone="cream"
                    >
                      Edit day setup
                    </WaykeeperButton>
                    <button
                      className={`rounded-[8px] border px-3 py-2 text-xs font-semibold ${
                        isLightTheme
                          ? "border-[rgba(14,20,51,0.14)] text-[color:var(--wk-ink-muted)]"
                          : "border-white/16 text-white/78"
                      }`}
                      type="button"
                    >
                      View log
                    </button>
                  </div>
                </div>
              </div>
              <RouteWaypointList
                blocks={execution.timelineBlocks}
                currentBlock={execution.currentDisplayBlock}
                currentTime={currentTime}
                nextBlock={execution.nextBlock}
                onToggleTaskBlockComplete={onToggleTaskBlockComplete}
                paceMode={dayPlan.paceMode}
                planningWindow={dayPlan.planningWindow}
                tasks={dayPlan.tasks}
                themeMode={themeMode}
              />
            </div>

            <aside className="order-1 xl:order-2 xl:sticky xl:top-3">
              <OraclePanel
                currentActionableBlock={execution.currentActionableBlock}
                currentDisplayBlock={execution.currentDisplayBlock}
                currentTime={currentTime}
                doneCount={execution.doneBlocks.length}
                lastAppliedReplanSummary={lastAppliedReplanSummary}
                nextBlock={execution.nextBlock}
                onCloseAdjust={onOracleCloseAdjust}
                onDelayBlock={onDelayBlock}
                onGenerateReplanPreview={onGenerateReplanPreview}
                onMarkBlockComplete={onMarkBlockComplete}
                onOpenAdjust={onOracleOpenAdjust}
                onApplyReplanPreview={onApplyReplanPreview}
                onApplyDraftAiRefinementOffer={onApplyDraftAiRefinementOffer}
                onApplyReplanAiRefinementOffer={onApplyReplanAiRefinementOffer}
                onCancelReplanPreview={onCancelReplanPreview}
                onDismissDraftAiRefinementOffer={onDismissDraftAiRefinementOffer}
                onDismissReplanAiRefinementOffer={onDismissReplanAiRefinementOffer}
                onKeepWaitingForAi={onKeepWaitingForAi}
                onSelectReplanMode={onSelectReplanMode}
                onSkipBlock={onSkipBlock}
                onUseLocalNowForAi={onUseLocalNowForAi}
                oracleViewModel={oracleViewModel}
                pendingDraftAiRefinementOffer={pendingDraftAiRefinementOffer}
                pendingReplanAiRefinementOffer={pendingReplanAiRefinementOffer}
                routeCarryForwardItems={routeCarryForwardItems}
                routeUnplacedTasks={routeUnplacedTasks}
                routeWarnings={routeWarnings}
                replanErrors={replanErrors}
                replanAiSlowPrompt={replanAiSlowPrompt}
                replanPreview={replanPreview}
                selectedReplanMode={selectedReplanMode}
                themeMode={themeMode}
              />
            </aside>
          </div>
        ) : stage === "day_setup" ? (
          <div>{leftRail}</div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)] xl:items-start">
            <div>{leftRail}</div>
            <aside className="space-y-2.5 xl:sticky xl:top-3">
              <PreRouteDayView
                dayPlan={dayPlan}
                breakMode={dayPlan.breakMode}
                currentTime={currentTime}
                onToggleTaskBlockComplete={onToggleTaskBlockComplete}
                paceMode={dayPlan.paceMode}
                planningWindow={dayPlan.planningWindow}
                preRouteHardEvents={preRouteHardEvents}
                viewportRequest={timelineViewportRequest}
              />
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function WaykeeperSidebar({ themeMode }: { themeMode: WaykeeperThemeMode }) {
  const navItems = [
    ["Route", "active"],
    ["Oracle", "available"],
    ["Reflections", "disabled"],
    ["Library", "disabled"],
    ["Settings", "disabled"],
  ] as const;
  const isLightTheme = themeMode === "light";

  return (
    <aside
      className={`hidden min-h-[calc(100svh-2rem)] rounded-[8px] border p-4 shadow-[0_24px_70px_rgba(2,8,32,0.16)] xl:flex xl:flex-col ${
        isLightTheme
          ? "border-[rgba(14,20,51,0.14)] bg-[rgba(255,252,244,0.92)] text-[color:var(--wk-ink)]"
          : "border-[rgba(255,247,214,0.14)] bg-[rgba(2,9,31,0.82)] text-white"
      }`}
    >
      <div className="flex items-center gap-3">
        <WaykeeperMark className="size-8" />
        <span className="font-display text-lg tracking-[-0.04em]">Waykeeper</span>
      </div>

      <nav className="mt-10 grid gap-2" aria-label="Waykeeper sections">
        {navItems.map(([label, state], index) => (
          <button
            aria-disabled={state === "disabled" ? true : undefined}
            className={`flex min-h-10 items-center gap-3 rounded-[4px] px-3 text-left text-sm font-medium normal-case tracking-normal transition ${
              state === "active"
                ? isLightTheme
                  ? "bg-[color:var(--wk-cobalt)] text-white"
                  : "bg-[rgba(40,56,228,0.42)] text-white"
                : state === "available"
                  ? isLightTheme
                    ? "text-[color:var(--wk-ink)] hover:bg-[rgba(40,56,228,0.08)]"
                    : "text-white/82 hover:bg-white/8"
                  : isLightTheme
                    ? "cursor-not-allowed text-[rgba(14,20,51,0.34)]"
                    : "cursor-not-allowed text-white/34"
            }`}
            disabled={state === "disabled"}
            key={label}
            type="button"
          >
            <span className="grid size-5 place-items-center">
              {index === 0 ? (
                <span className="h-0.5 w-4 rotate-[-38deg] bg-current" />
              ) : index === 1 ? (
                <Starcut className="size-5" />
              ) : (
                <span className="size-3 rounded-sm border border-current" />
              )}
            </span>
            {label}
          </button>
        ))}
      </nav>

      <div
        className={`mt-auto border-t pt-4 ${
          isLightTheme ? "border-[rgba(14,20,51,0.12)]" : "border-white/12"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full border border-[color:var(--wk-sand)] font-display">
            W
          </span>
          <div>
            <p className="text-sm font-semibold">Today&apos;s route</p>
            <p
              className={`text-xs ${
                isLightTheme ? "text-[color:var(--wk-ink-muted)]" : "text-white/48"
              }`}
            >
              Local plan
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ThemeModeToggle({
  onThemeModeChange,
  themeMode,
}: {
  onThemeModeChange: (themeMode: WaykeeperThemeMode) => void;
  themeMode: WaykeeperThemeMode;
}) {
  return (
    <div
      aria-label="Planner theme"
      className="ml-auto inline-flex w-fit rounded-full border border-[rgba(14,20,51,0.14)] bg-white/72 p-1 shadow-[0_8px_22px_rgba(2,8,32,0.08)]"
      role="group"
    >
      {(["light", "dark"] as const).map((mode) => (
        <button
          aria-pressed={themeMode === mode}
          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] transition ${
            themeMode === mode
              ? "bg-[color:var(--wk-ink)] text-[color:var(--wk-pearl)]"
              : "text-[color:var(--wk-ink-muted)] hover:bg-[rgba(40,56,228,0.08)]"
          }`}
          key={mode}
          onClick={() => onThemeModeChange(mode)}
          type="button"
        >
          {mode === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}

function PreRouteDayView({
  dayPlan,
  breakMode,
  currentTime,
  onToggleTaskBlockComplete,
  paceMode,
  planningWindow,
  preRouteHardEvents,
  viewportRequest,
}: {
  dayPlan: MockPlannerState["dayPlan"];
  breakMode: MockPlannerState["dayPlan"]["breakMode"];
  currentTime: string;
  onToggleTaskBlockComplete: (blockId: string) => void;
  paceMode: MockPlannerState["dayPlan"]["paceMode"];
  planningWindow: MockPlannerState["dayPlan"]["planningWindow"];
  preRouteHardEvents: MockPlannerState["dayPlan"]["hardEvents"];
  viewportRequest: PlannerShellProps["timelineViewportRequest"];
}) {
  const previewExecution = deriveDayPlanExecutionSnapshot(
    {
      ...dayPlan,
      hardEvents: preRouteHardEvents,
      blocks: [],
      breakMode,
      planningWindow,
    },
    currentTime
  );

  return (
    <section className="space-y-2.5">
      <DayTimeline
        blocks={previewExecution.timelineBlocks}
        bounded={false}
        breakMode={breakMode}
        currentDisplayBlock={previewExecution.currentDisplayBlock}
        currentTime={currentTime}
        nextBlock={previewExecution.nextBlock}
        onToggleTaskBlockComplete={onToggleTaskBlockComplete}
        paceMode={paceMode}
        planningWindow={planningWindow}
        tasks={dayPlan.tasks}
        viewportRequest={viewportRequest}
      />
      <div className="rounded-[15px] border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-3.5 shadow-[var(--planner-shadow-card)] backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
          Day view
        </p>
        <p className="mt-1.5 text-[13px] leading-5 text-stone-600">
          Locked anchors preview on the right while you review tasks. Build the
          day plan to place task blocks around them.
        </p>
      </div>
    </section>
  );
}

function DeveloperUtilityTray({
  aiDiagnostics,
  currentTime,
  devEngineSettings,
  devScenarios,
  onAdjustPlannerTime,
  onLoadAndBuildDevScenario,
  onLoadDevScenario,
  onResetPlannerTime,
  onResetBlankDay,
  onSetDevEngineMode,
  onSelectDevScenario,
  onSetPlannerTime,
  selectedDevScenarioId,
  seededCurrentTime,
  showPlannerTimeReset,
}: {
  aiDiagnostics: PlannerFlowDiagnosticsState;
  currentTime: string;
  devEngineSettings: PlannerDevEngineSettings;
  devScenarios: PlannerDevScenario[];
  onAdjustPlannerTime: (minutes: number) => void;
  onLoadAndBuildDevScenario: (scenarioId: string) => void;
  onLoadDevScenario: (scenarioId: string) => void;
  onResetPlannerTime: () => void;
  onResetBlankDay: () => void;
  onSetDevEngineMode: (
    flow: keyof PlannerDevEngineSettings,
    mode: PlannerEngineMode
  ) => void;
  onSelectDevScenario: (scenarioId: string) => void;
  onSetPlannerTime: (time: string) => void;
  selectedDevScenarioId: string;
  seededCurrentTime: string;
  showPlannerTimeReset: boolean;
}) {
  const currentTimeInput = extractTimeInput(currentTime);
  const selectedScenario =
    devScenarios.find((scenario) => scenario.id === selectedDevScenarioId) ??
    devScenarios[0] ??
    null;

  return (
    <details
      aria-label="Developer tools"
      data-testid="developer-tools"
      className="rounded-[12px] border border-dashed border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-3.5 py-2 shadow-[0_10px_30px_rgba(52,68,82,0.04)] [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="list-none cursor-pointer">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">
                Developer tools
              </p>
              <UtilityTag>Testing only</UtilityTag>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-stone-500">
              Scenario loading and local planner-time override stay available
              here without taking the primary scan path.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
            {selectedScenario ? <UtilityTag>{selectedScenario.name}</UtilityTag> : null}
            <UtilityTag>
              Seeded {timeFormatter.format(new Date(seededCurrentTime))}
            </UtilityTag>
            <UtilityTag>
              Viewing {timeFormatter.format(new Date(currentTime))}
            </UtilityTag>
          </div>
        </div>
      </summary>

      <div className="mt-2.5 border-t border-stone-200/80 pt-2.5">
        <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)]">
          <div className="space-y-2.5">
            <div className="rounded-[12px] border border-stone-200/80 bg-[color:var(--planner-surface-card)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  AI flow engines
                </p>
                <UtilityTag>Debug only</UtilityTag>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <FlowModeSelect
                  flow="interpretation"
                  label="Interpretation"
                  mode={devEngineSettings.interpretation}
                  onChange={onSetDevEngineMode}
                />
                <FlowModeSelect
                  flow="draft"
                  label="Draft schedule"
                  mode={devEngineSettings.draft}
                  onChange={onSetDevEngineMode}
                />
                <FlowModeSelect
                  flow="replan"
                  label="Replanning"
                  mode={devEngineSettings.replan}
                  onChange={onSetDevEngineMode}
                />
              </div>
            </div>

            <label className="flex min-w-0 flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
              Scenario
              <select
                value={selectedScenario?.id ?? ""}
                onChange={(event) => onSelectDevScenario(event.currentTarget.value)}
                className="min-h-10 rounded-[10px] border border-stone-300 bg-[color:var(--planner-surface-card)] px-3 text-sm font-medium normal-case tracking-normal text-stone-900 outline-none transition focus:border-stone-500"
              >
                {devScenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => selectedScenario && onLoadDevScenario(selectedScenario.id)}
                disabled={!selectedScenario}
                className="min-h-10 rounded-[10px] border border-stone-300 bg-[color:var(--planner-surface-card)] px-3.5 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-white disabled:cursor-not-allowed disabled:border-[color:var(--planner-disabled-border)] disabled:bg-[color:var(--planner-disabled-surface)] disabled:text-[color:var(--planner-disabled-text)] disabled:opacity-100 disabled:[-webkit-text-fill-color:var(--planner-disabled-text)]"
              >
                Load scenario
              </button>
              <button
                type="button"
                onClick={() =>
                  selectedScenario && onLoadAndBuildDevScenario(selectedScenario.id)
                }
                disabled={!selectedScenario}
                className="min-h-10 rounded-[10px] border border-[color:var(--planner-ink-surface)] bg-[color:var(--planner-ink-surface)] px-3.5 py-2 text-sm font-semibold text-[color:var(--planner-ink-text)] transition hover:bg-[color:var(--planner-ink-surface-strong)] disabled:cursor-not-allowed disabled:border-[color:var(--planner-disabled-border)] disabled:bg-[color:var(--planner-disabled-surface)] disabled:text-[color:var(--planner-disabled-text)] disabled:opacity-100 disabled:[-webkit-text-fill-color:var(--planner-disabled-text)]"
              >
                <span className="text-[color:var(--planner-ink-text)]">
                  Load & build plan
                </span>
              </button>
              <button
                type="button"
                onClick={onResetBlankDay}
                className="min-h-10 rounded-[10px] border border-stone-300 bg-[color:var(--planner-surface-card)] px-3.5 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-white"
              >
                Reset to blank day
              </button>
            </div>

            {selectedScenario ? (
              <div className="rounded-[12px] border border-stone-200/80 bg-stone-50/90 px-3.5 py-2.5 text-[11px] leading-5 text-stone-600">
                <p className="font-semibold uppercase tracking-[0.16em] text-stone-500">
                  {selectedScenario.name}
                </p>
                <p className="mt-1">{selectedScenario.description}</p>
                {selectedScenario.notes?.length ? (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {selectedScenario.notes.map((note, index) => (
                      <p key={`scenario-note-${index}`}>{note}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                Planner time override
              </p>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                Local only
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))]">
              {[
                { label: "-15m", minutes: -15 },
                { label: "+15m", minutes: 15 },
                { label: "+30m", minutes: 30 },
                { label: "+60m", minutes: 60 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onAdjustPlannerTime(preset.minutes)}
                  className="min-h-10 rounded-[10px] border border-stone-300 bg-[color:var(--planner-surface-card)] px-3 py-2 text-sm font-semibold text-stone-800 transition hover:border-stone-400 hover:bg-white"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="flex min-w-0 items-center gap-2 rounded-[10px] border border-stone-300 bg-[color:var(--planner-surface-card)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                <span className="shrink-0">Set time</span>
                <input
                  aria-label="Set time"
                  type="time"
                  step={60}
                  value={currentTimeInput}
                  onChange={(event) => onSetPlannerTime(event.currentTarget.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium normal-case tracking-normal text-stone-900 outline-none"
                />
              </label>
              <button
                type="button"
                onClick={onResetPlannerTime}
                disabled={!showPlannerTimeReset}
                className="min-h-10 rounded-[10px] border border-stone-300 bg-[color:var(--planner-surface-card)] px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-white disabled:cursor-not-allowed disabled:border-[color:var(--planner-disabled-border)] disabled:bg-[color:var(--planner-disabled-surface)] disabled:text-[color:var(--planner-disabled-text)] disabled:opacity-100 disabled:[-webkit-text-fill-color:var(--planner-disabled-text)]"
              >
                Reset
              </button>
            </div>

            {selectedScenario ? (
              <div className="flex flex-wrap gap-2">
                {selectedScenario.covers?.map((cover) => (
                  <UtilityTag key={cover}>{cover}</UtilityTag>
                ))}
                {selectedScenario.currentTime ? (
                  <UtilityTag>
                    Starts at {formatDeveloperTime(selectedScenario.currentTime)}
                  </UtilityTag>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div
          data-testid="planner-ai-diagnostics"
          className="mt-2.5 grid gap-2.5 xl:grid-cols-3"
        >
          <DiagnosticsPanel
            diagnostics={aiDiagnostics.parse}
            title="Interpretation diagnostics"
          />
          <DiagnosticsPanel
            diagnostics={aiDiagnostics.draft}
            title="Draft diagnostics"
          />
          <DiagnosticsPanel
            diagnostics={aiDiagnostics.replan}
            title="Replan diagnostics"
          />
        </div>
      </div>
    </details>
  );
}

function FlowModeSelect({
  flow,
  label,
  mode,
  onChange,
}: {
  flow: keyof PlannerDevEngineSettings;
  label: string;
  mode: PlannerEngineMode;
  onChange: (
    flow: keyof PlannerDevEngineSettings,
    mode: PlannerEngineMode
  ) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
      {label}
      <select
        aria-label={`${label} engine`}
        data-testid={`ai-engine-${flow}`}
        value={mode}
        onChange={(event) =>
          onChange(flow, event.currentTarget.value as PlannerEngineMode)
        }
        className="min-h-10 rounded-[10px] border border-stone-300 bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-900 outline-none transition focus:border-stone-500"
      >
        <option value="local">Local</option>
        <option value="ai">AI</option>
      </select>
    </label>
  );
}

function DiagnosticsPanel({
  diagnostics,
  title,
}: {
  diagnostics: PlannerFlowDiagnosticsState[PlannerAiFlow];
  title: string;
}) {
  return (
    <div className="rounded-[12px] border border-stone-200/80 bg-[color:var(--planner-surface-card)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          {title}
        </p>
        <UtilityTag>{diagnostics?.engine ?? "idle"}</UtilityTag>
      </div>

      {!diagnostics ? (
        <p className="mt-2 text-[12px] leading-5 text-stone-600">
          No diagnostic capture yet for this flow.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {diagnostics.error ? (
            <p className="rounded-[10px] border border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-accent-warning-surface)] px-2.5 py-2 text-[12px] leading-5 text-stone-700">
              {diagnostics.error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {diagnostics.model ? <UtilityTag>{diagnostics.model}</UtilityTag> : null}
            {diagnostics.strategy ? (
              <UtilityTag>{`Parse ${diagnostics.strategy}`}</UtilityTag>
            ) : null}
            {diagnostics.providerOptions?.serviceTier ? (
              <UtilityTag>{`Tier ${diagnostics.providerOptions.serviceTier}`}</UtilityTag>
            ) : null}
            {diagnostics.providerOptions?.reasoningEffort ? (
              <UtilityTag>
                {`Reasoning ${diagnostics.providerOptions.reasoningEffort}`}
              </UtilityTag>
            ) : null}
            {typeof diagnostics.providerOptions?.maxOutputTokens === "number" ? (
              <UtilityTag>
                {`Cap ${diagnostics.providerOptions.maxOutputTokens} out`}
              </UtilityTag>
            ) : null}
            {diagnostics.outputCapHit ? (
              <UtilityTag>Output cap hit</UtilityTag>
            ) : null}
            {diagnostics.providerOptions?.promptCaching ? (
              <UtilityTag>
                {diagnostics.providerOptions.promptCaching.enabled
                  ? "Prompt cache on"
                  : "Prompt cache off"}
              </UtilityTag>
            ) : null}
            {typeof diagnostics.payloadBytes === "number" ? (
              <UtilityTag>{`${diagnostics.payloadBytes} bytes`}</UtilityTag>
            ) : null}
            <UtilityTag>
              {diagnostics.schemaValidation.passed ? "Schema passed" : "Schema failed"}
            </UtilityTag>
            <UtilityTag>{formatDiagnosticsTime(diagnostics.updatedAt)}</UtilityTag>
          </div>

          {diagnostics.fallbackOutcome ? (
            <p className="rounded-[10px] border border-stone-200/80 bg-stone-50/90 px-2.5 py-2 text-[12px] leading-5 text-stone-700">
              {diagnostics.fallbackOutcome}
            </p>
          ) : null}

          {diagnostics.normalizedSummary.length > 0 ? (
            <ul className="space-y-1 text-[12px] leading-5 text-stone-600">
              {diagnostics.normalizedSummary.map((line, index) => (
                <li key={`diagnostics-summary-${index}`}>{line}</li>
              ))}
            </ul>
          ) : null}

          {diagnostics.timings ? (
            <div className="rounded-[10px] border border-stone-200/80 bg-stone-50/90 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                Timings
              </p>
              <ul className="mt-1 space-y-1 text-[12px] leading-5 text-stone-600">
                {typeof diagnostics.timings.endToEndMs === "number" ? (
                  <li>{`End to end ${diagnostics.timings.endToEndMs}ms`}</li>
                ) : null}
                {typeof diagnostics.timings.localScaffoldMs === "number" ? (
                  <li>{`Local scaffold ${diagnostics.timings.localScaffoldMs}ms`}</li>
                ) : null}
                {typeof diagnostics.timings.aiRoundTripMs === "number" ? (
                  <li>{`AI round trip ${diagnostics.timings.aiRoundTripMs}ms`}</li>
                ) : null}
                {typeof diagnostics.timings.mergeValidationMs === "number" ? (
                  <li>{`Merge + validate ${diagnostics.timings.mergeValidationMs}ms`}</li>
                ) : null}
                {diagnostics.timings.requestValidationMs > 0 ? (
                  <li>{`Validate ${diagnostics.timings.requestValidationMs}ms`}</li>
                ) : null}
                {diagnostics.timings.promptBuildMs > 0 ? (
                  <li>{`Prompt ${diagnostics.timings.promptBuildMs}ms`}</li>
                ) : null}
                {diagnostics.timings.openAiFetchMs > 0 ? (
                  <li>{`Fetch ${diagnostics.timings.openAiFetchMs}ms`}</li>
                ) : null}
                {diagnostics.timings.responseDecodeMs > 0 ? (
                  <li>{`Decode ${diagnostics.timings.responseDecodeMs}ms`}</li>
                ) : null}
                {diagnostics.timings.structuredOutputParseMs > 0 ? (
                  <li>{`JSON parse ${diagnostics.timings.structuredOutputParseMs}ms`}</li>
                ) : null}
                {diagnostics.timings.schemaValidationMs > 0 ? (
                  <li>{`Schema ${diagnostics.timings.schemaValidationMs}ms`}</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {diagnostics.tokenUsage ? (
            <div className="rounded-[10px] border border-stone-200/80 bg-stone-50/90 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                Usage
              </p>
              <ul className="mt-1 space-y-1 text-[12px] leading-5 text-stone-600">
                {typeof diagnostics.tokenUsage.inputTokens === "number" ? (
                  <li>{`Input ${diagnostics.tokenUsage.inputTokens}`}</li>
                ) : null}
                {typeof diagnostics.tokenUsage.cachedInputTokens === "number" ? (
                  <li>{`Cached input ${diagnostics.tokenUsage.cachedInputTokens}`}</li>
                ) : null}
                {typeof diagnostics.tokenUsage.uncachedInputTokens === "number" ? (
                  <li>{`Uncached input ${diagnostics.tokenUsage.uncachedInputTokens}`}</li>
                ) : null}
                {typeof diagnostics.tokenUsage.outputTokens === "number" ? (
                  <li>{`Output ${diagnostics.tokenUsage.outputTokens}`}</li>
                ) : null}
                {typeof diagnostics.tokenUsage.reasoningTokens === "number" ? (
                  <li>{`Reasoning ${diagnostics.tokenUsage.reasoningTokens}`}</li>
                ) : null}
                {typeof diagnostics.tokenUsage.totalTokens === "number" ? (
                  <li>{`Total ${diagnostics.tokenUsage.totalTokens}`}</li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {diagnostics.repairNotes.length > 0 ? (
            <div className="rounded-[10px] border border-stone-200/80 bg-stone-50/90 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                Repair notes
              </p>
              <ul className="mt-1 space-y-1 text-[12px] leading-5 text-stone-600">
                {diagnostics.repairNotes.map((note, index) => (
                  <li key={`diagnostics-repair-${index}`}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {diagnostics.schemaValidation.issues.length > 0 ? (
            <div className="rounded-[10px] border border-stone-200/80 bg-stone-50/90 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                Schema issues
              </p>
              <ul className="mt-1 space-y-1 text-[12px] leading-5 text-stone-600">
                {diagnostics.schemaValidation.issues.map((issue, index) => (
                  <li key={`diagnostics-issue-${index}`}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <DiagnosticsJsonPreview label="Request" value={diagnostics.requestPreview} />
          <DiagnosticsJsonPreview label="Response" value={diagnostics.rawResponse} />
        </div>
      )}
    </div>
  );
}

function DiagnosticsJsonPreview({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <details className="rounded-[10px] border border-stone-200/80 bg-stone-50/90 px-2.5 py-2">
      <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
        {label}
      </summary>
      <pre className="mt-2 overflow-auto rounded-[8px] bg-stone-950 px-3 py-2 text-[11px] leading-5 text-stone-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function UtilityTag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-stone-300 bg-stone-50/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
      {children}
    </span>
  );
}

function formatDeveloperTime(time: string) {
  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
  const date = new Date();

  date.setHours(hours, minutes, 0, 0);

  return timeFormatter.format(date);
}

function formatDiagnosticsTime(isoDateTime: string) {
  return timeFormatter.format(new Date(isoDateTime));
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[11px] border border-stone-200/80 bg-stone-100/75 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500">
        {label}
      </p>
      <p className="mt-1 text-[12px] font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  tone,
}: {
  label: string;
  onClick: () => void;
  tone: "ghost" | "primary" | "secondary";
}) {
  const toneClasses =
    tone === "primary"
      ? "border-[color:var(--planner-ink-surface)] bg-[color:var(--planner-ink-surface)] text-[color:var(--planner-ink-text)] hover:bg-[color:var(--planner-ink-surface-strong)]"
      : tone === "secondary"
        ? "border-[color:var(--planner-border)] bg-[color:var(--planner-surface-card)] text-stone-800 hover:border-stone-400 hover:bg-white"
        : "border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] text-stone-800 hover:border-stone-400 hover:bg-[color:var(--planner-surface-card)]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center rounded-[10px] border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition ${toneClasses}`}
    >
      <span
        className={
          tone === "primary"
            ? "text-[color:var(--planner-ink-text)]"
            : "text-stone-800"
        }
      >
        {label}
      </span>
    </button>
  );
}

function RouteExportPanel({
  exportBundle,
}: {
  exportBundle: PlannerExportBundle;
}) {
  const [variant, setVariant] = useState<PlannerExportVariant>("daily_brief");
  const [copyFeedback, setCopyFeedback] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const exportText = getPlannerExportText(exportBundle, variant);

  async function handleCopyExport() {
    setCopyFeedback(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      textAreaRef.current?.focus();
      textAreaRef.current?.select();
      setCopyFeedback({
        tone: "error",
        message:
          "Clipboard was not available. The export text is still here to copy manually.",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(exportText);
      setCopyFeedback({
        tone: "success",
        message: getRouteExportCopyMessage(variant),
      });
    } catch {
      textAreaRef.current?.focus();
      textAreaRef.current?.select();
      setCopyFeedback({
        tone: "error",
        message:
          "Clipboard access failed. The export text is still here to copy manually.",
      });
    }
  }

  return (
    <details
      data-testid="route-export-panel"
      className="rounded-[12px] border border-stone-200/80 bg-[color:var(--planner-surface-card)] p-3 shadow-[0_8px_20px_rgba(52,68,82,0.04)] [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="list-none cursor-pointer">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Share route
            </p>
            <p className="mt-1 text-[12px] leading-5 text-stone-700">
              Copy a readable brief, AI handoff, or raw schedule.
            </p>
          </div>
          <span data-testid="route-export-source-badge">
            <UtilityTag>{exportBundle.source.badgeLabel}</UtilityTag>
          </span>
        </div>
      </summary>

      <div className="mt-3 space-y-3 border-t border-stone-200/80 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            data-testid="route-export-variant-daily-brief"
            type="button"
            aria-pressed={variant === "daily_brief"}
            onClick={() => {
              setCopyFeedback(null);
              setVariant("daily_brief");
            }}
            className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
              variant === "daily_brief"
                ? "border-[color:var(--planner-ink-surface)] bg-[color:var(--planner-ink-surface)] text-[color:var(--planner-ink-text)]"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
            }`}
          >
            Daily brief
          </button>
          <button
            data-testid="route-export-variant-llm"
            type="button"
            aria-pressed={variant === "llm_ready"}
            onClick={() => {
              setCopyFeedback(null);
              setVariant("llm_ready");
            }}
            className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
              variant === "llm_ready"
                ? "border-[color:var(--planner-ink-surface)] bg-[color:var(--planner-ink-surface)] text-[color:var(--planner-ink-text)]"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
            }`}
          >
            LLM-ready
          </button>
          <button
            data-testid="route-export-variant-raw"
            type="button"
            aria-pressed={variant === "raw_text"}
            onClick={() => {
              setCopyFeedback(null);
              setVariant("raw_text");
            }}
            className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
              variant === "raw_text"
                ? "border-[color:var(--planner-ink-surface)] bg-[color:var(--planner-ink-surface)] text-[color:var(--planner-ink-text)]"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
            }`}
          >
            Raw text
          </button>
        </div>

        <label className="block">
          <span className="sr-only">Route export text</span>
          <textarea
            ref={textAreaRef}
            data-testid="route-export-text"
            aria-label="Route export text"
            readOnly
            rows={12}
            spellCheck={false}
            value={exportText}
            className="min-h-[15rem] w-full rounded-[12px] border border-stone-200/80 bg-white px-3 py-2.5 text-[12px] leading-5 text-stone-900 outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            data-testid="route-export-copy"
            type="button"
            onClick={handleCopyExport}
            className="inline-flex items-center justify-center rounded-[10px] border border-[color:var(--planner-ink-surface)] bg-[color:var(--planner-ink-surface)] px-3.5 py-2 text-sm font-semibold text-[color:var(--planner-ink-text)] transition hover:bg-[color:var(--planner-ink-surface-strong)]"
          >
            Copy to clipboard
          </button>
          {copyFeedback ? (
            <p
              data-testid="route-export-feedback"
              className={`text-[12px] leading-5 ${
                copyFeedback.tone === "error"
                  ? "text-amber-900"
                  : "text-stone-700"
              }`}
            >
              {copyFeedback.message}
            </p>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function getRouteExportCopyMessage(variant: PlannerExportVariant) {
  switch (variant) {
    case "daily_brief":
      return "Copied daily brief.";
    case "raw_text":
      return "Copied raw text export.";
    default:
      return "Copied LLM-ready export.";
  }
}

function OraclePanel({
  currentActionableBlock,
  currentDisplayBlock,
  currentTime,
  doneCount,
  lastAppliedReplanSummary,
  nextBlock,
  onApplyDraftAiRefinementOffer,
  onCloseAdjust,
  onDelayBlock,
  onGenerateReplanPreview,
  onMarkBlockComplete,
  onOpenAdjust,
  onApplyReplanPreview,
  onApplyReplanAiRefinementOffer,
  onCancelReplanPreview,
  onDismissDraftAiRefinementOffer,
  onDismissReplanAiRefinementOffer,
  onKeepWaitingForAi,
  onSelectReplanMode,
  onSkipBlock,
  onUseLocalNowForAi,
  oracleViewModel,
  pendingDraftAiRefinementOffer,
  pendingReplanAiRefinementOffer,
  routeCarryForwardItems,
  routeUnplacedTasks,
  routeWarnings,
  replanErrors,
  replanAiSlowPrompt,
  replanPreview,
  selectedReplanMode,
  themeMode,
}: {
  currentActionableBlock: ScheduleBlock | null;
  currentDisplayBlock: ScheduleBlock | null;
  currentTime: string;
  doneCount: number;
  lastAppliedReplanSummary: ReplanChangeSummary | null;
  nextBlock: ScheduleBlock | null;
  onApplyDraftAiRefinementOffer: () => void;
  onCloseAdjust: () => void;
  onDelayBlock: (blockId: string, minutes: number) => void;
  onGenerateReplanPreview: () => void;
  onMarkBlockComplete: (blockId: string) => void;
  onOpenAdjust: () => void;
  onApplyReplanPreview: () => void;
  onApplyReplanAiRefinementOffer: () => void;
  onCancelReplanPreview: () => void;
  onDismissDraftAiRefinementOffer: () => void;
  onDismissReplanAiRefinementOffer: () => void;
  onKeepWaitingForAi: () => void;
  onSelectReplanMode: (mode: ReplanMode) => void;
  onSkipBlock: (blockId: string) => void;
  onUseLocalNowForAi: () => void;
  oracleViewModel: ReturnType<typeof deriveOracleViewModel>;
  pendingDraftAiRefinementOffer: {
    summaryLines: string[];
  } | null;
  pendingReplanAiRefinementOffer: {
    summaryLines: string[];
  } | null;
  routeCarryForwardItems: CarryForwardItem[];
  routeUnplacedTasks: UnplacedTask[];
  routeWarnings: string[];
  replanErrors: string[];
  replanAiSlowPrompt: {
    canUseLocalNow: boolean;
    message: string;
  } | null;
  replanPreview: ReplanPreview | null;
  selectedReplanMode: ReplanMode;
  themeMode: WaykeeperThemeMode;
}) {
  const [lastAfterActionEvent, setLastAfterActionEvent] =
    useState<OracleRecentEvent | null>(oracleViewModel.afterAction);
  const [exitingDeckMode, setExitingDeckMode] = useState<OracleDeckMode | null>(
    null
  );
  const [deckMinHeight, setDeckMinHeight] = useState<number | null>(null);
  const activeDeckRef = useRef<HTMLDivElement | null>(null);
  const exitDeckTimeoutRef = useRef<number | null>(null);
  const lastDeckHeightRef = useRef(0);
  const previousModeRef = useRef<OracleDeckMode>(oracleViewModel.mode);
  const prefersReducedMotion = usePrefersReducedMotion();
  const selectedMode =
    replanModeOptions.find((option) => option.mode === selectedReplanMode) ??
    replanModeOptions[0];
  const showingOpenTime = currentDisplayBlock?.blockType === "buffer";
  const afterActionEvent = oracleViewModel.afterAction ?? lastAfterActionEvent;
  const activeDeckKey = buildOracleDeckTransitionKey({
    afterActionEvent,
    lastAppliedReplanSummary,
    mode: oracleViewModel.mode,
    pendingDraftAiRefinementOffer,
    pendingReplanAiRefinementOffer,
    replanAiSlowPrompt,
    replanPreview,
    selectedReplanMode,
  });
  const isLightTheme = themeMode === "light";

  useEffect(() => {
    if (!oracleViewModel.afterAction) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setLastAfterActionEvent(oracleViewModel.afterAction);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [oracleViewModel.afterAction]);

  useEffect(() => {
    if (!activeDeckRef.current) {
      return;
    }

    lastDeckHeightRef.current = Math.ceil(
      activeDeckRef.current.getBoundingClientRect().height
    );
  });

  useEffect(() => {
    return () => {
      if (exitDeckTimeoutRef.current) {
        window.clearTimeout(exitDeckTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const previousMode = previousModeRef.current;

    if (oracleViewModel.mode === previousMode) {
      return;
    }

    if (exitDeckTimeoutRef.current) {
      window.clearTimeout(exitDeckTimeoutRef.current);
    }

    const frameId = window.requestAnimationFrame(() => {
      setDeckMinHeight(lastDeckHeightRef.current || null);
      setExitingDeckMode(previousMode);
      previousModeRef.current = oracleViewModel.mode;
      exitDeckTimeoutRef.current = window.setTimeout(() => {
        setExitingDeckMode(null);
        setDeckMinHeight(null);
        exitDeckTimeoutRef.current = null;
      }, prefersReducedMotion ? 40 : ORACLE_DECK_TRANSITION_MS);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [oracleViewModel.mode, prefersReducedMotion]);

  return (
    <section
      aria-label="Oracle panel"
      data-testid="oracle-panel"
      data-oracle-day-part={oracleViewModel.dayPart}
      data-oracle-mode={oracleViewModel.mode}
      data-oracle-reduced-motion={prefersReducedMotion ? "true" : "false"}
      className={`waykeeper-panel-glow relative isolate overflow-hidden rounded-[8px] border p-4 text-[color:var(--wk-ink)] shadow-[0_24px_80px_rgba(2,8,32,0.22)] backdrop-blur ${
        isLightTheme
          ? "border-[rgba(14,20,51,0.14)] bg-[rgba(255,252,244,0.94)]"
          : "border-[rgba(255,247,214,0.18)] bg-[rgba(2,9,31,0.88)]"
      }`}
    >
      <OracleAtmosphericBackdrop
        dayPart={oracleViewModel.dayPart}
        themeMode={themeMode}
      />

      <div className="relative flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div
            key={oracleViewModel.mode}
            className="flex items-start gap-2.5 animate-oracle-heading-settle"
          >
            <OracleSparkle className="mt-0.5 size-9 shrink-0 drop-shadow-[0_10px_20px_rgba(255,73,132,0.22)]" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[color:var(--planner-accent-oracle-text)]">
                Oracle
              </p>
              <h2
                data-testid="oracle-mode-heading"
                className={`mt-0.5 text-[1.05rem] font-black tracking-tight ${
                  isLightTheme
                    ? "text-[color:var(--wk-ink)]"
                    : "text-[color:var(--wk-pearl)]"
                }`}
              >
                {oracleHeadingLabels[oracleViewModel.mode]}
              </h2>
            </div>
          </div>
          {oracleViewModel.mode === "adjust" ? (
            <button
              type="button"
              onClick={onCloseAdjust}
              className="rounded-full border border-[color:var(--wk-sand)] bg-[rgba(255,247,214,0.92)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-[color:var(--wk-ink)] transition hover:bg-[color:var(--wk-pearl)]"
            >
              Back to now
            </button>
          ) : (
            <button
              data-testid="replan-trigger"
              type="button"
              onClick={onOpenAdjust}
              className="rounded-full border border-[color:var(--wk-sand)] bg-[rgba(255,247,214,0.92)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-[color:var(--wk-ink)] transition hover:bg-[color:var(--wk-pearl)]"
            >
              Tune remainder
            </button>
          )}
        </div>

        <div
          data-testid="oracle-content-deck"
          data-oracle-active-mode={oracleViewModel.mode}
          className="relative"
          style={deckMinHeight ? { minHeight: `${deckMinHeight}px` } : undefined}
        >
          <div
            key={activeDeckKey}
            ref={activeDeckRef}
            data-testid="oracle-active-deck"
            className="relative z-10 animate-oracle-deck-enter"
          >
            {oracleViewModel.mode === "adjust" ? (
              <OracleAdjustDeck
                afterActionEvent={afterActionEvent}
                currentTime={currentTime}
                lastAppliedReplanSummary={lastAppliedReplanSummary}
                onApplyReplanAiRefinementOffer={onApplyReplanAiRefinementOffer}
                onApplyReplanPreview={onApplyReplanPreview}
                onCancelReplanPreview={onCancelReplanPreview}
                onDismissReplanAiRefinementOffer={onDismissReplanAiRefinementOffer}
                onGenerateReplanPreview={onGenerateReplanPreview}
                onKeepWaitingForAi={onKeepWaitingForAi}
                onSelectReplanMode={onSelectReplanMode}
                onUseLocalNowForAi={onUseLocalNowForAi}
                oracleViewModel={oracleViewModel}
                pendingReplanAiRefinementOffer={pendingReplanAiRefinementOffer}
                replanAiSlowPrompt={replanAiSlowPrompt}
                replanErrors={replanErrors}
                replanPreview={replanPreview}
                routeCarryForwardItems={routeCarryForwardItems}
                routeUnplacedTasks={routeUnplacedTasks}
                routeWarnings={routeWarnings}
                selectedModeDescription={selectedMode.description}
                selectedReplanMode={selectedReplanMode}
              />
            ) : (
              <OraclePresentDeck
                afterActionEvent={
                  oracleViewModel.mode === "after_action" ? afterActionEvent : null
                }
                currentActionableBlock={currentActionableBlock}
                currentDisplayBlock={currentDisplayBlock}
                doneCount={doneCount}
                insightLines={oracleViewModel.insightLines}
                nextBlock={nextBlock}
                onApplyDraftAiRefinementOffer={onApplyDraftAiRefinementOffer}
                onDelayBlock={onDelayBlock}
                onDismissDraftAiRefinementOffer={onDismissDraftAiRefinementOffer}
                onMarkBlockComplete={onMarkBlockComplete}
                onOpenAdjust={onOpenAdjust}
                onSkipBlock={onSkipBlock}
                pendingDraftAiRefinementOffer={pendingDraftAiRefinementOffer}
                showingOpenTime={showingOpenTime}
              />
            )}
          </div>

          {exitingDeckMode ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 animate-oracle-deck-exit"
            >
              {exitingDeckMode === "adjust" ? (
                <OracleAdjustDeck
                  afterActionEvent={afterActionEvent}
                  currentTime={currentTime}
                  lastAppliedReplanSummary={lastAppliedReplanSummary}
                  onApplyReplanAiRefinementOffer={onApplyReplanAiRefinementOffer}
                  onApplyReplanPreview={onApplyReplanPreview}
                  onCancelReplanPreview={onCancelReplanPreview}
                  onDismissReplanAiRefinementOffer={onDismissReplanAiRefinementOffer}
                  onGenerateReplanPreview={onGenerateReplanPreview}
                  onKeepWaitingForAi={onKeepWaitingForAi}
                  onSelectReplanMode={onSelectReplanMode}
                  onUseLocalNowForAi={onUseLocalNowForAi}
                  oracleViewModel={oracleViewModel}
                  pendingReplanAiRefinementOffer={pendingReplanAiRefinementOffer}
                  replanAiSlowPrompt={replanAiSlowPrompt}
                  replanErrors={replanErrors}
                  replanPreview={replanPreview}
                  routeCarryForwardItems={routeCarryForwardItems}
                  routeUnplacedTasks={routeUnplacedTasks}
                  routeWarnings={routeWarnings}
                  selectedModeDescription={selectedMode.description}
                  selectedReplanMode={selectedReplanMode}
                />
              ) : (
                <OraclePresentDeck
                  afterActionEvent={
                    exitingDeckMode === "after_action" ? afterActionEvent : null
                  }
                  currentActionableBlock={currentActionableBlock}
                  currentDisplayBlock={currentDisplayBlock}
                  doneCount={doneCount}
                  insightLines={oracleViewModel.insightLines}
                  nextBlock={nextBlock}
                  onApplyDraftAiRefinementOffer={onApplyDraftAiRefinementOffer}
                  onDelayBlock={onDelayBlock}
                  onDismissDraftAiRefinementOffer={onDismissDraftAiRefinementOffer}
                  onMarkBlockComplete={onMarkBlockComplete}
                  onOpenAdjust={onOpenAdjust}
                  onSkipBlock={onSkipBlock}
                  pendingDraftAiRefinementOffer={pendingDraftAiRefinementOffer}
                  showingOpenTime={showingOpenTime}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function OracleAtmosphericBackdrop({
  dayPart,
  themeMode,
}: {
  dayPart: OracleViewModelData["dayPart"];
  themeMode: WaykeeperThemeMode;
}) {
  const isLightTheme = themeMode === "light";

  return (
    <div
      aria-hidden="true"
      data-testid="oracle-backdrop"
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
    >
      <div
        className={`absolute inset-0 rounded-[inherit] transition-opacity duration-500 ${
          isLightTheme ? "opacity-45" : "opacity-95"
        }`}
        style={oracleBackdropStyles[dayPart]}
      />
      <div
        className={`absolute inset-0 rounded-[inherit] ${
          isLightTheme
            ? "bg-[radial-gradient(circle_at_72%_8%,rgba(255,73,132,0.12),transparent_14rem),radial-gradient(circle_at_18%_18%,rgba(75,224,202,0.18),transparent_16rem),linear-gradient(180deg,rgba(255,252,244,0.58),rgba(255,255,255,0.12))] opacity-75"
            : "bg-[radial-gradient(circle_at_70%_6%,rgba(255,73,132,0.34),transparent_18rem),radial-gradient(circle_at_18%_18%,rgba(75,224,202,0.24),transparent_16rem),linear-gradient(180deg,rgba(2,9,31,0.18),rgba(2,9,31,0.78))] opacity-90"
        }`}
      />
      <div
        className={`absolute inset-0 rounded-[inherit] [background-image:radial-gradient(circle,rgba(255,247,214,0.7)_0_1px,transparent_1px)] [background-size:18px_18px] ${
          isLightTheme ? "opacity-10" : "opacity-20"
        }`}
      />
      <div
        className={`absolute inset-0 rounded-[inherit] border ${
          isLightTheme ? "border-[rgba(14,20,51,0.08)]" : "border-white/20"
        }`}
      />
    </div>
  );
}

function OraclePresentDeck({
  afterActionEvent,
  currentActionableBlock,
  currentDisplayBlock,
  doneCount,
  insightLines,
  nextBlock,
  onApplyDraftAiRefinementOffer,
  onDelayBlock,
  onDismissDraftAiRefinementOffer,
  onMarkBlockComplete,
  onOpenAdjust,
  onSkipBlock,
  pendingDraftAiRefinementOffer,
  showingOpenTime,
}: {
  afterActionEvent: OracleRecentEvent | null;
  currentActionableBlock: ScheduleBlock | null;
  currentDisplayBlock: ScheduleBlock | null;
  doneCount: number;
  insightLines: string[];
  nextBlock: ScheduleBlock | null;
  onApplyDraftAiRefinementOffer: () => void;
  onDelayBlock: (blockId: string, minutes: number) => void;
  onDismissDraftAiRefinementOffer: () => void;
  onMarkBlockComplete: (blockId: string) => void;
  onOpenAdjust: () => void;
  onSkipBlock: (blockId: string) => void;
  pendingDraftAiRefinementOffer: {
    summaryLines: string[];
  } | null;
  showingOpenTime: boolean;
}) {
  return (
    <div className="space-y-3">
      {pendingDraftAiRefinementOffer ? (
        <AiRefinementOfferCard
          actionLabel="Apply refined route"
          className="animate-oracle-reveal"
          dataTestId="oracle-draft-ai-refinement-offer"
          onApply={onApplyDraftAiRefinementOffer}
          onDismiss={onDismissDraftAiRefinementOffer}
          summaryLines={pendingDraftAiRefinementOffer.summaryLines}
          title="Upon further review"
        />
      ) : null}

      {afterActionEvent ? (
        <OracleAfterActionCard afterActionEvent={afterActionEvent} />
      ) : null}

      <NowModeSummary
        currentActionableBlock={currentActionableBlock}
        currentDisplayBlock={currentDisplayBlock}
        doneCount={doneCount}
        insightLines={insightLines}
        nextBlock={nextBlock}
        onDelayBlock={onDelayBlock}
        onMarkBlockComplete={onMarkBlockComplete}
        onOpenAdjust={onOpenAdjust}
        onSkipBlock={onSkipBlock}
        showingOpenTime={showingOpenTime}
      />
    </div>
  );
}

function OracleAdjustDeck({
  afterActionEvent,
  currentTime,
  lastAppliedReplanSummary,
  onApplyReplanAiRefinementOffer,
  onApplyReplanPreview,
  onCancelReplanPreview,
  onDismissReplanAiRefinementOffer,
  onGenerateReplanPreview,
  onKeepWaitingForAi,
  onSelectReplanMode,
  onUseLocalNowForAi,
  oracleViewModel,
  pendingReplanAiRefinementOffer,
  replanAiSlowPrompt,
  replanErrors,
  replanPreview,
  routeCarryForwardItems,
  routeUnplacedTasks,
  routeWarnings,
  selectedModeDescription,
  selectedReplanMode,
}: {
  afterActionEvent: OracleRecentEvent | null;
  currentTime: string;
  lastAppliedReplanSummary: ReplanChangeSummary | null;
  onApplyReplanAiRefinementOffer: () => void;
  onApplyReplanPreview: () => void;
  onCancelReplanPreview: () => void;
  onDismissReplanAiRefinementOffer: () => void;
  onGenerateReplanPreview: () => void;
  onKeepWaitingForAi: () => void;
  onSelectReplanMode: (mode: ReplanMode) => void;
  onUseLocalNowForAi: () => void;
  oracleViewModel: OracleViewModelData;
  pendingReplanAiRefinementOffer: {
    summaryLines: string[];
  } | null;
  replanAiSlowPrompt: {
    canUseLocalNow: boolean;
    message: string;
  } | null;
  replanErrors: string[];
  replanPreview: ReplanPreview | null;
  routeCarryForwardItems: CarryForwardItem[];
  routeUnplacedTasks: UnplacedTask[];
  routeWarnings: string[];
  selectedModeDescription: string;
  selectedReplanMode: ReplanMode;
}) {
  return (
    <div className="space-y-3">
      {afterActionEvent ? (
        <OracleAfterActionCard afterActionEvent={afterActionEvent} />
      ) : null}

      <div
        className="grid gap-1.5 sm:grid-cols-3 animate-oracle-reveal"
        style={getRevealDelayStyle(20)}
      >
        <CompactMetric
          label="Boundary"
          value={timeFormatter.format(new Date(currentTime))}
        />
        <CompactMetric
          label="Locked ahead"
          value={`${oracleViewModel.adjust.futureLockedCount} anchors`}
        />
        <CompactMetric
          label="Flexible ahead"
          value={`${oracleViewModel.adjust.remainingFlexibleCount} blocks`}
        />
      </div>

      {lastAppliedReplanSummary ? (
        <div
          className="rounded-[12px] border border-[color:var(--planner-accent-positive-border)] bg-[color:var(--planner-accent-positive-surface)] px-3 py-2.5 text-[13px] leading-5 text-[color:var(--planner-accent-positive-strong)] animate-oracle-reveal"
          style={getRevealDelayStyle(50)}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--planner-accent-positive-text)]">
            Last applied
          </p>
          <p className="mt-1">{lastAppliedReplanSummary.summaryLines[0]}</p>
        </div>
      ) : null}

      {pendingReplanAiRefinementOffer ? (
        <AiRefinementOfferCard
          actionLabel="Use AI option"
          className="animate-oracle-reveal"
          dataTestId="oracle-replan-ai-refinement-offer"
          onApply={onApplyReplanAiRefinementOffer}
          onDismiss={onDismissReplanAiRefinementOffer}
          summaryLines={pendingReplanAiRefinementOffer.summaryLines}
          title="Upon further review"
        />
      ) : null}

      {replanAiSlowPrompt ? (
        <div
          aria-live="polite"
          data-testid="ai-slow-prompt"
          className="rounded-[12px] border border-[color:var(--planner-accent-oracle-border)] bg-[color:var(--planner-accent-oracle-surface-strong)] p-3 animate-oracle-reveal"
          style={getRevealDelayStyle(75)}
        >
          <p className="text-[13px] leading-5 text-[color:var(--planner-accent-oracle-strong)]">
            {replanAiSlowPrompt.message}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onKeepWaitingForAi}
              className="inline-flex items-center justify-center rounded-[10px] border border-[color:var(--planner-accent-oracle-border)] bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
            >
              Keep waiting
            </button>
            {replanAiSlowPrompt.canUseLocalNow ? (
              <button
                type="button"
                onClick={onUseLocalNowForAi}
                className="inline-flex items-center justify-center rounded-[10px] border border-[color:var(--planner-accent-oracle-border)] bg-[color:var(--planner-accent-oracle-surface)] px-3 py-2 text-sm font-semibold text-[color:var(--planner-accent-oracle-strong)] transition hover:bg-white"
              >
                Use local now
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className="grid gap-2 sm:grid-cols-2 animate-oracle-reveal"
        style={getRevealDelayStyle(95)}
      >
        {oracleViewModel.adjust.slackLabel ? (
          <Metric compact label="Slack" value={oracleViewModel.adjust.slackLabel} />
        ) : null}
        {oracleViewModel.adjust.fragmentationLabel ? (
          <Metric
            compact
            label="Fragmentation"
            value={oracleViewModel.adjust.fragmentationLabel}
          />
        ) : null}
        {oracleViewModel.adjust.overloadLabel ? (
          <Metric compact label="Overload" value={oracleViewModel.adjust.overloadLabel} />
        ) : null}
        {oracleViewModel.adjust.casualtyLabel ? (
          <Metric
            compact
            label="Likely first casualty"
            value={oracleViewModel.adjust.casualtyLabel}
          />
        ) : null}
      </div>

      <label
        className="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--planner-accent-oracle-text)] animate-oracle-reveal"
        style={getRevealDelayStyle(120)}
      >
        Replan mode
        <select
          value={selectedReplanMode}
          onChange={(event) =>
            onSelectReplanMode(event.currentTarget.value as ReplanMode)
          }
          className="min-h-10 rounded-[10px] border border-[color:var(--planner-accent-oracle-border)] bg-white px-3 text-sm font-medium normal-case tracking-normal text-stone-900 outline-none transition focus:border-stone-500"
        >
          {replanModeOptions.map((option) => (
            <option key={option.mode} value={option.mode}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <p
        className="text-[13px] leading-5 text-[color:var(--planner-accent-oracle-strong)]/85 animate-oracle-reveal"
        style={getRevealDelayStyle(140)}
      >
        {selectedModeDescription}
      </p>

      {replanPreview ? (
        <div
          className="space-y-3 rounded-[15px] border border-[color:var(--planner-accent-oracle-border)] bg-[color:var(--planner-accent-oracle-surface-strong)] p-3.5 animate-oracle-reveal"
          style={getRevealDelayStyle(165)}
        >
          <div className="grid grid-cols-2 gap-2">
            <Metric
              compact
              label="History kept"
              testId="replan-metric-history-kept"
              value={`${replanPreview.summary.preservedHistoryCount} blocks`}
            />
            <Metric
              compact
              label="Locked ahead"
              testId="replan-metric-locked-ahead"
              value={`${replanPreview.summary.preservedAnchorCount} anchors`}
            />
            <Metric
              compact
              label="Revised ahead"
              testId="replan-metric-revised-ahead"
              value={`${replanPreview.summary.revisedBlockCount} blocks`}
            />
            <Metric
              compact
              label="Carried forward"
              testId="replan-metric-stayed-out"
              value={`${replanPreview.summary.stayedOutTaskCount} tasks`}
            />
          </div>

          <div className="space-y-2">
            {replanPreview.summary.summaryLines.map((line) => (
              <p
                key={line}
                className="rounded-[10px] border border-[color:var(--planner-accent-oracle-border)] bg-white px-3 py-2 text-[13px] leading-5 text-stone-700"
              >
                {line}
              </p>
            ))}
          </div>

          {replanPreview.carryForwardItems.length > 0 ? (
            <div
              data-testid="replan-stayed-out-list"
              className="rounded-[12px] border border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-accent-warning-surface)] p-3.5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--planner-accent-warning-text)]">
                Carried forward from revised route
              </p>
              <ul className="mt-3 space-y-2">
                {replanPreview.carryForwardItems.map((carryForwardItem) => (
                  <CarryForwardSummaryCard
                    key={carryForwardItem.id}
                    carryForwardItem={carryForwardItem}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {replanPreview.warnings.length > 0 || replanErrors.length > 0 ? (
            <div className="space-y-2">
              {[...replanPreview.warnings, ...replanErrors].map((warning, index) => (
                <p
                  key={`${index}-${warning}`}
                  className="rounded-[10px] border border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-accent-warning-surface)] px-3 py-2 text-[13px] leading-5 text-[color:var(--planner-accent-warning-strong)]"
                >
                  {warning}
                </p>
              ))}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton
              label="Apply revised plan"
              onClick={onApplyReplanPreview}
              tone="primary"
            />
            <ActionButton
              label="Cancel"
              onClick={onCancelReplanPreview}
              tone="secondary"
            />
          </div>
        </div>
      ) : (
        <>
          {(routeWarnings.length > 0 || replanErrors.length > 0) && (
            <div
              className="space-y-2 animate-oracle-reveal"
              style={getRevealDelayStyle(165)}
            >
              {[...routeWarnings, ...replanErrors].slice(0, 3).map((warning, index) => (
                <p
                  key={`${index}-${warning}`}
                  className="rounded-[10px] border border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-accent-warning-surface)] px-3 py-2 text-[13px] leading-5 text-[color:var(--planner-accent-warning-strong)]"
                >
                  {warning}
                </p>
              ))}
            </div>
          )}

          {(routeCarryForwardItems.length > 0 || routeUnplacedTasks.length > 0) && (
            <div
              className="rounded-[12px] border border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-accent-warning-surface)] p-3 animate-oracle-reveal"
              style={getRevealDelayStyle(185)}
            >
              <div className="grid grid-cols-2 gap-2">
                <CompactMetric
                  label="Carried forward"
                  value={`${routeCarryForwardItems.length} tasks`}
                />
                <CompactMetric
                  label="Unplaced today"
                  value={`${routeUnplacedTasks.length} tasks`}
                />
              </div>
            </div>
          )}

          <div
            className="animate-oracle-reveal"
            style={getRevealDelayStyle(205)}
          >
            <ActionButton
              label="Generate revised plan"
              onClick={onGenerateReplanPreview}
              tone="primary"
            />
          </div>
        </>
      )}
    </div>
  );
}

function OracleAfterActionCard({
  afterActionEvent,
}: {
  afterActionEvent: OracleRecentEvent;
}) {
  return (
    <div
      data-testid="oracle-after-action-card"
      data-oracle-event-id={afterActionEvent.eventId}
      className="rounded-[14px] border border-[color:var(--planner-accent-positive-border)] bg-[color:var(--planner-accent-positive-surface)] px-3.5 py-3 text-[color:var(--planner-accent-positive-strong)] shadow-[0_14px_28px_rgba(75,94,76,0.08)] animate-oracle-foreground"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--planner-accent-positive-text)]">
        {afterActionEvent.title}
      </p>
      <div className="mt-2 space-y-2">
        {afterActionEvent.summaryLines.map((line) => (
          <p key={line} className="text-[13px] leading-5">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function AiRefinementOfferCard({
  actionLabel,
  className,
  dataTestId,
  onApply,
  onDismiss,
  style,
  summaryLines,
  title,
}: {
  actionLabel: string;
  className?: string;
  dataTestId: string;
  onApply: () => void;
  onDismiss: () => void;
  style?: CSSProperties;
  summaryLines: string[];
  title: string;
}) {
  return (
    <div
      data-testid={dataTestId}
      className={`rounded-[14px] border border-[color:var(--planner-accent-oracle-border)] bg-white/85 px-3.5 py-3 shadow-[0_10px_24px_rgba(70,80,98,0.05)] ${className ?? ""}`}
      style={style}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--planner-accent-oracle-text)]">
        {title}
      </p>
      <div className="mt-2 space-y-2">
        {summaryLines.map((line) => (
          <p
            key={line}
            className="text-[13px] leading-5 text-[color:var(--planner-accent-oracle-strong)]"
          >
            {line}
          </p>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ActionButton label={actionLabel} onClick={onApply} tone="primary" />
        <ActionButton label="Keep current" onClick={onDismiss} tone="secondary" />
      </div>
    </div>
  );
}

function NowModeSummary({
  currentActionableBlock,
  currentDisplayBlock,
  doneCount,
  insightLines,
  nextBlock,
  onDelayBlock,
  onMarkBlockComplete,
  onOpenAdjust,
  onSkipBlock,
  showingOpenTime,
}: {
  currentActionableBlock: ScheduleBlock | null;
  currentDisplayBlock: ScheduleBlock | null;
  doneCount: number;
  insightLines: string[];
  nextBlock: ScheduleBlock | null;
  onDelayBlock: (blockId: string, minutes: number) => void;
  onMarkBlockComplete: (blockId: string) => void;
  onOpenAdjust: () => void;
  onSkipBlock: (blockId: string) => void;
  showingOpenTime: boolean;
}) {
  return (
    <div className="space-y-3">
      <div
        data-testid="current-card"
        className="rounded-[13px] border border-[color:var(--planner-accent-active-border)] bg-[color:var(--planner-accent-active-surface)] p-2.5 text-[color:var(--planner-accent-active-strong)] shadow-[0_8px_20px_rgba(59,78,94,0.05)] animate-oracle-reveal"
        style={getRevealDelayStyle(20)}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--planner-accent-active-text)]">
          {showingOpenTime ? "Open time" : "Current block"}
        </p>
        {currentDisplayBlock ? (
          <>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <h3 className="text-[14px] font-semibold tracking-tight">
                {getSafeBlockTitle(currentDisplayBlock)}
              </h3>
              {!showingOpenTime ? (
                <span className="rounded-full border border-[color:var(--planner-accent-active-border)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[color:var(--planner-accent-active-text)]">
                  {summaryTypeLabels[currentDisplayBlock.blockType] ?? "Block"}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--planner-accent-active-text)]">
              {formatBlockRange(
                currentDisplayBlock.startTime,
                currentDisplayBlock.endTime
              )}
            </p>
            <p className="mt-1.5 text-[12px] leading-5 text-[color:var(--planner-accent-active-strong)]/90">
              {getCurrentStateDescription(currentDisplayBlock, nextBlock)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[13px] leading-5 text-[color:var(--planner-accent-active-strong)]/80">
            The planner is between scheduled blocks right now.
          </p>
        )}
      </div>

      <div
        data-testid="next-card"
        className="rounded-[13px] border border-[color:var(--planner-accent-oracle-border)] bg-[color:var(--planner-accent-oracle-surface-strong)] p-2.5 shadow-[0_6px_18px_rgba(70,80,98,0.04)] animate-oracle-reveal"
        style={getRevealDelayStyle(55)}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--planner-accent-oracle-text)]">
          Next
        </p>
        {nextBlock ? (
          <>
            <h3 className="mt-1 text-[14px] font-semibold tracking-tight text-[color:var(--planner-accent-oracle-strong)]">
              {getSafeBlockTitle(nextBlock)}
            </h3>
            <p className="mt-1 text-[12px] text-[color:var(--planner-accent-oracle-strong)]/75">
              {formatBlockRange(nextBlock.startTime, nextBlock.endTime)}
            </p>
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--planner-accent-oracle-text)]">
              {summaryTypeLabels[nextBlock.blockType] ?? "Block"}
            </p>
          </>
        ) : (
          <p className="mt-2.5 text-[13px] leading-5 text-[color:var(--planner-accent-oracle-strong)]/75">
            Nothing else is scheduled yet.
          </p>
        )}
      </div>

      <div
        className="rounded-[13px] border border-[color:var(--planner-accent-oracle-border)] bg-[color:var(--planner-accent-oracle-surface-strong)] p-2.5 shadow-[0_6px_18px_rgba(70,80,98,0.04)] animate-oracle-reveal"
        style={getRevealDelayStyle(90)}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--planner-accent-oracle-text)]">
          Actions
        </p>
        {currentActionableBlock ? (
          <>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <ActionButton
                label="Mark complete"
                onClick={() => onMarkBlockComplete(currentActionableBlock.id)}
                tone="primary"
              />
              <ActionButton
                label="Skip"
                onClick={() => onSkipBlock(currentActionableBlock.id)}
                tone="secondary"
              />
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1">
              {[10, 15, 30].map((minutes) => (
                <ActionButton
                  key={minutes}
                  label={`Delay ${minutes}m`}
                  onClick={() => onDelayBlock(currentActionableBlock.id, minutes)}
                  tone="ghost"
                />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2.5 text-[13px] leading-5 text-[color:var(--planner-accent-oracle-strong)]/75">
            Live actions appear when the current block is flexible and active.
          </p>
        )}
        <div className="mt-2">
          <ActionButton
            label="Replan / tune remainder"
            onClick={onOpenAdjust}
            tone="secondary"
          />
        </div>
      </div>

      <div
        className="rounded-[14px] border border-[color:var(--planner-accent-oracle-border)] bg-[color:var(--planner-accent-oracle-surface-strong)] p-3 animate-oracle-reveal"
        style={getRevealDelayStyle(125)}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--planner-accent-oracle-text)]">
          Route notes
        </p>
        <div className="mt-2 space-y-2">
          {insightLines.map((item, index) => (
            <p
              key={`oracle-insight-${index}-${item.slice(0, 24)}`}
              className="rounded-[10px] border border-[color:var(--planner-accent-oracle-border)] bg-white px-3 py-2 text-[13px] leading-5 text-stone-700"
            >
              {item}
            </p>
          ))}
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-1.5 animate-oracle-reveal"
        style={getRevealDelayStyle(160)}
      >
        <CompactMetric label="Done today" value={`${doneCount} blocks`} />
        <CompactMetric
          label="Still ahead"
          value={nextBlock ? "1+ visible" : "No next block"}
        />
      </div>
    </div>
  );
}

function buildOracleDeckTransitionKey({
  afterActionEvent,
  lastAppliedReplanSummary,
  mode,
  pendingDraftAiRefinementOffer,
  pendingReplanAiRefinementOffer,
  replanAiSlowPrompt,
  replanPreview,
  selectedReplanMode,
}: {
  afterActionEvent: OracleRecentEvent | null;
  lastAppliedReplanSummary: ReplanChangeSummary | null;
  mode: OracleDeckMode;
  pendingDraftAiRefinementOffer: {
    summaryLines: string[];
  } | null;
  pendingReplanAiRefinementOffer: {
    summaryLines: string[];
  } | null;
  replanAiSlowPrompt: {
    canUseLocalNow: boolean;
    message: string;
  } | null;
  replanPreview: ReplanPreview | null;
  selectedReplanMode: ReplanMode;
}) {
  if (mode === "after_action") {
    return `${mode}::${afterActionEvent?.eventId ?? "steady"}`;
  }

  if (mode === "adjust") {
    return [
      mode,
      afterActionEvent?.eventId ?? "no-adjust-event",
      selectedReplanMode,
      lastAppliedReplanSummary?.summaryLines.join("|") ?? "no-last-applied",
      pendingReplanAiRefinementOffer?.summaryLines.join("|") ?? "no-replan-offer",
      replanPreview?.summary.summaryLines.join("|") ?? "no-preview",
      replanAiSlowPrompt?.message ?? "no-slow-prompt",
    ].join("::");
  }

  return [
    mode,
    pendingDraftAiRefinementOffer?.summaryLines.join("|") ?? "no-draft-offer",
  ].join("::");
}

function getRevealDelayStyle(delayMs: number): CSSProperties {
  return {
    animationDelay: `${delayMs}ms`,
  };
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQueryList = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQueryList.matches);
    };

    updatePreference();

    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", updatePreference);

      return () => {
        mediaQueryList.removeEventListener("change", updatePreference);
      };
    }

    mediaQueryList.addListener(updatePreference);

    return () => {
      mediaQueryList.removeListener(updatePreference);
    };
  }, []);

  return prefersReducedMotion;
}

function Metric({
  compact = false,
  hoverContent,
  label,
  testId,
  value,
}: {
  compact?: boolean;
  hoverContent?: ReactNode;
  label: string;
  testId?: string;
  value: string;
}) {
  return (
    <div
      aria-label={hoverContent ? `${label} details available on hover` : label}
      data-testid={testId}
      className={
        compact
          ? "group relative rounded-[12px] border border-stone-200/80 bg-[color:var(--planner-surface-card)] p-3"
          : "group relative min-w-[10.5rem] rounded-[12px] border border-stone-200/80 bg-[color:var(--planner-surface-card)] p-3"
      }
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500">
        {label}
      </p>
      <p className="mt-1.5 text-[13px] font-semibold text-stone-900">{value}</p>
      {hoverContent ? (
        <div className="pointer-events-none absolute left-0 top-full z-30 hidden w-[15rem] pt-2 group-hover:block group-focus-within:block">
          <div className="rounded-[12px] border border-stone-200/90 bg-[color:var(--planner-surface-card)] px-3 py-3 shadow-[0_16px_40px_rgba(52,68,82,0.14)]">
            {hoverContent}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CarryForwardSummaryCard({
  carryForwardItem,
}: {
  carryForwardItem: CarryForwardItem;
}) {
  const isLate = carryForwardItem.dueWarningKinds.includes("carried_forward_late");

  return (
    <li
      className={`rounded-[10px] border px-3 py-2 ${
        isLate
          ? "border-[color:var(--planner-accent-danger-border)] bg-[color:var(--planner-accent-danger-surface)]"
          : "border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-surface-card)]"
      }`}
    >
      <p className="text-[13px] font-semibold text-stone-900">
        {carryForwardItem.title}
      </p>
      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-500">
        {unplacedReasonLabels[carryForwardItem.unplacedReason]}
      </p>
      <p className="mt-1.5 text-xs leading-5 text-stone-600">
        {carryForwardItem.explanation}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-stone-600">
        <CarryForwardPill>{carryForwardItem.remainingMinutes}m left</CarryForwardPill>
        {carryForwardItem.dueAt ? (
          <CarryForwardPill tone={isLate ? "danger" : "default"}>
            Due {formatDueAt(carryForwardItem.dueAt)}
          </CarryForwardPill>
        ) : null}
        {carryForwardItem.deferCount > 0 ? (
          <CarryForwardPill>Deferred {carryForwardItem.deferCount}x</CarryForwardPill>
        ) : null}
      </div>
      {isLate ? (
        <p className="mt-2 text-xs leading-5 text-[color:var(--planner-accent-danger-strong)]">
          Carrying this past today would land after its due point.
        </p>
      ) : null}
    </li>
  );
}

function CarryForwardPill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <span
      className={`rounded-[8px] border px-2 py-0.5 ${
        tone === "warning"
          ? "border-[color:var(--planner-accent-warning-border)] bg-[color:var(--planner-accent-warning-surface)] text-[color:var(--planner-accent-warning-strong)]"
          : tone === "danger"
            ? "border-[color:var(--planner-accent-danger-border)] bg-[color:var(--planner-accent-danger-surface)] text-[color:var(--planner-accent-danger-strong)]"
            : "border-stone-200 bg-stone-50"
      }`}
    >
      {children}
    </span>
  );
}

function getCurrentStateDescription(
  currentDisplayBlock: ScheduleBlock,
  nextBlock: ScheduleBlock | null
) {
  if (currentDisplayBlock.blockType === "buffer") {
    const nextLabel = nextBlock
      ? `Next up is ${getSafeBlockTitle(nextBlock)} at ${timeFormatter.format(
          new Date(nextBlock.startTime)
        )}.`
      : "There is nothing else scheduled in this route yet.";

    return `${currentDisplayBlock.notes ?? "No scheduled block in this window."} ${nextLabel}`;
  }

  if (currentDisplayBlock.locked) {
    return "This anchor stays fixed while the rest of the route adapts around it.";
  }

  return "This is the live block the planner expects you to be inside right now.";
}

function formatDueAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import {
  Waymark,
  type WaykeeperThemeMode,
} from "@/app/_components/waykeeper-ui";
import { getSafeBlockTitle } from "@/app/_lib/planner/oracle";
import { createBlockCountdownSnapshot } from "@/app/_lib/planner/timer";
import type {
  MockPlannerState,
  PaceMode,
  PlanningWindow,
  ScheduleBlock,
} from "@/app/_lib/planner-types";

interface RouteWaypointListProps {
  blocks: ScheduleBlock[];
  currentBlock: ScheduleBlock | null;
  currentTime: string;
  nextBlock: ScheduleBlock | null;
  onToggleTaskBlockComplete: (blockId: string) => void;
  paceMode: PaceMode;
  planningWindow: PlanningWindow;
  tasks: MockPlannerState["dayPlan"]["tasks"];
  themeMode: WaykeeperThemeMode;
}

const typeTone: Record<
  ScheduleBlock["blockType"],
  "cobalt" | "coral" | "jade" | "ochre" | "violet"
> = {
  admin: "jade",
  appointment: "ochre",
  break: "jade",
  buffer: "violet",
  chore: "coral",
  focus: "cobalt",
  other: "violet",
  self_care: "jade",
  transition: "ochre",
};

const typeLabel: Partial<Record<ScheduleBlock["blockType"], string>> = {
  admin: "Build",
  appointment: "Anchor",
  break: "Pause",
  buffer: "Open",
  chore: "Shape",
  focus: "Focus",
  other: "Learn",
  self_care: "Nourish",
  transition: "Shift",
};

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function RouteWaypointList({
  blocks,
  currentBlock,
  currentTime,
  nextBlock,
  onToggleTaskBlockComplete,
  paceMode,
  planningWindow,
  tasks,
  themeMode,
}: RouteWaypointListProps) {
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const isLightTheme = themeMode === "light";

  useEffect(() => {
    const scrollRegion = scrollRegionRef.current;
    const currentElement = scrollRegion?.querySelector<HTMLElement>(
      '[data-current-route-block="true"]'
    );

    if (!scrollRegion || !currentElement) {
      return;
    }

    currentElement.scrollIntoView({ block: "center" });
  }, [currentBlock?.id]);

  return (
    <section
      aria-label="Day timeline"
      className="grid gap-4"
      data-testid="day-timeline"
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b pb-4 ${
          isLightTheme ? "border-[rgba(14,20,51,0.12)]" : "border-[rgba(255,247,214,0.18)]"
        }`}
      >
        <div>
          <h2
            className={`font-display text-[clamp(2rem,4vw,3.4rem)] leading-none tracking-[-0.06em] ${
              isLightTheme ? "text-[color:var(--wk-ink)]" : "text-[color:var(--wk-pearl)]"
            }`}
          >
            Your Route
          </h2>
          <p
            className={`mt-1 text-sm ${
              isLightTheme ? "text-[color:var(--wk-ink-muted)]" : "text-white/62"
            }`}
          >
            {formatDate(planningWindow.startTime)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-[color:var(--wk-verdigris)] px-3 py-1 font-semibold text-[color:var(--wk-spectral-cyan)]">
            On track
          </span>
          <span
            className={`rounded-full border px-3 py-1 ${
              isLightTheme
                ? "border-[rgba(14,20,51,0.12)] text-[color:var(--wk-ink-muted)]"
                : "border-white/14 text-white/68"
            }`}
          >
            Pace: {paceMode === "spread_out" ? "Spread out" : "Finish sooner"}
          </span>
          <span
            className={`rounded-full border px-3 py-1 ${
              isLightTheme
                ? "border-[rgba(14,20,51,0.12)] text-[color:var(--wk-ink-muted)]"
                : "border-white/14 text-white/68"
            }`}
          >
            Now {formatTime(currentTime)}
          </span>
        </div>
      </div>

      <div
        className="max-h-[calc(100svh-14rem)] overflow-y-auto pr-2"
        data-bounded-scroll="true"
        data-testid="timeline-scroll-region"
        ref={scrollRegionRef}
      >
        <ol className="relative space-y-3 pb-3">
          <span
            aria-hidden="true"
            className="absolute bottom-8 left-[4.4rem] top-8 w-px bg-[linear-gradient(180deg,var(--wk-cobalt),var(--wk-spectral-cyan),var(--wk-coral))]"
          />
          {blocks.map((block) => {
            const isCurrent = currentBlock?.id === block.id;
            const isNext = !isCurrent && nextBlock?.id === block.id;
            const displayTitle = getSafeBlockTitle(block);
            const linkedTask = block.taskId
              ? tasks.find((task) => task.id === block.taskId)
              : null;

            return (
              <li
                className="grid grid-cols-[3.4rem_2rem_minmax(0,1fr)] items-start gap-4"
                data-block-title={displayTitle}
                data-current-route-block={isCurrent ? "true" : undefined}
                data-testid="timeline-block"
                key={block.id}
              >
                <time
                  className={`pt-4 text-right text-sm ${
                    isLightTheme ? "text-[color:var(--wk-ink-muted)]" : "text-white/72"
                  }`}
                >
                  {formatTime(block.startTime)}
                </time>
                <div className="relative z-10 pt-3">
                  <Waymark
                    active={isCurrent}
                    tone={typeTone[block.blockType] ?? "violet"}
                  />
                </div>
                <article
                  className={`group rounded-[10px] border p-4 transition ${
                    isCurrent
                      ? "border-[color:var(--wk-spectral-cyan)] bg-[color:var(--wk-paper)] text-[color:var(--wk-ink)] shadow-[0_18px_48px_rgba(75,224,202,0.16)]"
                      : isNext
                        ? isLightTheme
                          ? "border-[color:var(--wk-sand)] bg-white/86 text-[color:var(--wk-ink)]"
                          : "border-[color:var(--wk-sand)] bg-[rgba(255,247,214,0.14)] text-white"
                        : isLightTheme
                          ? "border-[rgba(14,20,51,0.12)] bg-white/76 text-[color:var(--wk-ink)] hover:bg-white"
                          : "border-white/10 bg-white/[0.075] text-white hover:bg-white/[0.11]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        className={`text-[0.72rem] font-semibold uppercase tracking-[0.16em] ${
                          isCurrent
                            ? "text-[color:var(--wk-verdigris)]"
                            : isLightTheme
                              ? "text-[color:var(--wk-amethyst)]"
                              : "text-white/54"
                        }`}
                      >
                        {typeLabel[block.blockType] ?? "Waypoint"}{" "}
                        <span aria-hidden="true">-</span>{" "}
                        {block.status === "active"
                          ? "Current focus"
                          : block.status}
                      </p>
                      <h3 className="mt-1 text-base font-semibold leading-tight">
                        {displayTitle}
                      </h3>
                      <p
                        className={`mt-1 text-xs ${
                          isCurrent
                            ? "text-[color:var(--wk-ink-muted)]"
                            : isLightTheme
                              ? "text-[color:var(--wk-ink-muted)]"
                              : "text-white/58"
                        }`}
                      >
                        {formatTime(block.startTime)} - {formatTime(block.endTime)}
                      </p>
                      {linkedTask?.notes || block.notes ? (
                        <p
                          className={`mt-2 text-xs leading-5 ${
                            isCurrent
                              ? "text-[color:var(--wk-ink-muted)]"
                              : isLightTheme
                                ? "text-[color:var(--wk-ink-muted)]"
                                : "text-white/52"
                          }`}
                        >
                          {linkedTask?.notes ?? block.notes}
                        </p>
                      ) : null}
                      {isCurrent ? (
                        <BlockCountdownTimer
                          currentTime={currentTime}
                          endTime={block.endTime}
                          startTime={block.startTime}
                          themeMode={themeMode}
                        />
                      ) : null}
                    </div>
                    <button
                      aria-label={`Toggle ${block.title}`}
                      className={`grid size-6 shrink-0 place-items-center rounded-full border normal-case tracking-normal ${
                        block.status === "done"
                          ? "border-[color:var(--wk-spectral-cyan)] bg-[color:var(--wk-spectral-cyan)] text-[color:var(--wk-ink)]"
                          : isCurrent
                            ? "border-[color:var(--wk-cobalt)] text-[color:var(--wk-cobalt)]"
                            : isLightTheme
                              ? "border-[rgba(14,20,51,0.3)] text-[color:var(--wk-ink-muted)]"
                              : "border-white/48 text-white/72"
                      }`}
                      onClick={() => onToggleTaskBlockComplete(block.id)}
                      type="button"
                    >
                      {block.status === "done" ? (
                        <span className="size-2 rounded-full bg-current" />
                      ) : null}
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function formatTime(isoDateTime: string) {
  return timeFormatter.format(new Date(isoDateTime));
}

function formatDate(isoDateTime: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    weekday: "long",
    day: "numeric",
  }).format(new Date(isoDateTime));
}

function BlockCountdownTimer({
  currentTime,
  endTime,
  startTime,
  themeMode,
}: {
  currentTime: string;
  endTime: string;
  startTime: string;
  themeMode: WaykeeperThemeMode;
}) {
  const snapshot = createBlockCountdownSnapshot({
    currentTime,
    endTime,
    startTime,
  });

  if (!snapshot) {
    return null;
  }

  const isLightTheme = themeMode === "light";
  const timerStyle = {
    "--wk-timer-angle": `${snapshot.remainingAngle}deg`,
    "--wk-timer-fill": isLightTheme
      ? "rgba(0, 127, 107, 0.88)"
      : "rgba(75, 224, 202, 0.82)",
  } as CSSProperties;

  return (
    <div
      className={`mt-4 grid gap-3 rounded-[9px] border p-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] ${
        isLightTheme
          ? "border-[rgba(14,20,51,0.12)] bg-white/72"
          : "border-white/12 bg-[rgba(3,8,34,0.46)]"
      }`}
      data-testid="block-countdown-timer"
    >
      <div
        aria-hidden="true"
        className={`relative size-28 rounded-[28px] border shadow-inner ${
          isLightTheme
            ? "border-[rgba(14,20,51,0.1)] bg-[color:var(--wk-paper)]"
            : "border-white/12 bg-white/8"
        }`}
        style={timerStyle}
      >
        <div
          className="absolute inset-[17px] rounded-full"
          style={{
            background:
              "conic-gradient(from -90deg, var(--wk-timer-fill) 0deg var(--wk-timer-angle), rgba(255,255,255,0.18) var(--wk-timer-angle) 360deg)",
          }}
        />
        <div
          className={`absolute inset-[29px] rounded-full ${
            isLightTheme ? "bg-[color:var(--wk-paper)]" : "bg-[color:var(--wk-ink)]"
          }`}
        />
        <span
          className={`absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
            isLightTheme
              ? "border-[rgba(14,20,51,0.16)] bg-white"
              : "border-white/30 bg-[color:var(--wk-pearl)]"
          }`}
        />
        <span
          className="absolute left-1/2 top-1/2 h-[2px] w-8 origin-left rounded-full bg-[color:var(--wk-coral)]"
          style={{
            transform: `rotate(${snapshot.remainingAngle - 90}deg)`,
          }}
        />
        {snapshot.labels.map((label) => (
          <span
            className={`absolute left-1/2 top-1/2 text-[0.62rem] font-black leading-none ${
              isLightTheme ? "text-[color:var(--wk-ink)]" : "text-white/74"
            }`}
            key={`${label.label}-${label.angle}`}
            style={{
              transform: `translate(-50%, -50%) rotate(${label.angle}deg) translateY(-45px) rotate(${-label.angle}deg)`,
            }}
          >
            {label.label}
          </span>
        ))}
      </div>
      <div className="min-w-0 self-center">
        <p
          className={`text-xs font-semibold uppercase tracking-[0.15em] ${
            isLightTheme ? "text-[color:var(--wk-verdigris)]" : "text-[color:var(--wk-spectral-cyan)]"
          }`}
        >
          Active countdown
        </p>
        <p
          className={`mt-1 text-lg font-semibold leading-tight ${
            isLightTheme ? "text-[color:var(--wk-ink)]" : "text-white"
          }`}
          data-testid="block-countdown-label"
        >
          {snapshot.remainingLabel} remaining of {snapshot.durationLabel}
        </p>
        <p
          className={`mt-1 text-xs leading-5 ${
            isLightTheme ? "text-[color:var(--wk-ink-muted)]" : "text-white/58"
          }`}
        >
          The colored field shrinks toward 0 at the top as this waypoint runs down.
        </p>
      </div>
    </div>
  );
}

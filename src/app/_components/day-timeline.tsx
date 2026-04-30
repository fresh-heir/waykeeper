import {
  useEffect,
  useEffectEvent,
  useRef,
  type CSSProperties,
} from "react";

import type {
  BreakMode,
  PaceMode,
  PlanningWindow,
  ScheduleBlock,
  Task,
  TaskType,
} from "@/app/_lib/planner-types";

const MINUTE_HEIGHT = 1.56;
const CARD_OFFSET = 48;
const TASK_BLOCK_MARKER_SIZE = 14;
const TASK_BLOCK_MARKER_CENTER_X = CARD_OFFSET + 10;
const TASK_BLOCK_CONTENT_INSET = 30;
const MICRO_BLOCK_MAX_HEIGHT = 22;
const COMPACT_BLOCK_MAX_HEIGHT = 42;
const MEDIUM_BLOCK_MAX_HEIGHT = 74;
const BLOCK_GAP = 2;

type BlockRenderMode = "micro" | "compact" | "medium" | "tall";
type BlockVisualTone =
  | "focus"
  | "admin"
  | "selfCare"
  | "chore"
  | "errand"
  | "rest"
  | "anchor"
  | "other";

interface DayTimelineProps {
  blocks: ScheduleBlock[];
  bounded: boolean;
  breakMode: BreakMode;
  currentDisplayBlock: ScheduleBlock | null;
  currentTime: string;
  nextBlock: ScheduleBlock | null;
  onToggleTaskBlockComplete: (blockId: string) => void;
  paceMode: PaceMode;
  planningWindow: PlanningWindow;
  tasks: Task[];
  viewportRequest: {
    reason: "build" | "replan" | "time";
    token: number;
  };
}

const blockToneClasses: Record<BlockVisualTone, string> = {
  admin:
    "border-[color:var(--planner-block-admin-border)] bg-[color:var(--planner-block-admin-surface)] text-[color:var(--planner-block-admin-text)] shadow-[0_1px_0_rgba(255,255,255,0.45)]",
  chore:
    "border-[color:var(--planner-block-chore-border)] bg-[color:var(--planner-block-chore-surface)] text-[color:var(--planner-block-chore-text)] shadow-[0_1px_0_rgba(255,255,255,0.45)]",
  errand:
    "border-[color:var(--planner-block-errand-border)] bg-[color:var(--planner-block-errand-surface)] text-[color:var(--planner-block-errand-text)] shadow-[0_1px_0_rgba(255,255,255,0.45)]",
  focus:
    "border-[color:var(--planner-block-focus-border)] bg-[color:var(--planner-block-focus-surface)] text-[color:var(--planner-block-focus-text)] shadow-[0_1px_0_rgba(255,255,255,0.45)]",
  other:
    "border-[color:var(--planner-block-other-border)] bg-[color:var(--planner-block-other-surface)] text-[color:var(--planner-block-other-text)] shadow-[0_1px_0_rgba(255,255,255,0.45)]",
  rest:
    "border-[color:var(--planner-block-rest-border)] bg-[color:var(--planner-block-rest-surface)] text-[color:var(--planner-block-rest-text)] shadow-[0_1px_0_rgba(255,255,255,0.45)]",
  selfCare:
    "border-[color:var(--planner-block-selfcare-border)] bg-[color:var(--planner-block-selfcare-surface)] text-[color:var(--planner-block-selfcare-text)] shadow-[0_1px_0_rgba(255,255,255,0.45)]",
  anchor:
    "border-[color:var(--planner-block-anchor-border)] bg-[color:var(--planner-block-anchor-surface)] text-[color:var(--planner-block-anchor-text)] shadow-[0_2px_8px_rgba(49,57,68,0.09)]",
};

const blockMaskToneClasses: Record<BlockVisualTone, string> = {
  admin: "bg-[color:var(--planner-block-admin-surface)]",
  chore: "bg-[color:var(--planner-block-chore-surface)]",
  errand: "bg-[color:var(--planner-block-errand-surface)]",
  focus: "bg-[color:var(--planner-block-focus-surface)]",
  other: "bg-[color:var(--planner-block-other-surface)]",
  rest: "bg-[color:var(--planner-block-rest-surface)]",
  selfCare: "bg-[color:var(--planner-block-selfcare-surface)]",
  anchor: "bg-[color:var(--planner-block-anchor-surface)]",
};

const statusToneClasses: Record<ScheduleBlock["status"], string> = {
  active:
    "z-20 shadow-[inset_0_0_0_1px_rgba(156,190,211,0.85),0_5px_18px_rgba(59,78,94,0.08)]",
  deferred: "opacity-74",
  done: "opacity-[0.76] saturate-[0.88]",
  expired: "opacity-[0.46] saturate-[0.74]",
  skipped: "opacity-60 line-through decoration-stone-400",
  upcoming: "",
};

const typeLabels: Record<ScheduleBlock["blockType"], string> = {
  admin: "Admin",
  appointment: "Appointment",
  break: "Break",
  buffer: "Open time",
  chore: "Chore",
  focus: "Focus",
  other: "Other",
  self_care: "Self-care",
  transition: "Transition",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const timelineShellClasses =
  "waykeeper-panel-glow rounded-[24px] border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-3.5 shadow-[0_10px_28px_rgba(59,78,94,0.05)] backdrop-blur sm:p-4";

const timelineFrameClasses =
  "rounded-[20px] border border-[color:var(--planner-border)] bg-[color:var(--planner-surface-card)]";

const routeMetaClasses =
  "rounded-[10px] border border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] px-2.5 py-1.5";

export function DayTimeline({
  blocks,
  bounded,
  breakMode,
  currentDisplayBlock,
  currentTime,
  nextBlock,
  onToggleTaskBlockComplete,
  paceMode,
  planningWindow,
  tasks,
  viewportRequest,
}: DayTimelineProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const manualScrollSinceAutoAlignRef = useRef(false);
  const programmaticTimeoutRef = useRef<number | null>(null);
  const tasksById = new Map(tasks.map((task) => [task.id, task] as const));
  const start = new Date(planningWindow.startTime);
  const end = new Date(planningWindow.endTime);
  const totalMinutes = getMinutesBetween(start, end);
  const totalHeight = totalMinutes > 0 ? totalMinutes * MINUTE_HEIGHT : 0;
  const nowOffset =
    totalMinutes > 0
      ? clamp(
          getMinutesBetween(start, new Date(currentTime)) * MINUTE_HEIGHT,
          0,
          totalHeight
        )
      : 0;

  useEffect(() => {
    return () => {
      if (programmaticTimeoutRef.current) {
        window.clearTimeout(programmaticTimeoutRef.current);
      }
    };
  }, []);

  const markManualScroll = useEffectEvent(() => {
    if (isProgrammaticScrollRef.current) {
      return;
    }

    manualScrollSinceAutoAlignRef.current = true;
  });

  const handoffWheelScroll = useEffectEvent((event: WheelEvent) => {
    const scrollContainer = scrollContainerRef.current;

    if (!scrollContainer || !bounded || event.deltaY === 0) {
      return;
    }

    const maxScrollTop = Math.max(
      0,
      scrollContainer.scrollHeight - scrollContainer.clientHeight
    );
    const isAtTop = scrollContainer.scrollTop <= 0;
    const isAtBottom = scrollContainer.scrollTop >= maxScrollTop - 1;
    const isTryingToScrollPastTop = isAtTop && event.deltaY < 0;
    const isTryingToScrollPastBottom = isAtBottom && event.deltaY > 0;

    if (!isTryingToScrollPastTop && !isTryingToScrollPastBottom) {
      return;
    }

    event.preventDefault();
    window.scrollBy({
      top: event.deltaY,
      left: 0,
      behavior: "auto",
    });
  });

  const alignTimelineToCurrentTime = useEffectEvent(
    (
      reason: DayTimelineProps["viewportRequest"]["reason"],
      nowOffset: number,
      totalHeight: number
    ) => {
      const scrollContainer = scrollContainerRef.current;

      if (!scrollContainer || !bounded) {
        return;
      }

      const viewportHeight = scrollContainer.clientHeight;

      if (totalHeight <= viewportHeight) {
        manualScrollSinceAutoAlignRef.current = false;
        return;
      }

      const shouldAlign =
        reason !== "time" ||
        !manualScrollSinceAutoAlignRef.current ||
        isCurrentTimeNearViewportBounds(scrollContainer, nowOffset);

      if (!shouldAlign) {
        return;
      }

      const targetScrollTop = getRouteAwareScrollTarget({
        currentDisplayBlock,
        currentTime,
        nextBlock,
        planningWindowStart: start,
        totalHeight,
        viewportHeight,
      });

      const clampedTargetScrollTop = clamp(
        targetScrollTop,
        0,
        Math.max(0, totalHeight - viewportHeight)
      );

      isProgrammaticScrollRef.current = true;
      scrollContainer.scrollTo({
        top: clampedTargetScrollTop,
        behavior: "smooth",
      });
      manualScrollSinceAutoAlignRef.current = false;

      if (programmaticTimeoutRef.current) {
        window.clearTimeout(programmaticTimeoutRef.current);
      }

      programmaticTimeoutRef.current = window.setTimeout(() => {
        isProgrammaticScrollRef.current = false;
        programmaticTimeoutRef.current = null;
      }, 220);
    }
  );

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;

    if (!bounded || !scrollContainer) {
      return;
    }

    const handleScroll = () => {
      markManualScroll();
    };
    const handleWheel = (event: WheelEvent) => {
      handoffWheelScroll(event);
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    scrollContainer.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      scrollContainer.removeEventListener("wheel", handleWheel);
    };
  }, [bounded]);

  useEffect(() => {
    if (!viewportRequest.token || totalMinutes <= 0) {
      return;
    }

    alignTimelineToCurrentTime(viewportRequest.reason, nowOffset, totalHeight);
  }, [
    nowOffset,
    totalHeight,
    totalMinutes,
    viewportRequest.reason,
    viewportRequest.token,
  ]);

  if (totalMinutes <= 0) {
    return (
      <section
        aria-label="Day timeline"
        data-testid="day-timeline"
        className={timelineShellClasses}
      >
        <TimelineHeader
          breakMode={breakMode}
          currentTime={currentTime}
          paceMode={paceMode}
          planningWindow={planningWindow}
        />
        <div className="rounded-[14px] border border-[color:var(--planner-border)] bg-[color:var(--planner-surface-soft)] p-5">
          <p className="text-sm font-semibold text-stone-900">
            Planning window needs a later end time.
          </p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
            Set the end later than the start to preview the day route and fixed
            anchors inside the timeline.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Day timeline"
      data-testid="day-timeline"
      className={timelineShellClasses}
    >
      <TimelineHeader
        breakMode={breakMode}
        currentTime={currentTime}
        paceMode={paceMode}
        planningWindow={planningWindow}
      />
      <div className={timelineFrameClasses}>
        <div
          ref={scrollContainerRef}
          data-bounded-scroll={bounded ? "true" : "false"}
          data-testid="timeline-scroll-region"
          className={`rounded-[13px] px-2 py-2 sm:px-2.5 ${
            bounded
              ? "lg:h-[calc(100svh-10.5rem)] lg:min-h-[48rem] lg:max-h-[calc(100svh-10.5rem)] lg:overflow-y-auto"
              : ""
          }`}
        >
          <div
            className="relative w-full min-w-0"
            style={{ height: `${totalHeight}px` }}
          >
            <div
              aria-hidden="true"
              className="absolute bottom-0 top-0 w-px bg-stone-200/80"
              style={{ left: `${CARD_OFFSET - 9}px` }}
            />

            {buildTimeMarkers(start, end).map((marker) => (
              <TimeMarker
                key={marker.toISOString()}
                label={timeFormatter.format(marker)}
                top={getMinutesBetween(start, marker) * MINUTE_HEIGHT}
              />
            ))}

            {blocks.map((block) => {
              const blockStart = new Date(block.startTime);
              const blockEnd = new Date(block.endTime);
              const task = block.taskId ? tasksById.get(block.taskId) : undefined;
              const visualTone = getBlockVisualTone(block, task?.type);
              const canToggleTaskComplete = canToggleTaskBlockComplete(block);
              const rawTop =
                getMinutesBetween(start, blockStart) * MINUTE_HEIGHT;
              const rawHeight =
                getMinutesBetween(blockStart, blockEnd) * MINUTE_HEIGHT;
              const height = Math.max(rawHeight - BLOCK_GAP, 8);
              const top = rawTop + BLOCK_GAP / 2;
              const renderMode = getBlockRenderMode(height);
              const displayTitle = getSafeBlockTitle(block);
              const metaLabel = getBlockMetaLabel(block);
              const showMetaLabel =
                Boolean(metaLabel) &&
                (renderMode === "medium" || renderMode === "tall");
              const showNotes = renderMode === "tall" && Boolean(block.notes);
              const isActiveBlock = block.status === "active";
              const nowLineOffsetWithinCard = nowOffset - top;
              const showCurrentTimeMask =
                isActiveBlock &&
                nowLineOffsetWithinCard > 18 &&
                nowLineOffsetWithinCard < height - 18;
              const compactTimeLabel = formatCompactBlockRange(
                block.startTime,
                block.endTime
              );
              const showMicroTime =
                renderMode === "micro" &&
                !canToggleTaskComplete &&
                displayTitle.length <= 24;
              const cardStyle: CSSProperties = {
                top: `${top}px`,
                height: `${height}px`,
                left: `${CARD_OFFSET}px`,
                borderRadius: "8px",
                zIndex: isActiveBlock ? 20 : block.locked ? 14 : 10,
              };
              const paddingClasses =
                renderMode === "micro"
                  ? "px-2 py-0 sm:px-2.5"
                  : renderMode === "compact"
                    ? "px-2.5 py-1 sm:px-3"
                    : renderMode === "medium"
                      ? "px-2.5 py-[7px] sm:px-3 sm:py-[8px]"
                      : "px-3 py-[9px] sm:px-3.5 sm:py-[10px]";
              const cardClasses = [
                "absolute right-0 overflow-hidden border",
                paddingClasses,
                blockToneClasses[visualTone],
                block.isBreakEligibleTaskPlacement
                  ? "ring-1 ring-amber-200/70 ring-inset"
                  : "",
                isActiveBlock
                  ? statusToneClasses.active
                  : statusToneClasses[block.status],
              ].join(" ");

              return (
                <div key={block.id}>
                  <article
                    aria-label={buildBlockAriaLabel({
                      block,
                      blockEnd,
                      blockStart,
                      metaLabel,
                      title: displayTitle,
                    })}
                    data-block-id={block.id}
                    data-block-title={displayTitle}
                    data-testid="timeline-block"
                    className={cardClasses}
                    style={cardStyle}
                  >
                    {isActiveBlock ? (
                      <>
                        <div
                          aria-hidden="true"
                          className="absolute inset-[1px] rounded-[7px] bg-[rgba(255,255,255,0.16)]"
                        />
                        <div
                          aria-hidden="true"
                          className="absolute bottom-[4px] left-[4px] top-[4px] z-20 w-[2px] rounded-full bg-[color:var(--planner-accent-active-border)]"
                        />
                      </>
                    ) : null}

                    {showCurrentTimeMask ? (
                      <div
                        aria-hidden="true"
                        className={`absolute left-2.5 right-2.5 z-20 rounded-[6px] ${blockMaskToneClasses[visualTone]}`}
                        style={{
                          top: `${nowLineOffsetWithinCard - 10}px`,
                          height: "20px",
                          opacity: 0.9,
                        }}
                      />
                    ) : null}

                    <div
                      className="relative z-30 h-full"
                      style={
                        canToggleTaskComplete
                          ? { paddingLeft: `${TASK_BLOCK_CONTENT_INSET}px` }
                          : undefined
                      }
                    >
                      {renderMode === "micro" ? (
                        <div className="flex h-full items-center justify-between gap-2">
                          <h3 className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-semibold leading-none tracking-tight sm:text-[11px]">
                            {displayTitle}
                          </h3>
                          {showMicroTime ? (
                            <p className="shrink-0 text-[8px] font-medium text-current/65 sm:text-[9px]">
                              {compactTimeLabel}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex h-full min-h-0 flex-col justify-center">
                          {showMetaLabel ? (
                            <p className="overflow-hidden text-ellipsis whitespace-nowrap text-[8px] font-semibold uppercase tracking-[0.16em] text-current/58 sm:text-[9px]">
                              {metaLabel}
                            </p>
                          ) : null}
                          <h3
                            className={`overflow-hidden text-ellipsis whitespace-nowrap font-semibold tracking-tight ${
                              renderMode === "compact"
                                ? "text-[11px] leading-[1.05] sm:text-[12px]"
                                : renderMode === "medium"
                                  ? "mt-0.5 text-[12px] leading-[1.15] sm:text-[13px]"
                                  : "mt-0.5 text-[13px] leading-[1.18] sm:text-[14px]"
                            }`}
                          >
                            {displayTitle}
                          </h3>
                          <p
                            className={`mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap font-medium text-current/68 ${
                              renderMode === "compact"
                                ? "text-[9px] leading-none sm:text-[10px]"
                                : "text-[10px] leading-[1.1] sm:text-[11px]"
                            }`}
                          >
                            {compactTimeLabel}
                          </p>
                          {showNotes ? (
                            <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-[1.15] text-current/72 sm:text-[11px]">
                              {block.notes}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </article>
                  {canToggleTaskComplete ? (
                    <div
                      className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: `${TASK_BLOCK_MARKER_CENTER_X}px`,
                        top: `${top + height / 2}px`,
                      }}
                    >
                      <TaskBlockCompleteToggle
                        block={block}
                        onToggleTaskBlockComplete={onToggleTaskBlockComplete}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}

            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 z-20"
              style={{ top: `${nowOffset}px` }}
            >
              <div
                className="h-px bg-sky-400/45"
                style={{ marginLeft: `${CARD_OFFSET - 9}px` }}
              />
              <div
                className="absolute z-30 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-700 shadow-[0_0_0_2px_rgba(243,245,246,0.9)]"
                style={{ left: `${CARD_OFFSET - 9}px`, top: 0 }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TimelineHeader({
  breakMode,
  currentTime,
  paceMode,
  planningWindow,
}: {
  breakMode: BreakMode;
  currentTime: string;
  paceMode: PaceMode;
  planningWindow: PlanningWindow;
}) {
  const bannerDate = new Date(planningWindow.startTime);

  return (
    <div className="mb-3 flex flex-col gap-2 border-b border-[color:var(--planner-border)] pb-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[color:var(--wk-amethyst)]">
          Waykeeper
        </p>
        <h2 className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-display text-[1.65rem] tracking-[-0.05em] text-stone-950 sm:text-[2rem]">
          <span>{dateFormatter.format(bannerDate)}</span>
          <span className="font-sans text-[0.82rem] font-semibold uppercase tracking-[0.16em] text-stone-500 sm:text-[0.88rem]">
            {timeFormatter.format(new Date(currentTime))}
          </span>
        </h2>
      </div>

      <div className="grid gap-1 sm:grid-cols-3 sm:min-w-[19rem]">
        <RouteMeta
          label="Planning window"
          value={formatRange(planningWindow.startTime, planningWindow.endTime)}
        />
        <RouteMeta label="Break mode" value={capitalize(breakMode)} />
        <RouteMeta
          label="Pace"
          value={paceMode === "spread_out" ? "Spread out" : "Finish sooner"}
        />
      </div>
    </div>
  );
}

function RouteMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className={routeMetaClasses}>
      <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function TaskBlockCompleteToggle({
  block,
  onToggleTaskBlockComplete,
}: {
  block: ScheduleBlock;
  onToggleTaskBlockComplete: (blockId: string) => void;
}) {
  const isChecked = block.status === "done";

  return (
    <span className="flex shrink-0 items-center justify-center">
      <button
        aria-checked={isChecked}
        aria-label={
          isChecked ? "Task already marked completed" : "Mark task as completed"
        }
        className={`inline-flex shrink-0 items-center justify-center rounded-[6px] border-[1.5px] transition ${
          isChecked
            ? "border-[color:var(--planner-accent-active-border)] bg-[color:var(--planner-accent-active-surface)] text-[color:var(--planner-accent-active-text)] shadow-[0_2px_6px_rgba(83,124,152,0.12)]"
            : "border-stone-300 bg-[color:var(--planner-surface-card)] text-stone-400 hover:border-sky-300 hover:text-sky-700"
        }`}
        style={{
          width: `${TASK_BLOCK_MARKER_SIZE}px`,
          height: `${TASK_BLOCK_MARKER_SIZE}px`,
        }}
        onClick={() => onToggleTaskBlockComplete(block.id)}
        role="checkbox"
        type="button"
      >
        <span aria-hidden="true" className="relative block size-[10px] overflow-visible">
          <span
            className={`absolute left-[0px] top-[5px] h-[2px] w-[4px] rotate-45 rounded-full bg-current transition ${
              isChecked ? "opacity-100" : "opacity-0"
            }`}
          />
          <span
            className={`absolute left-[2px] top-[3px] h-[2px] w-[8px] -rotate-45 rounded-full bg-current transition ${
              isChecked ? "opacity-100" : "opacity-0"
            }`}
          />
        </span>
      </button>
    </span>
  );
}

function getSafeBlockTitle(block: ScheduleBlock) {
  const normalizedTitle = block.title
    .replace(
      /\s+\d+\s*(?:m|min|mins|h|hr|hrs|hour|hours)\b(?=\s*(?:·\s*part\s*\d+)?$)/i,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();

  return normalizedTitle || typeLabels[block.blockType] || "Block";
}

function TimeMarker({ label, top }: { label: string; top: number }) {
  return (
    <div
      aria-hidden="true"
      className="absolute left-0 right-0"
      style={{ top: `${top}px` }}
    >
      <p className="absolute left-0 -translate-y-1/2 whitespace-nowrap pr-2 text-[9px] font-medium text-stone-400 sm:text-[10px]">
        {label}
      </p>
      <div
        className="border-t border-dashed border-stone-200/60"
        style={{ marginLeft: `${CARD_OFFSET - 9}px` }}
      />
    </div>
  );
}

function buildTimeMarkers(start: Date, end: Date) {
  const markers = [new Date(start)];
  const cursor = new Date(start);

  cursor.setMinutes(0, 0, 0);
  if (cursor <= start) {
    cursor.setHours(cursor.getHours() + 1);
  }

  while (cursor < end) {
    markers.push(new Date(cursor));
    cursor.setHours(cursor.getHours() + 1);
  }

  return markers;
}

function formatRange(startTime: string, endTime: string) {
  return `${timeFormatter.format(new Date(startTime))} - ${timeFormatter.format(
    new Date(endTime)
  )}`;
}

function formatCompactBlockRange(startTime: string, endTime: string) {
  const startLabel = timeFormatter.format(new Date(startTime));
  const endLabel = timeFormatter.format(new Date(endTime));
  const startMeridiem = startLabel.endsWith("AM")
    ? "AM"
    : startLabel.endsWith("PM")
      ? "PM"
      : "";
  const endMeridiem = endLabel.endsWith("AM")
    ? "AM"
    : endLabel.endsWith("PM")
      ? "PM"
      : "";

  if (startMeridiem && startMeridiem === endMeridiem) {
    return `${startLabel.replace(` ${startMeridiem}`, "")}-${endLabel}`;
  }

  return `${startLabel}-${endLabel}`;
}

function getMinutesBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getBlockRenderMode(height: number): BlockRenderMode {
  if (height <= MICRO_BLOCK_MAX_HEIGHT) {
    return "micro";
  }

  if (height <= COMPACT_BLOCK_MAX_HEIGHT) {
    return "compact";
  }

  if (height <= MEDIUM_BLOCK_MAX_HEIGHT) {
    return "medium";
  }

  return "tall";
}

function getBlockMetaLabel(block: ScheduleBlock) {
  if (block.blockType === "break" && block.isBreakEligibleTaskPlacement) {
    return "Productive break";
  }

  if (block.blockType === "transition") {
    return "Transition";
  }

  if (block.blockType === "other") {
    return "Other";
  }

  return null;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function canToggleTaskBlockComplete(block: ScheduleBlock) {
  return !block.locked && Boolean(block.taskId);
}

function isCurrentTimeNearViewportBounds(
  scrollContainer: HTMLDivElement,
  nowOffset: number
) {
  const viewportTop = scrollContainer.scrollTop;
  const viewportBottom = viewportTop + scrollContainer.clientHeight;
  const margin = Math.min(160, scrollContainer.clientHeight * 0.2);

  return nowOffset <= viewportTop + margin || nowOffset >= viewportBottom - margin;
}

function getRouteAwareScrollTarget({
  currentDisplayBlock,
  currentTime,
  nextBlock,
  planningWindowStart,
  totalHeight,
  viewportHeight,
}: {
  currentDisplayBlock: ScheduleBlock | null;
  currentTime: string;
  nextBlock: ScheduleBlock | null;
  planningWindowStart: Date;
  totalHeight: number;
  viewportHeight: number;
}) {
  const boundaryOffset = clamp(
    getMinutesBetween(planningWindowStart, new Date(currentTime)) * MINUTE_HEIGHT,
    0,
    totalHeight
  );
  let targetScrollTop = boundaryOffset - viewportHeight * 0.28;

  if (currentDisplayBlock) {
    const currentDisplayTop = clamp(
      getMinutesBetween(planningWindowStart, new Date(currentDisplayBlock.startTime)) *
        MINUTE_HEIGHT,
      0,
      totalHeight
    );
    targetScrollTop = Math.min(
      targetScrollTop,
      currentDisplayTop - 28
    );
  }

  if (nextBlock) {
    const nextBlockBottom = clamp(
      getMinutesBetween(planningWindowStart, new Date(nextBlock.endTime)) *
        MINUTE_HEIGHT,
      0,
      totalHeight
    );
    targetScrollTop = Math.max(
      targetScrollTop,
      nextBlockBottom - (viewportHeight - 52)
    );
  }

  return targetScrollTop;
}

function getBlockVisualTone(
  block: ScheduleBlock,
  taskType: TaskType | undefined
): BlockVisualTone {
  if (block.blockType === "appointment" || block.locked) {
    return "anchor";
  }

  if (
    block.blockType === "break" ||
    block.blockType === "buffer" ||
    block.blockType === "transition"
  ) {
    return "rest";
  }

  if (block.blockType === "focus") {
    return "focus";
  }

  if (block.blockType === "admin") {
    return "admin";
  }

  if (block.blockType === "self_care") {
    return "selfCare";
  }

  if (block.blockType === "chore") {
    return taskType === "errand" ? "errand" : "chore";
  }

  return "other";
}

function buildBlockAriaLabel({
  block,
  blockEnd,
  blockStart,
  metaLabel,
  title,
}: {
  block: ScheduleBlock;
  blockEnd: Date;
  blockStart: Date;
  metaLabel: string | null;
  title: string;
}) {
  const parts = [
    title,
    formatRange(block.startTime, block.endTime),
    `${getMinutesBetween(blockStart, blockEnd)} minutes`,
  ];

  if (metaLabel) {
    parts.push(metaLabel);
  }

  if (block.status === "active") {
    parts.push("Current block");
  }

  return `${parts.join(", ")} timeline block`;
}

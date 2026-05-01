"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  BotanicalGlyph,
  GeneratedWaykeeperAsset,
  Starcut,
  WaykeeperButton,
  waykeeperAssets,
} from "@/app/_components/waykeeper-ui";
import { OracleSparkle, WaykeeperMark } from "@/app/_components/waykeeper-brand";
import type { PlannerDraftSummary } from "@/app/_lib/planner/store";

interface WelcomeResumeScreenProps {
  activeDraftId?: string | null;
  currentDateLabel: string;
  draftSummaries?: PlannerDraftSummary[];
  hasResumePlan: boolean;
  nextBlockTitle?: string;
  onDeleteDraft?: (draftId: string) => void;
  onLoadDraft?: (draftId: string) => void;
  onResumePlan: () => void;
  onSampleDay: () => void;
  onStartToday: () => void;
  onImportPlan: () => void;
  onTimeZoneChange: (timeZone: string) => void;
  progressLabel?: string;
  resumeBlockTitle?: string;
  selectedTimeZone: string;
  timeZoneOptions: Array<{ label: string; value: string }>;
}

export function WelcomeResumeScreen({
  activeDraftId,
  currentDateLabel,
  draftSummaries = [],
  hasResumePlan,
  nextBlockTitle,
  onDeleteDraft,
  onLoadDraft,
  onImportPlan,
  onResumePlan,
  onSampleDay,
  onStartToday,
  onTimeZoneChange,
  progressLabel,
  resumeBlockTitle,
  selectedTimeZone,
  timeZoneOptions,
}: WelcomeResumeScreenProps) {
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    if (!isHowItWorksOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsHowItWorksOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isHowItWorksOpen]);

  return (
    <main className="waykeeper-welcome min-h-screen overflow-hidden p-4 text-[color:var(--wk-ink)] md:p-6">
      <section className="mx-auto grid min-h-[calc(100svh-2rem)] w-full max-w-[1560px] overflow-hidden rounded-[8px] border border-[rgba(255,247,214,0.2)] bg-[color:var(--wk-paper)] shadow-[0_34px_110px_rgba(2,8,32,0.42)] lg:grid-cols-[0.72fr_1fr]">
        <div className="relative z-10 flex min-h-[48rem] flex-col bg-[rgba(255,252,244,0.94)] px-7 py-6 md:px-10 lg:px-12">
          <div className="mt-14 max-w-[35rem] md:mt-20">
            <div className="flex items-center gap-5">
              <WaykeeperMark className="size-20 shrink-0 rounded-[22px] md:size-24" />
              <div>
                <h1 className="font-display text-[clamp(3.5rem,7.4vw,6.4rem)] font-semibold leading-[0.88] tracking-[-0.08em] text-[color:var(--wk-ink)]">
                  Waykeeper
                </h1>
                <p className="mt-5 text-[0.86rem] font-black uppercase tracking-[0.24em] text-[color:var(--wk-ink-muted)]">
                  {currentDateLabel}
                </p>
              </div>
            </div>
            <div className="mt-5 h-1 w-16 bg-[color:var(--wk-cobalt)]" />
            <p className="mt-5 max-w-[18rem] text-[1.18rem] leading-7 text-[color:var(--wk-ink)]">
              Paste the day&apos;s mess in. Get a plan you can follow.
            </p>
          </div>

          <div className="mt-8 grid max-w-[26rem] gap-3">
            <WaykeeperButton
              leading={<OracleSparkle className="size-9" title="" />}
              onClick={onStartToday}
              tone="ink"
              trailing={<span className="text-xl">&gt;</span>}
            >
              <span className="block text-[0.98rem]">Start today&apos;s plan</span>
              <span className="mt-0.5 block text-[0.72rem] font-normal opacity-80">
                Build a route from your real tasks.
              </span>
            </WaykeeperButton>

            {hasResumePlan ? (
              <WaykeeperButton
                leading={
                  <span className="grid size-10 place-items-center rounded-full bg-white/22">
                    <BotanicalGlyph className="h-8 w-6" tone="blue" />
                  </span>
                }
                onClick={onResumePlan}
                tone="jade"
                trailing={<span className="text-xl">&gt;</span>}
              >
                <span className="block text-[0.98rem]">Resume current plan</span>
                <span className="mt-0.5 block text-[0.72rem] font-normal opacity-80">
                  {resumeBlockTitle
                    ? `Now: ${resumeBlockTitle}`
                    : "Pick up where you left off."}
                </span>
              </WaykeeperButton>
            ) : null}

            <WaykeeperButton
              leading={<Starcut className="size-8" />}
              onClick={onSampleDay}
              tone="violet"
              trailing={<span className="text-xl">&gt;</span>}
            >
              <span className="block text-[0.98rem]">Try sample day</span>
              <span className="mt-0.5 block text-[0.72rem] font-normal opacity-80">
                Use a realistic workday example.
              </span>
            </WaykeeperButton>
          </div>

          {draftSummaries.length > 1 ? (
            <section className="mt-6 max-w-[26rem] rounded-[14px] border border-[rgba(14,20,51,0.12)] bg-white/58 p-4 shadow-[0_14px_34px_rgba(2,8,32,0.08)]">
              <p className="text-[0.66rem] font-black uppercase tracking-[0.22em] text-[color:var(--wk-amethyst)]">
                Saved drafts
              </p>
              <div className="mt-3 grid gap-2">
                {draftSummaries.slice(0, 4).map((draft) => (
                  <div
                    className="flex items-center gap-2 rounded-[10px] border border-[rgba(14,20,51,0.1)] bg-[rgba(255,252,244,0.72)] p-2"
                    key={draft.id}
                  >
                    <button
                      className="min-w-0 flex-1 text-left normal-case tracking-normal"
                      onClick={() => onLoadDraft?.(draft.id)}
                      type="button"
                    >
                      <span className="block truncate text-sm font-black text-[color:var(--wk-ink)]">
                        {draft.title}
                        {activeDraftId === draft.id ? " · open" : ""}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[color:var(--wk-ink-muted)]">
                        {draft.subtitle}
                      </span>
                    </button>
                    <button
                      className="rounded-full border border-[rgba(14,20,51,0.14)] px-2 py-1 text-[0.65rem] font-black uppercase tracking-[0.12em] text-[color:var(--wk-ink-muted)] transition hover:border-[color:var(--wk-coral)] hover:text-[color:var(--wk-coral)]"
                      onClick={() => onDeleteDraft?.(draft.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-10 text-[0.78rem] text-[color:var(--wk-ink-muted)]">
            <button
              className="rounded-full border border-[rgba(14,20,51,0.14)] bg-white/55 px-4 py-2 normal-case tracking-normal transition hover:border-[color:var(--wk-cobalt)] hover:text-[color:var(--wk-cobalt)]"
              onClick={onImportPlan}
              type="button"
            >
              Import plan
            </button>
            <span aria-hidden="true" className="h-4 w-px bg-[rgba(14,20,51,0.2)]" />
            <button
              className="rounded-full border border-[rgba(14,20,51,0.14)] bg-white/55 px-4 py-2 normal-case tracking-normal transition hover:border-[color:var(--wk-cobalt)] hover:text-[color:var(--wk-cobalt)]"
              onClick={() => setIsHowItWorksOpen(true)}
              type="button"
            >
              How it works
            </button>
            <span aria-hidden="true" className="h-4 w-px bg-[rgba(14,20,51,0.2)]" />
            <button
              aria-expanded={isSettingsOpen}
              className="rounded-full border border-[rgba(14,20,51,0.14)] bg-white/55 px-4 py-2 normal-case tracking-normal transition hover:border-[color:var(--wk-cobalt)] hover:text-[color:var(--wk-cobalt)]"
              onClick={() => setIsSettingsOpen((isOpen) => !isOpen)}
              type="button"
            >
              Settings
            </button>
          </div>
          {isSettingsOpen ? (
            <section className="mt-3 max-w-[26rem] rounded-[14px] border border-[rgba(14,20,51,0.12)] bg-white/65 p-4 shadow-[0_14px_34px_rgba(2,8,32,0.08)]">
              <label
                className="text-[0.66rem] font-black uppercase tracking-[0.22em] text-[color:var(--wk-amethyst)]"
                htmlFor="waykeeper-welcome-time-zone"
              >
                Time zone
              </label>
              <select
                className="mt-2 w-full rounded-[10px] border border-[rgba(14,20,51,0.16)] bg-[color:var(--wk-paper)] px-3 py-2 text-sm font-semibold text-[color:var(--wk-ink)] outline-none transition focus:border-[color:var(--wk-cobalt)] focus:ring-2 focus:ring-[rgba(45,65,230,0.18)]"
                id="waykeeper-welcome-time-zone"
                onChange={(event) => onTimeZoneChange(event.target.value)}
                value={selectedTimeZone}
              >
                {timeZoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-[color:var(--wk-ink-muted)]">
                Used for the live welcome clock. Plans still save locally on this device.
              </p>
            </section>
          ) : null}
        </div>

        <div className="relative min-h-[36rem] overflow-hidden bg-[color:var(--wk-ink)]">
          <GeneratedWaykeeperAsset
            {...waykeeperAssets.welcomeHero}
            className="absolute inset-0 h-full w-full"
          />
          <GeneratedWaykeeperAsset
            {...waykeeperAssets.welcomeStarOverlay}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-95 mix-blend-normal"
            sizes="60vw"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,252,244,0.95)_0%,rgba(255,252,244,0.64)_8%,rgba(8,13,42,0.02)_38%,rgba(8,13,42,0.18)_100%)]" />
          <div className="absolute bottom-6 left-6 right-6 max-w-[31rem] rounded-[8px] border border-white/22 bg-[rgba(255,252,244,0.86)] p-5 text-[color:var(--wk-ink)] shadow-[0_22px_60px_rgba(3,8,34,0.2)] backdrop-blur md:left-auto">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.26em] text-[color:var(--wk-coral)]">
              Waykeeper offers you
            </p>
            <p className="mt-2 font-display text-[clamp(1.55rem,2.6vw,2.3rem)] leading-none tracking-[-0.05em]">
              A readable route for today, with breaks and overflow handled.
            </p>
            {nextBlockTitle || progressLabel ? (
              <p className="mt-3 text-sm leading-6 text-[color:var(--wk-ink-muted)]">
                {progressLabel ?? `Next: ${nextBlockTitle}`}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {isHowItWorksOpen ? (
        <HowItWorksModal
          onClose={() => setIsHowItWorksOpen(false)}
          onSampleDay={() => {
            setIsHowItWorksOpen(false);
            onSampleDay();
          }}
          onStartToday={() => {
            setIsHowItWorksOpen(false);
            onStartToday();
          }}
        />
      ) : null}
    </main>
  );
}

function HowItWorksModal({
  onClose,
  onSampleDay,
  onStartToday,
}: {
  onClose: () => void;
  onSampleDay: () => void;
  onStartToday: () => void;
}) {
  return (
    <div
      aria-labelledby="waykeeper-how-it-works-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(3,8,34,0.52)] p-5 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <section className="w-full max-w-[34rem] rounded-[18px] border border-[rgba(14,20,51,0.12)] bg-[color:var(--wk-paper)] p-6 text-[color:var(--wk-ink)] shadow-[0_30px_90px_rgba(2,8,32,0.36)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-[color:var(--wk-amethyst)]">
              How it works
            </p>
            <h2
              className="mt-2 font-display text-[2.6rem] leading-none tracking-[-0.07em]"
              id="waykeeper-how-it-works-title"
            >
              From task dump to route.
            </h2>
          </div>
          <button
            aria-label="Close How it works"
            className="rounded-full border border-[rgba(14,20,51,0.16)] px-3 py-1 text-sm normal-case tracking-normal transition hover:bg-white"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          <HowItWorksStep
            icon={<BotanicalGlyph className="h-10 w-7" tone="jade" />}
            title="Tell us your day"
          >
            Paste your tasks, set your available time, and add fixed events.
          </HowItWorksStep>
          <HowItWorksStep icon={<Starcut className="size-8" />} title="Review the interpretation">
            Check the tasks, durations, deadlines, and fixed times before building.
          </HowItWorksStep>
          <HowItWorksStep
            icon={<OracleSparkle className="size-9" title="" />}
            title="Follow your route with Oracle"
          >
            Use the route first. If the day changes, tune only the remaining blocks.
          </HowItWorksStep>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <WaykeeperButton onClick={onStartToday} tone="ink">
            Start today&apos;s plan
          </WaykeeperButton>
          <WaykeeperButton onClick={onSampleDay} tone="violet">
            Try sample day
          </WaykeeperButton>
        </div>
      </section>
    </div>
  );
}

function HowItWorksStep({
  children,
  icon,
  title,
}: {
  children: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex gap-4 rounded-[14px] border border-[rgba(14,20,51,0.1)] bg-white/70 p-4">
      <span className="shrink-0">{icon}</span>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[color:var(--wk-ink-muted)]">
          {children}
        </p>
      </div>
    </div>
  );
}

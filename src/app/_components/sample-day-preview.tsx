import {
  BotanicalGlyph,
  GeneratedWaykeeperAsset,
  Starcut,
  WaykeeperButton,
  waykeeperAssets,
} from "@/app/_components/waykeeper-ui";
import { OracleSparkle, WaykeeperMark } from "@/app/_components/waykeeper-brand";
import type { ReactNode } from "react";

interface SampleDayPreviewProps {
  onBack: () => void;
  onSelectPersona: (personaId: SamplePersonaId) => void;
  onTrySampleDay: () => void;
  selectedPersonaId: SamplePersonaId;
}

export type SamplePersonaId = "student" | "professional" | "creative_founder";

export const samplePersonaScenarioIds: Record<SamplePersonaId, string> = {
  creative_founder: "sample-creative-founder-day",
  professional: "sample-working-professional-day",
  student: "sample-student-day",
};

const samplePersonas: Record<
  SamplePersonaId,
  {
    energy: string;
    focusTheme: string;
    inputs: string[];
    insight: string;
    label: string;
    promises: Array<{ title: string; tone: "blue" | "green" | "violet"; value: string }>;
    title: string;
    waypoints: Array<[string, string, string]>;
  }
> = {
  student: {
    energy: "Study -> Reset",
    focusTheme: "Learn",
    inputs: [
      "Finish sociology reading response",
      "Complete calculus problem set",
      "Email academic advisor",
    ],
    insight: "Protect deep study without losing meals, movement, or admin follow-through.",
    label: "Student",
    promises: [
      { tone: "blue", title: "Focused study", value: "Deep work before lighter tasks." },
      { tone: "green", title: "Real breaks", value: "Meals and reset blocks stay visible." },
      { tone: "violet", title: "Honest overflow", value: "Lower-priority work can move." },
    ],
    title: "A student day with real deadlines",
    waypoints: [
      ["8:30", "Orient", "Set up readings and notes"],
      ["9:00", "Write", "Sociology reading response"],
      ["11:00", "Class", "Intro Sociology lecture"],
      ["12:30", "Reset", "Lunch and return library book"],
      ["1:30", "Practice", "Calculus problem set"],
      ["4:30", "Connect", "Lab partner study call"],
      ["7:30", "Close", "Pack backpack"],
    ],
  },
  professional: {
    energy: "Build -> Share",
    focusTheme: "Create",
    inputs: [
      "Prep Q2 client update",
      "Review launch metrics dashboard",
      "Submit April expense report",
    ],
    insight: "Your best work comes when meetings stop eating the shape of the day.",
    label: "Working Professional",
    promises: [
      { tone: "blue", title: "Deep work first", value: "Focus before meetings multiply." },
      { tone: "green", title: "Clean handoffs", value: "Follow-ups land in the right window." },
      { tone: "violet", title: "Adaptive Oracle", value: "Remainder tuning when work shifts." },
    ],
    title: "A workday with focus and follow-through",
    waypoints: [
      ["8:00", "Orient", "Check metrics and priorities"],
      ["9:00", "Build", "Prep Q2 client update"],
      ["10:30", "Sync", "Product team standup"],
      ["12:00", "Reset", "Lunch walk"],
      ["1:00", "Draft", "Project risks section"],
      ["2:30", "Share", "Client status call"],
      ["5:10", "Anchor", "School pickup"],
    ],
  },
  creative_founder: {
    energy: "Make -> Ship",
    focusTheme: "Shape",
    inputs: [
      "Send launch email draft",
      "Polish pricing page hero copy",
      "Record product demo clips",
    ],
    insight: "Creative momentum works best when the day has a visible spine.",
    label: "Creative / Founder",
    promises: [
      { tone: "blue", title: "Maker time", value: "Protect the block that actually ships." },
      { tone: "green", title: "Operations lane", value: "Admin gets contained, not ignored." },
      { tone: "violet", title: "Evening clarity", value: "Reflection closes the loop." },
    ],
    title: "A maker day for shipping the thing",
    waypoints: [
      ["8:30", "Prime", "Choose the artifact"],
      ["9:15", "Write", "Launch email draft"],
      ["11:30", "Mentor", "Coffee with mentor"],
      ["12:45", "Shape", "Pricing page hero copy"],
      ["3:00", "Learn", "Customer discovery call"],
      ["4:00", "Record", "Product demo clips"],
      ["6:00", "Close", "Tomorrow's top three"],
    ],
  },
};

export function SampleDayPreview({
  onBack,
  onSelectPersona,
  onTrySampleDay,
  selectedPersonaId,
}: SampleDayPreviewProps) {
  const selectedPersona = samplePersonas[selectedPersonaId];

  return (
    <main className="waykeeper-welcome min-h-screen overflow-hidden p-4 text-[color:var(--wk-ink)] md:p-6">
      <section className="mx-auto grid min-h-[calc(100svh-2rem)] w-full max-w-[1560px] overflow-hidden rounded-[8px] border border-[rgba(255,247,214,0.2)] bg-[color:var(--wk-ink)] shadow-[0_34px_110px_rgba(2,8,32,0.42)] lg:grid-cols-[0.72fr_0.72fr_1fr_0.54fr]">
        <div className="flex min-h-[42rem] flex-col bg-[color:var(--wk-ink)] p-8 text-white">
          <div className="flex items-center gap-3">
            <WaykeeperMark className="size-9 shrink-0" />
            <span className="font-display text-xl tracking-[-0.04em]">Waykeeper</span>
          </div>
          <div className="mt-20">
            <p className="text-sm uppercase tracking-[0.24em] text-[color:var(--wk-pearl)]">
              Sample Day
            </p>
            <h1 className="mt-4 font-display text-[3.7rem] leading-[0.9] tracking-[-0.07em] text-[color:var(--wk-pearl)]">
              {selectedPersona.title}
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-white/76">
              Choose a familiar day shape, then see Waykeeper build a real route from the same planner engine.
            </p>
          </div>
          <div className="mt-8 grid gap-2">
            {Object.entries(samplePersonas).map(([personaId, persona]) => (
              <button
                aria-pressed={selectedPersonaId === personaId}
                className={`rounded-[8px] border px-4 py-3 text-left normal-case tracking-normal transition ${
                  selectedPersonaId === personaId
                    ? "border-[color:var(--wk-spectral-cyan)] bg-white text-[color:var(--wk-ink)]"
                    : "border-white/18 bg-white/8 text-white hover:bg-white/14"
                }`}
                data-testid={`sample-persona-${personaId}`}
                key={personaId}
                onClick={() => onSelectPersona(personaId as SamplePersonaId)}
                type="button"
              >
                <span className="block text-sm font-semibold">{persona.label}</span>
                <span className="mt-1 block text-xs opacity-75">
                  {persona.focusTheme} - {persona.energy}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-3">
            {selectedPersona.promises.map((promise) => (
              <PreviewPromise
                key={promise.title}
                tone={promise.tone}
                title={promise.title}
              >
                {promise.value}
              </PreviewPromise>
            ))}
          </div>
          <div className="mt-auto flex gap-3 pt-8">
            <WaykeeperButton className="flex-1" onClick={onBack} tone="cream">
              Back
            </WaykeeperButton>
            <WaykeeperButton className="flex-1" onClick={onTrySampleDay} tone="violet">
              Try sample day
            </WaykeeperButton>
          </div>
        </div>

        <div className="bg-[color:var(--wk-paper)] p-7">
          <div className="rounded-[8px] bg-white/88 p-5 shadow-[0_18px_48px_rgba(3,8,34,0.14)]">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--wk-ink-muted)]">
              Route Preview
            </p>
            <div className="mt-5 space-y-0">
              {selectedPersona.waypoints.map(([time, title, subtitle], index) => (
                <div
                  className="grid grid-cols-[3.2rem_1.4rem_1fr_auto] items-start gap-3"
                  key={`${selectedPersonaId}-${title}`}
                >
                  <span className="pt-1 text-xs text-[color:var(--wk-ink-muted)]">
                    {time}
                  </span>
                  <span className="relative flex h-14 justify-center">
                    <span className="absolute bottom-0 top-5 w-px bg-[color:var(--wk-cobalt)]/30" />
                    <span className="relative z-10 mt-1 size-3 rotate-45 border-2 border-[color:var(--wk-cobalt)] bg-[color:var(--wk-paper)]" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-xs text-[color:var(--wk-ink-muted)]">
                      {subtitle}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`mt-1 size-3 rounded-full border border-[color:var(--wk-ink-muted)] ${
                      index === 1 ? "bg-[color:var(--wk-cyan-soft)]" : ""
                    }`}
                  />
                </div>
              ))}
            </div>
            <p className="mt-5 border-t border-[rgba(14,20,51,0.12)] pt-4 text-sm text-[color:var(--wk-ink-muted)]">
              Full plan available when you start.
            </p>
          </div>
        </div>

        <div className="relative min-h-[42rem] overflow-hidden">
          <GeneratedWaykeeperAsset
            {...waykeeperAssets.sampleDayHero}
            className="absolute inset-0 h-full w-full"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,11,36,0.06),rgba(5,11,36,0.18))]" />
        </div>

        <aside className="bg-[color:var(--wk-paper)] p-7">
          <div className="h-full rounded-[8px] bg-white/90 p-5 shadow-[0_18px_48px_rgba(3,8,34,0.12)]">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--wk-ink-muted)]">
              What you&apos;ll experience
            </p>
            <p className="mt-5 font-display text-3xl leading-none tracking-[-0.06em]">
              {selectedPersona.focusTheme}
            </p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--wk-ink-muted)]">
              {selectedPersona.insight}
            </p>
            <div className="mt-8 grid gap-8 text-sm leading-5 text-[color:var(--wk-ink)]">
              <div className="rounded-[8px] border border-[rgba(14,20,51,0.12)] bg-[color:var(--wk-paper)]/72 p-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--wk-ink-muted)]">
                  This sample starts with
                </p>
                <ul className="mt-3 grid gap-2 text-sm">
                  {selectedPersona.inputs.map((input) => (
                    <li className="flex gap-2" key={input}>
                      <span className="mt-2 size-1.5 rounded-full bg-[color:var(--wk-ruby)]" />
                      <span>{input}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <ExperienceItem icon={<OracleSparkle className="size-8" title="" />}>
                Focused time for deep work.
              </ExperienceItem>
              <ExperienceItem icon={<BotanicalGlyph className="h-9 w-7" tone="jade" />}>
                Space to learn and grow.
              </ExperienceItem>
              <ExperienceItem icon={<Starcut className="size-8" />}>
                Creative energy unlocked.
              </ExperienceItem>
              <ExperienceItem icon={<BotanicalGlyph className="h-9 w-7" tone="violet" />}>
                Connections that matter.
              </ExperienceItem>
              <ExperienceItem icon={<BotanicalGlyph className="h-9 w-7" tone="blue" />}>
                Evening reflection for calm and clarity.
              </ExperienceItem>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function PreviewPromise({
  children,
  title,
  tone,
}: {
  children: string;
  title: string;
  tone: "blue" | "green" | "violet";
}) {
  const toneClass = {
    blue: "bg-[color:var(--wk-cobalt)]",
    green: "bg-[color:var(--wk-verdigris)]",
    violet: "bg-[color:var(--wk-amethyst)]",
  }[tone];

  return (
    <div className={`rounded-[8px] ${toneClass} p-4 text-white`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{children}</p>
    </div>
  );
}

function ExperienceItem({
  children,
  icon,
}: {
  children: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

import Image from "next/image";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

import { OracleSparkle } from "@/app/_components/waykeeper-brand";

export const waykeeperAssets = {
  appSymbolShowcase: {
    alt: "Waykeeper app symbol with an arched window, open book, botanicals, and guiding sparkle star",
    src: "/waykeeper/app-symbol-showcase.png",
  },
  loadingCard: {
    alt: "Waykeeper loading card art with an open book, arched window, botanicals, and guiding sparkle star",
    src: "/waykeeper/loading-card.png",
  },
  sampleDayHero: {
    alt: "Luminous botanical stairway leading into a starry arched doorway for the sample day",
    src: "/waykeeper/sample-day-hero.png",
  },
  welcomeHero: {
    alt: "Editorial fantasy garden stairway with jewel-toned botanicals and starry arched doorway",
    src: "/waykeeper/welcome-hero.png",
  },
  welcomeStarOverlay: {
    alt: "Painterly gemstone sparkle overlay for the Waykeeper welcome hero",
    src: "/waykeeper/welcome-star-overlay.png",
  },
} as const;

export type WaykeeperThemeMode = "light" | "dark";

type WaykeeperButtonTone = "cream" | "ink" | "jade" | "violet";

type WaykeeperButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  leading?: ReactNode;
  tone?: WaykeeperButtonTone;
  trailing?: ReactNode;
};

const buttonToneClasses: Record<WaykeeperButtonTone, string> = {
  cream:
    "border-[rgba(14,20,51,0.16)] bg-[rgba(255,252,244,0.86)] text-[color:var(--wk-ink)] hover:border-[rgba(14,20,51,0.32)] hover:bg-[color:var(--wk-pearl)]",
  ink:
    "border-[color:var(--wk-cobalt)] bg-[color:var(--wk-cobalt)] text-white shadow-[0_18px_36px_rgba(40,56,228,0.28)] hover:bg-[color:var(--wk-ink)]",
  jade:
    "border-[color:var(--wk-verdigris)] bg-[color:var(--wk-verdigris)] text-white shadow-[0_18px_36px_rgba(27,143,130,0.22)] hover:bg-[#08756c]",
  violet:
    "border-[color:var(--wk-amethyst)] bg-[linear-gradient(135deg,var(--wk-ink),var(--wk-amethyst))] text-white shadow-[0_18px_36px_rgba(119,88,216,0.24)] hover:bg-[color:var(--wk-ink)]",
};

export function WaykeeperButton({
  children,
  className = "",
  leading,
  tone = "cream",
  trailing,
  type = "button",
  ...props
}: WaykeeperButtonProps) {
  return (
    <button
      className={`group inline-flex min-h-12 items-center justify-between gap-3 rounded-[10px] border px-4 py-3 text-left text-sm font-semibold normal-case tracking-normal transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 ${buttonToneClasses[tone]} ${className}`}
      type={type}
      {...props}
    >
      <span className="inline-flex min-w-0 items-center gap-3">
        {leading ? <span className="shrink-0">{leading}</span> : null}
        <span className="min-w-0">{children}</span>
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </button>
  );
}

export function WaykeeperPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[18px] border border-[rgba(14,20,51,0.14)] bg-[rgba(255,252,244,0.9)] shadow-[0_24px_70px_rgba(4,10,35,0.16)] ${className}`}
    >
      {children}
    </section>
  );
}

export function GeneratedWaykeeperAsset({
  alt,
  className = "",
  src,
  sizes = "100vw",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  alt: string;
  sizes?: string;
  src: string;
}) {
  return (
    <span
      className={`relative block select-none overflow-hidden ${className}`}
      {...props}
    >
      <Image
        alt={alt}
        className="object-cover"
        draggable={false}
        fill
        sizes={sizes}
        src={src}
      />
    </span>
  );
}

export function Waymark({
  active = false,
  className = "",
  tone = "cobalt",
}: {
  active?: boolean;
  className?: string;
  tone?: "cobalt" | "coral" | "jade" | "ochre" | "violet";
}) {
  const toneClass = {
    cobalt: "bg-[color:var(--wk-cobalt)]",
    coral: "bg-[color:var(--wk-coral)]",
    jade: "bg-[color:var(--wk-verdigris)]",
    ochre: "bg-[color:var(--wk-sand)]",
    violet: "bg-[color:var(--wk-amethyst)]",
  }[tone];

  return (
    <span
      aria-hidden="true"
      className={`relative inline-grid size-7 place-items-center ${className}`}
    >
      <span
        className={`absolute size-4 rotate-45 rounded-[2px] ${toneClass} ${
          active ? "shadow-[0_0_0_6px_rgba(75,224,202,0.18)]" : ""
        }`}
      />
      <span className="relative size-2 rounded-full bg-[color:var(--wk-pearl)]" />
    </span>
  );
}

export function BotanicalGlyph({
  className = "",
  tone = "jade",
}: {
  className?: string;
  tone?: "blue" | "coral" | "jade" | "violet";
}) {
  const stroke = {
    blue: "var(--wk-cobalt)",
    coral: "var(--wk-coral)",
    jade: "var(--wk-verdigris)",
    violet: "var(--wk-amethyst)",
  }[tone];

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 42 72"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21 68C21 48 21 26 21 4" stroke={stroke} strokeLinecap="round" strokeWidth="3" />
      <path d="M21 18C10 17 6 10 6 10c10-1 15 3 15 8Z" fill={stroke} opacity="0.86" />
      <path d="M22 31c12-1 16-9 16-9-11-1-16 4-16 9Z" fill={stroke} opacity="0.72" />
      <path d="M21 46C9 45 5 37 5 37c11-1 16 4 16 9Z" fill={stroke} opacity="0.78" />
      <path d="M22 58c11-1 15-8 15-8-10-1-15 3-15 8Z" fill={stroke} opacity="0.64" />
    </svg>
  );
}

export function Starcut({ className = "" }: { className?: string }) {
  return <OracleSparkle className={`drop-shadow-[0_12px_22px_rgba(255,73,132,0.2)] ${className}`} />;
}

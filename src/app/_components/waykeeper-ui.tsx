import Image from "next/image";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactNode,
  SVGProps,
} from "react";

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
type BotanicalTone = "blue" | "coral" | "jade" | "violet";
type SetupRailOrnamentsVariant = "dark" | "paper";

type RailPlantSpec = {
  className?: string;
  style: CSSProperties;
  tone: BotanicalTone;
};

type RailStarSpec = {
  className?: string;
  style: CSSProperties;
};

type RailDotSpec = {
  className?: string;
  style: CSSProperties;
};

const setupRailOrnamentRecipes: Record<
  SetupRailOrnamentsVariant,
  {
    dots: RailDotSpec[];
    plants: RailPlantSpec[];
    stars: RailStarSpec[];
  }
> = {
  dark: {
    plants: [
      {
        tone: "jade",
        className: "opacity-36",
        style: {
          height: "9.6rem",
          left: "-3.1rem",
          top: "23rem",
          transform: "rotate(-7deg)",
          width: "5.8rem",
        },
      },
      {
        tone: "blue",
        className: "opacity-34",
        style: {
          height: "10.5rem",
          right: "-2.8rem",
          top: "34%",
          transform: "rotate(7deg)",
          width: "6.2rem",
        },
      },
      {
        tone: "violet",
        className: "opacity-35",
        style: {
          height: "10rem",
          left: "-2.1rem",
          top: "53%",
          transform: "rotate(-3deg)",
          width: "6rem",
        },
      },
      {
        tone: "jade",
        className: "opacity-75",
        style: {
          bottom: "1.3rem",
          height: "8.7rem",
          left: "1rem",
          width: "5rem",
        },
      },
      {
        tone: "blue",
        className: "opacity-75",
        style: {
          bottom: "0.8rem",
          height: "10.2rem",
          right: "0.35rem",
          width: "5.7rem",
        },
      },
      {
        tone: "violet",
        className: "opacity-60",
        style: {
          bottom: "11.5rem",
          height: "9.2rem",
          left: "-1.8rem",
          width: "5.5rem",
        },
      },
    ],
    stars: [
      {
        className: "opacity-72",
        style: { height: "1.35rem", left: "1rem", top: "21rem", width: "1.35rem" },
      },
      {
        className: "opacity-52",
        style: { height: "1.05rem", right: "1rem", top: "30rem", width: "1.05rem" },
      },
      {
        className: "opacity-60",
        style: { height: "1.35rem", right: "1.7rem", top: "39%", width: "1.35rem" },
      },
      {
        className: "opacity-50",
        style: { height: "1rem", left: "1rem", top: "67%", width: "1rem" },
      },
      {
        className: "opacity-85",
        style: { bottom: "11.2rem", height: "1.7rem", left: "1.45rem", width: "1.7rem" },
      },
    ],
    dots: [
      {
        className: "bg-[color:var(--wk-pearl)] opacity-45",
        style: { left: "1rem", top: "19rem" },
      },
      {
        className: "bg-[color:var(--wk-chartreuse)] opacity-60",
        style: { right: "1.2rem", top: "28rem" },
      },
      {
        className: "bg-[color:var(--wk-spectral-cyan)] opacity-50",
        style: { left: "1.45rem", top: "56%" },
      },
      {
        className: "bg-[color:var(--wk-pearl)] opacity-40",
        style: { right: "1.4rem", top: "73%" },
      },
    ],
  },
  paper: {
    plants: [
      {
        tone: "blue",
        className: "opacity-28",
        style: {
          height: "13.2rem",
          right: "-2.25rem",
          top: "8%",
          transform: "rotate(5deg)",
          width: "7.6rem",
        },
      },
      {
        tone: "jade",
        className: "opacity-24",
        style: {
          height: "11.4rem",
          left: "-2rem",
          top: "34%",
          transform: "rotate(-5deg)",
          width: "6.8rem",
        },
      },
      {
        tone: "violet",
        className: "opacity-18",
        style: {
          height: "10rem",
          right: "-2.4rem",
          top: "54%",
          transform: "rotate(8deg) scaleX(-1)",
          width: "6.1rem",
        },
      },
      {
        tone: "blue",
        className: "opacity-20",
        style: {
          height: "9.8rem",
          left: "7.2rem",
          top: "45%",
          transform: "rotate(4deg)",
          width: "5.9rem",
        },
      },
      {
        tone: "jade",
        className: "opacity-32",
        style: {
          height: "9.6rem",
          right: "-1.9rem",
          top: "68%",
          transform: "rotate(-6deg) scaleX(-1)",
          width: "5.6rem",
        },
      },
      {
        tone: "jade",
        className: "opacity-55",
        style: {
          bottom: "8.6rem",
          height: "10.8rem",
          left: "-1rem",
          width: "6.2rem",
        },
      },
      {
        tone: "blue",
        className: "opacity-58",
        style: {
          bottom: "1.4rem",
          height: "12.8rem",
          right: "1.2rem",
          width: "7rem",
        },
      },
    ],
    stars: [
      {
        className: "opacity-55",
        style: { height: "1.35rem", right: "2.3rem", top: "18%", width: "1.35rem" },
      },
      {
        className: "opacity-40",
        style: { height: "1rem", left: "2.8rem", top: "29%", width: "1rem" },
      },
      {
        className: "opacity-45",
        style: { height: "1.2rem", right: "5.8rem", top: "49%", width: "1.2rem" },
      },
      {
        className: "opacity-50",
        style: { height: "1.25rem", left: "5.1rem", top: "60%", width: "1.25rem" },
      },
      {
        className: "opacity-46",
        style: { height: "1.05rem", right: "2rem", top: "75%", width: "1.05rem" },
      },
      {
        className: "opacity-70",
        style: { bottom: "13.2rem", height: "1.6rem", right: "3.9rem", width: "1.6rem" },
      },
    ],
    dots: [
      {
        className: "bg-[color:var(--wk-cobalt)] opacity-16",
        style: { left: "3.4rem", top: "16%" },
      },
      {
        className: "bg-[color:var(--wk-verdigris)] opacity-22",
        style: { right: "4.8rem", top: "38%" },
      },
      {
        className: "bg-[color:var(--wk-amethyst)] opacity-16",
        style: { left: "6.4rem", top: "62%" },
      },
      {
        className: "bg-[color:var(--wk-coral)] opacity-18",
        style: { right: "2.3rem", top: "72%" },
      },
      {
        className: "bg-[color:var(--wk-spectral-cyan)] opacity-20",
        style: { left: "4.2rem", top: "80%" },
      },
    ],
  },
};

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
  imageClassName = "",
  src,
  sizes = "100vw",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  alt: string;
  imageClassName?: string;
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
        className={`object-cover ${imageClassName}`}
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
  ...props
}: SVGProps<SVGSVGElement> & {
  className?: string;
  tone?: BotanicalTone;
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
      {...props}
    >
      <path d="M21 68C21 48 21 26 21 4" stroke={stroke} strokeLinecap="round" strokeWidth="3" />
      <path d="M21 18C10 17 6 10 6 10c10-1 15 3 15 8Z" fill={stroke} opacity="0.86" />
      <path d="M22 31c12-1 16-9 16-9-11-1-16 4-16 9Z" fill={stroke} opacity="0.72" />
      <path d="M21 46C9 45 5 37 5 37c11-1 16 4 16 9Z" fill={stroke} opacity="0.78" />
      <path d="M22 58c11-1 15-8 15-8-10-1-15 3-15 8Z" fill={stroke} opacity="0.64" />
    </svg>
  );
}

export function Starcut({
  className = "",
  ...props
}: SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <OracleSparkle
      className={`drop-shadow-[0_12px_22px_rgba(255,73,132,0.2)] ${className}`}
      {...props}
    />
  );
}

export function SetupRailOrnaments({
  className = "",
  variant,
}: {
  className?: string;
  variant: SetupRailOrnamentsVariant;
}) {
  const recipe = setupRailOrnamentRecipes[variant];

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
      data-setup-rail-ornaments={variant}
    >
      <span
        className={`waykeeper-rail-constellation waykeeper-rail-constellation-${variant}`}
      />
      <span
        className={`absolute inset-x-0 bottom-0 h-1/3 ${
          variant === "dark"
            ? "bg-[linear-gradient(180deg,transparent,rgba(119,88,216,0.14),rgba(40,56,228,0.22))]"
            : "bg-[linear-gradient(180deg,transparent,rgba(75,224,202,0.08),rgba(255,73,132,0.06))]"
        }`}
      />
      {recipe.plants.map((plant, index) => (
        <BotanicalGlyph
          className={`absolute ${plant.className ?? ""}`}
          key={`plant-${index}`}
          style={plant.style}
          tone={plant.tone}
        />
      ))}
      {recipe.stars.map((star, index) => (
        <Starcut
          className={`absolute ${star.className ?? ""}`}
          key={`star-${index}`}
          style={star.style}
        />
      ))}
      {recipe.dots.map((dot, index) => (
        <span
          className={`absolute size-1.5 rounded-full shadow-[0_0_14px_currentColor] ${
            dot.className ?? ""
          }`}
          key={`dot-${index}`}
          style={dot.style}
        />
      ))}
    </div>
  );
}

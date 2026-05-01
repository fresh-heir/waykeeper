import Image from "next/image";
import type { SVGProps } from "react";

type SvgComponentProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

export function OracleSparkle({
  className,
  title = "Oracle sparkle",
  ...props
}: SvgComponentProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M32 4 38.8 25.2 60 32 38.8 38.8 32 60 25.2 38.8 4 32 25.2 25.2 32 4Z"
        fill="var(--wk-pearl)"
        stroke="var(--wk-ink)"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      <path
        d="M32 13.5 36.2 27.8 50.5 32 36.2 36.2 32 50.5 27.8 36.2 13.5 32 27.8 27.8 32 13.5Z"
        fill="var(--wk-spectral-cyan)"
        opacity="0.72"
      />
      <path
        d="M45 8.5 47.4 16.6 55.5 19 47.4 21.4 45 29.5 42.6 21.4 34.5 19 42.6 16.6 45 8.5Z"
        fill="var(--wk-coral)"
      />
      <path
        d="M18.5 40 20.3 46.2 26.5 48 20.3 49.8 18.5 56 16.7 49.8 10.5 48 16.7 46.2 18.5 40Z"
        fill="var(--wk-chartreuse)"
      />
    </svg>
  );
}

export function OracleWindowMark({
  className,
  title = "Oracle window mark",
  ...props
}: SvgComponentProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect fill="var(--wk-amethyst)" height="96" rx="24" width="96" />
      <path
        d="M22 78V40.5C22 23.4 33.9 13 48 13s26 10.4 26 27.5V78H22Z"
        fill="rgba(226, 207, 255, 0.62)"
      />
      <path
        d="M29 73V41.2C29 28.2 37.1 20 48 20s19 8.2 19 21.2V73H29Z"
        fill="var(--wk-ink)"
      />
      <path
        d="M48 28 53.4 45.1 70.5 50.5 53.4 55.9 48 73 42.6 55.9 25.5 50.5 42.6 45.1 48 28Z"
        fill="var(--wk-pearl)"
        stroke="var(--wk-ink)"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M48 36.2 50.7 47.8 62.3 50.5 50.7 53.2 48 64.8 45.3 53.2 33.7 50.5 45.3 47.8 48 36.2Z"
        fill="var(--wk-spectral-cyan)"
        opacity="0.64"
      />
      <path
        d="M72 20 73.8 26.2 80 28 73.8 29.8 72 36 70.2 29.8 64 28 70.2 26.2 72 20Z"
        fill="var(--wk-coral)"
      />
      <path
        d="M24 76h48"
        stroke="var(--wk-ruby)"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

export function WaykeeperMark({
  className,
  title = "Waykeeper mark",
  ...props
}: SvgComponentProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect fill="var(--wk-ultramarine)" height="96" rx="24" width="96" />
      <path
        d="M23 76V38.5C23 21.7 34.6 12 48 12s25 9.7 25 26.5V76H23Z"
        fill="var(--wk-periwinkle)"
      />
      <path
        d="M29 72V39.5C29 26 37.3 18.5 48 18.5S67 26 67 39.5V72H29Z"
        fill="var(--wk-ink)"
      />
      <path
        d="M20 71.5c10.3-8.1 19.7-10.7 28-7.7v18.4c-8.9-4.1-18.2-3.2-28 2.8V71.5Z"
        fill="var(--wk-pearl)"
      />
      <path
        d="M76 71.5c-10.3-8.1-19.7-10.7-28-7.7v18.4c8.9-4.1 18.2-3.2 28 2.8V71.5Z"
        fill="#fff0ad"
      />
      <path
        d="M48 63.8v18.4"
        stroke="var(--wk-cobalt)"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <path
        d="M26 73.2c5.5-2.3 11.1-2.9 16.9-1.7M26 78c5.3-2 10.6-2.4 16.1-1.2M54 71.5c5.8-1.2 11.4-.6 16.9 1.7M54 76.8c5.5-1.2 10.8-.8 16.1 1.2"
        stroke="var(--wk-cobalt)"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="M50.5 25.5 53.1 34l8.4 2.5-8.4 2.6-2.6 8.4-2.6-8.4-8.4-2.6 8.4-2.5 2.6-8.5Z"
        fill="var(--wk-pearl)"
      />
      <path
        d="M70.5 12 72.1 17.4 77.5 19 72.1 20.6 70.5 26 68.9 20.6 63.5 19 68.9 17.4 70.5 12Z"
        fill="var(--wk-coral)"
      />
      <path
        d="M19 70h58"
        stroke="var(--wk-ruby)"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

export function WaykeeperLoadingCard({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      aria-label="Waykeeper loading illustration"
      className={`relative isolate min-h-[18rem] overflow-hidden rounded-[34px] border border-white/35 bg-[color:var(--wk-ink)] shadow-[0_30px_90px_rgba(15,25,71,0.28)] ${className}`}
      role="img"
    >
      <Image
        alt=""
        aria-hidden="true"
        className="object-cover"
        draggable={false}
        fill
        sizes="(min-width: 1024px) 46vw, 92vw"
        src="/waykeeper/loading-card.png"
      />
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/30" />
    </div>
  );
}

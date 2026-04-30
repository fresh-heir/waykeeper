import { WaykeeperLoadingCard, WaykeeperMark } from "@/app/_components/waykeeper-brand";

export default function Loading() {
  return (
    <main className="waykeeper-welcome flex min-h-screen items-center justify-center px-6 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[8px] border border-[rgba(255,247,214,0.2)] bg-[color:var(--wk-paper)] shadow-[0_34px_110px_rgba(2,8,32,0.42)] md:grid-cols-[0.78fr_1fr]">
        <WaykeeperLoadingCard className="min-h-[24rem] rounded-none border-0 shadow-none" />
        <div className="flex flex-col justify-center p-8 md:p-12">
          <div className="flex items-center gap-3 text-[color:var(--wk-ink)]">
            <WaykeeperMark className="size-12" />
            <div>
              <p className="font-display text-[2rem] leading-none tracking-[-0.06em]">
                Waykeeper
              </p>
              <p className="mt-2 text-sm text-[color:var(--wk-ink-muted)]">
                Your journey. Your pace. We&apos;ll keep the way.
              </p>
            </div>
          </div>
          <div className="mt-10">
            <p className="text-sm text-[color:var(--wk-ink-muted)]">
              Loading your path...
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(14,20,51,0.12)]">
              <div className="h-full w-[73%] rounded-full bg-[linear-gradient(90deg,var(--wk-verdigris),var(--wk-cobalt))]" />
            </div>
            <p className="mt-2 text-right text-sm text-[color:var(--wk-ink-muted)]">
              73%
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SymbolSearch } from "@/components/symbol-search";
import { IndexCard, MoverRow, Panel, Section, SkeletonBlock } from "@/components/widgets";
import { DATA_NOTE } from "@/lib/market/config";
import { getMarketClock } from "@/lib/market/math";
import { fetchDashboard } from "@/lib/market/server";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const clock = getMarketClock();
  const dash = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(),
    refetchInterval: 60_000,
  });

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p>
      <h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p>

      <div className="mt-5">
        <SymbolSearch />
      </div>

      <Section title="Overview" hint="NIFTY, Sensex and sector indices">
        {dash.isLoading ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />
            ))}
          </div>
        ) : dash.isError ? (
          <Panel>
            <p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p>
          </Panel>
        ) : (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">
            {dash.data?.indices.map((row) => (
              <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Market movers"
        hint="From a liquid large-cap NSE basket — not a full-exchange screener"
      >
        {dash.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonBlock className="h-56" />
            <SkeletonBlock className="h-56" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Panel className="p-2">
              <div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>
              {dash.data?.gainers.map((q) => (
                <MoverRow key={q.symbol} quote={q} />
              ))}
            </Panel>
            <Panel className="p-2">
              <div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>
              {dash.data?.losers.map((q) => (
                <MoverRow key={q.symbol} quote={q} />
              ))}
            </Panel>
          </div>
        )}
      </Section>

      <p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p>
    </div>
  );
}

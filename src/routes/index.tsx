import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { SymbolSearch } from "@/components/symbol-search";
import { IndexCard, MoverRow, Panel, Section, SkeletonBlock } from "@/components/widgets";
import { DATA_NOTE } from "@/lib/market/config";
import { getMarketClock } from "@/lib/market/math";
import { fetchDashboard } from "@/lib/market/server";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const clock = getMarketClock();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60_000 });

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p>
        </div>
        <Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]" aria-label="Open suggestions">
          <Lightbulb className="size-4" /> Suggestions
        </Link>
      </div>
      <div className="mt-5"><SymbolSearch /></div>

      <GoldPrice />

      <Section title="Overview" hint="NIFTY, Sensex and sector indices">
        {dash.isLoading ? (
          <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div>
        ) : dash.isError ? (
          <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel>
        ) : (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">
            {dash.data?.indices.map((row) => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}
          </div>
        )}
      </Section>

      <Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener">
        {dash.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2"><SkeletonBlock className="h-56" /><SkeletonBlock className="h-56" /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel>
            <Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel>
          </div>
        )}
      </Section>
      <p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p>
    </div>
  );
}

function GoldPrice() {
  const gold = useQuery({
    queryKey: ["gold-price"],
    queryFn: async () => {
      const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=5d&interval=1d", { cache: "no-store" });
      if (!res.ok) throw new Error("Gold price unavailable");
      const data = await res.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number }; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
      const row = data.chart?.result?.[0];
      const price = row?.meta?.regularMarketPrice ?? [...(row?.indicators?.quote?.[0]?.close ?? [])].reverse().find((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (price == null) throw new Error("Gold price unavailable");
      return price;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (gold.isLoading) return <Section title="Gold Price" hint="Current price and discount levels"><SkeletonBlock className="h-32" /></Section>;
  if (gold.isError || gold.data == null) return <Section title="Gold Price" hint="Current price and discount levels"><Panel><p className="text-sm text-muted">Gold price is temporarily unavailable.</p></Panel></Section>;

  const price = gold.data;
  const discounts = [10, 20, 30, 40].map((percent) => ({ percent, value: price * (1 - percent / 100) }));
  return (
    <Section title="Gold Price" hint="Current price and discount levels">
      <Panel className="p-4">
        <div className="text-xs text-muted">Gold futures reference (USD/oz)</div>
        <div className="mt-1 text-2xl font-semibold tabular text-fg">${price.toFixed(2)}</div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {discounts.map((d) => <div key={d.percent} className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted">{d.percent}% discount</div><div className="mt-1 tabular font-medium text-fg">${d.value.toFixed(2)}</div></div>)}
        </div>
      </Panel>
    </Section>
  );
}

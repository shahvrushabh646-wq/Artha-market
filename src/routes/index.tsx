import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Lightbulb } from "lucide-react";
import { SymbolSearch } from "@/components/symbol-search";
import { IndexCard, MoverRow, Panel, Section, SkeletonBlock } from "@/components/widgets";
import { DATA_NOTE } from "@/lib/market/config";
import { getMarketClock } from "@/lib/market/math";
import { fetchDashboard } from "@/lib/market/server";

export const Route = createFileRoute("/")({ component: Home });

type YahooChart = { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } };

const fetchYahooPrice = async (symbol: string): Promise<number | null> => {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const u = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);
      u.searchParams.set("range", "1d");
      u.searchParams.set("interval", "1m");
      const res = await fetch(u, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
      if (!res.ok) continue;
      const raw = await res.json() as YahooChart;
      const meta = raw.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      if (typeof price === "number" && Number.isFinite(price) && price > 0) return price;
    } catch {}
  }
  return null;
};

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async () => {
  // Use Yahoo Finance's actively traded gold/silver futures and USD/INR FX quote.
  // Convert USD per troy ounce into Indian rupees per 10g / kg.
  const [goldUsd, silverUsd, usdinr] = await Promise.all([
    fetchYahooPrice("GC=F"),
    fetchYahooPrice("SI=F"),
    fetchYahooPrice("INR=X"),
  ]);

  const OZ_GRAMS = 31.1034768;
  const gold10g = goldUsd != null && usdinr != null ? goldUsd * 10 / OZ_GRAMS * usdinr : null;
  const silverKg = silverUsd != null && usdinr != null ? silverUsd * 1000 / OZ_GRAMS * usdinr : null;

  if (gold10g == null && silverKg == null) throw new Error("Live precious metal market data unavailable");
  return {
    gold10g,
    silverKg,
    source: "Yahoo Finance · Gold/Silver futures + USD/INR",
  };
});

function Home() {
  const clock = getMarketClock();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60_000 });
  return <div><p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p><div className="flex items-start justify-between gap-3"><div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div><Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link></div><div className="mt-5"><SymbolSearch /></div><PreciousMetals /><Section title="Overview" hint="NIFTY, Sensex and sector indices">{dash.isLoading ? <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div> : dash.isError ? <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel> : <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map((row) => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}</div>}</Section><Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener">{dash.isLoading ? <div className="grid gap-3 sm:grid-cols-2"><SkeletonBlock className="h-56" /><SkeletonBlock className="h-56" /></div> : <div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel></div>}</Section><p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p></div>;
}

function PreciousMetals() {
  const metals = useQuery({ queryKey: ["live-precious-metals-yahoo"], queryFn: () => fetchPreciousMetals(), staleTime: 20_000, refetchInterval: 30_000, retry: 3 });
  const cards = [{ name: "Gold", price: metals.data?.gold10g ?? null, unit: "₹ / 10g" }, { name: "Silver", price: metals.data?.silverKg ?? null, unit: "₹ / kg" }];
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Live market reference converted to INR"><div className="grid gap-3 sm:grid-cols-2">{cards.map((m) => <Panel key={m.name} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">{m.name}</div><div className="mt-1 text-xs text-muted">India · {m.unit}</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{m.price != null ? formatINR(m.price) : metals.isLoading ? "Loading…" : "—"}</div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[10, 20, 30, 40].map((d) => <div key={d} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{d}% discount</div><div className="mt-1 tabular text-sm text-fg">{m.price != null ? formatINR(m.price * (1 - d / 100)) : "—"}</div></div>)}</div></Panel>)}</div><p className="mt-2 text-[11px] text-subtle">Source: Yahoo Finance live Gold (GC=F), Silver (SI=F) and USD/INR (INR=X). Converted to Indian rupees using troy-ounce weights. Market reference prices can differ from MCX contracts and jewellery-shop rates.</p></Section>;
}

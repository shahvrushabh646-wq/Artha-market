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
const yahoo = async (symbol: string) => { for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) { try { const u = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`); u.searchParams.set("range", "1d"); u.searchParams.set("interval", "1m"); const r = await fetch(u, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } }); if (!r.ok) continue; const p = (await r.json() as YahooChart).chart?.result?.[0]?.meta?.regularMarketPrice; if (typeof p === "number" && Number.isFinite(p) && p > 0) return p; } catch {} } return null; };

type GoldApiPrice = { symbol?: string; name?: string; price?: number; currency?: string; updatedAt?: string; timestamp?: number };
const goldApi = async (symbol: "XAU" | "XAG") => {
  try {
    const res = await fetch(`https://api.gold-api.com/price/${symbol}`, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json() as GoldApiPrice;
    return typeof data.price === "number" && Number.isFinite(data.price) && data.price > 0 ? data : null;
  } catch { return null; }
};

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async () => {
  const [gold, silver, fx] = await Promise.all([goldApi("XAU"), goldApi("XAG"), yahoo("INR=X")]);
  if (fx == null || fx <= 0) throw new Error("Live USD/INR rate unavailable");
  const troyOunceGrams = 31.1034768;
  const gold10g = gold?.price != null ? (gold.price / troyOunceGrams) * 10 * fx : null;
  const silverKg = silver?.price != null ? (silver.price / troyOunceGrams) * 1000 * fx : null;
  if (gold10g == null && silverKg == null) throw new Error("Live gold/silver prices unavailable");
  return { gold10g, silverKg, source: "Gold-API · live spot + Yahoo Finance USD/INR" };
});

function Home() {
  const clock = getMarketClock();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60_000 });
  return <div><p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p><div className="flex items-start justify-between gap-3"><div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div><Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link></div><div className="mt-5"><SymbolSearch /></div><PreciousMetals /><Section title="Overview" hint="NIFTY, Sensex and sector indices">{dash.isLoading ? <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div> : dash.isError ? <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel> : <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map((row) => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}</div>}</Section><Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener">{dash.isLoading ? <div className="grid gap-3 sm:grid-cols-2"><SkeletonBlock className="h-56" /><SkeletonBlock className="h-56" /></div> : <div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel></div>}</Section><p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p></div>;
}

function PreciousMetals() {
  const metals = useQuery({ queryKey: ["precious-metals-live-gold-api-v2"], queryFn: () => fetchPreciousMetals(), staleTime: 15_000, refetchInterval: 20_000, retry: 3 });
  const cards = [{ name: "Gold", price: metals.data?.gold10g ?? null, unit: "₹ / 10g" }, { name: "Silver", price: metals.data?.silverKg ?? null, unit: "₹ / kg" }];
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Current Indian INR market reference prices"><div className="grid gap-3 sm:grid-cols-2">{cards.map((m) => <Panel key={m.name} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">{m.name}</div><div className="mt-1 text-xs text-muted">Live spot · {m.unit}</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{m.price != null ? formatINR(m.price) : metals.isLoading ? "Loading…" : "—"}</div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[10, 20, 30, 40].map((d) => <div key={d} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{d}% discount</div><div className="mt-1 tabular text-sm text-fg">{m.price != null ? formatINR(m.price * (1 - d / 100)) : "—"}</div></div>)}</div></Panel>)}</div><p className="mt-2 text-[11px] text-subtle">Source: {metals.data?.source ?? "Gold-API · live spot + Yahoo Finance USD/INR"}. Gold is shown per 10g and Silver per kg in INR. Spot rates can differ from MCX futures and jewellery-shop rates.</p></Section>;
}

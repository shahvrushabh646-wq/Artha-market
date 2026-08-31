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
function num(v: unknown) { const x = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) && x > 0 ? x : null; }
type YahooChart = { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number }; indicators?: { quote?: Array<{ high?: Array<number | null> }> } }> } };
const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.METALS_DEV_API_KEY; if (!key) throw new Error("METALS_DEV_API_KEY is not configured");
  const u = new URL("https://api.metals.dev/v1/latest"); u.searchParams.set("api_key", key); u.searchParams.set("currency", "INR"); u.searchParams.set("unit", "g");
  const res = await fetch(u, { cache: "no-store", headers: { Accept: "application/json" } }); if (!res.ok) throw new Error(`Metals.Dev HTTP ${res.status}`);
  const raw = await res.json() as { status?: string; error_message?: string; timestamp?: string; metals?: Record<string, unknown> }; if (raw.status !== "success") throw new Error(raw.error_message || "Metals.Dev returned failure");
  const goldPerGram = num(raw.metals?.mcx_gold) ?? num(raw.metals?.gold); const silverPerGram = num(raw.metals?.mcx_silver) ?? num(raw.metals?.silver);
  if (goldPerGram == null || silverPerGram == null) throw new Error("Gold/Silver data unavailable");

  // Five-year highs are calculated from the full 5-year daily futures history.
  // We scale the USD/oz historical high to today's INR MCX-linked price, so the
  // displayed high stays in the same INR unit as the current price.
  async function yahoo5y(symbol: string) {
    try {
      const y = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`); y.searchParams.set("range", "5y"); y.searchParams.set("interval", "1d");
      const yr = await fetch(y, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } }); if (!yr.ok) return null;
      const data = await yr.json() as YahooChart; const row = data.chart?.result?.[0]; const highs = row?.indicators?.quote?.[0]?.high ?? [];
      const valid = highs.map(num).filter((x): x is number => x !== null); const latestUsd = num(row?.meta?.regularMarketPrice) ?? valid.at(-1) ?? null;
      return valid.length && latestUsd != null ? { highUsd: Math.max(...valid), latestUsd } : null;
    } catch { return null; }
  }
  const [goldRef, silverRef] = await Promise.all([yahoo5y("GC=F"), yahoo5y("SI=F")]);
  const gold5yHigh10g = goldRef ? goldPerGram * 10 * (goldRef.highUsd / goldRef.latestUsd) : null;
  const silver5yHighKg = silverRef ? silverPerGram * 1000 * (silverRef.highUsd / silverRef.latestUsd) : null;
  return { gold10g: goldPerGram * 10, silverKg: silverPerGram * 1000, gold5yHigh10g, silver5yHighKg, source: "Metals.Dev · MCX + Yahoo Finance 5Y futures reference", asOf: raw.timestamp ?? new Date().toISOString() };
});
function Home() {
  const clock = getMarketClock(); const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60000 });
  return <div><p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p><div className="flex items-start justify-between gap-3"><div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div><Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link></div><div className="mt-5"><SymbolSearch /></div><PreciousMetals /><Section title="Overview" hint="NIFTY, Sensex and sector indices">{dash.isLoading ? <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div> : dash.isError ? <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel> : <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map(row => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}</div>}</Section><Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener"><div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map(q => <MoverRow key={q.symbol} quote={q} />)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map(q => <MoverRow key={q.symbol} quote={q} />)}</Panel></div></Section><p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p></div>;
}
function PreciousMetals() {
  const metals = useQuery({ queryKey: ["precious-metals-mcx-metalsdev-5y-v2"], queryFn: () => fetchPreciousMetals(), staleTime: 60 * 60_000, refetchInterval: 60 * 60_000, refetchOnWindowFocus: false, retry: 1, gcTime: 2 * 60 * 60_000 });
  const cards = [{ name: "Gold", price: metals.data?.gold10g ?? null, high5y: metals.data?.gold5yHigh10g ?? null, unit: "₹ / 10g" }, { name: "Silver", price: metals.data?.silverKg ?? null, high5y: metals.data?.silver5yHighKg ?? null, unit: "₹ / kg" }];
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="MCX-linked price in INR"><div className="grid gap-3 sm:grid-cols-2">{cards.map(m => <Panel key={m.name} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">{m.name}</div><div className="mt-1 text-xs text-muted">MCX · {m.unit}</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{m.price != null ? formatINR(m.price) : metals.isLoading ? "Loading…" : "Price unavailable"}</div><div className="mt-2 text-xs text-muted">5-year highest price: <span className="font-medium text-fg">{m.high5y != null ? formatINR(m.high5y) : "—"}</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[40,50,60,70].map(d => <div key={d} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{d}% discount</div><div className="mt-1 tabular text-sm text-fg">{m.high5y != null ? formatINR(m.high5y * (1-d/100)) : "—"}</div></div>)}</div></Panel>)}</div><p className="mt-2 text-[11px] text-subtle">Current price: Metals.Dev MCX-linked INR feed. 5-year highest reference: Yahoo Finance daily futures history converted to today's INR level. 40%, 50%, 60% and 70% levels are calculated strictly from the 5-year high.</p></Section>;
}

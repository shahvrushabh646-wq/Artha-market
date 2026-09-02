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

type MetalPrices = { gold10g: number | null; silverKg: number | null; asOf: string | null; source: string };

async function fetchMcxPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36", Accept: "text/html,application/xhtml+xml,application/json,*/*" } });
    return res.ok ? await res.text() : "";
  } catch { return ""; }
}

function cleanMcxText(raw: string) {
  return raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}

function parseMcxLtp(text: string, commodity: "GOLD" | "SILVER"): number | null {
  const pattern = new RegExp(`(?:^|\\s)${commodity}\\s+\\d{2}[A-Z]{3}\\d{4}\\s+([0-9,]+(?:\\.[0-9]+)?)\\s+([0-9,]+(?:\\.[0-9]+)?)\\s+[-+]?([0-9,]+(?:\\.[0-9]+)?)\\s+[-+]?([0-9,]+(?:\\.[0-9]+)?)`, "i");
  const match = text.match(pattern);
  if (match) return num(match[2]);
  const ul = new RegExp(`${commodity}[\\s\\S]{0,900}?UL\\s+Product\\s+LTP\\s+([0-9,]+(?:\\.[0-9]+)?)`, "i").exec(text);
  return ul ? num(ul[1]) : null;
}

function parseMcxAsOf(text: string) { return text.match(/As\s+on\s+([^<|]{0,80}?)(?:Refresh|$)/i)?.[1]?.trim() ?? null; }

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async (): Promise<MetalPrices> => {
  // Current public MCX pages are used instead of a paid API key or an expired contract URL.
  // MCX quotes Gold in INR per 10g and Silver in INR per kg.
  const pages = await Promise.all([
    fetchMcxPage("https://www.mcxindia.com/market-data/most-active-contracts"),
    fetchMcxPage("https://www.mcxindia.com/market-data/top-gainers"),
    fetchMcxPage("https://www.mcxindia.com/market-data/top-losers"),
    fetchMcxPage("https://www.mcxindia.com/market-data/most-active-puts-calls"),
  ]);
  const texts = pages.map(cleanMcxText).filter(Boolean);
  let gold10g: number | null = null, silverKg: number | null = null, asOf: string | null = null;
  for (const text of texts) {
    gold10g ??= parseMcxLtp(text, "GOLD");
    silverKg ??= parseMcxLtp(text, "SILVER");
    asOf ??= parseMcxAsOf(text);
    if (gold10g != null && silverKg != null) break;
  }
  if (gold10g == null && silverKg == null) throw new Error("MCX Gold/Silver prices unavailable");
  return { gold10g, silverKg, asOf, source: "MCX · official market data" };
});

function Home() { const clock = getMarketClock(); const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60000 }); return <div><p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p><div className="flex items-start justify-between gap-3"><div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div><Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link></div><div className="mt-5"><SymbolSearch /></div><PreciousMetals /><Section title="Overview" hint="NIFTY, Sensex and sector indices">{dash.isLoading ? <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div> : dash.isError ? <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel> : <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map(row => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}</div>}</Section><Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener"><div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map(q => <MoverRow key={q.symbol} quote={q} />)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map(q => <MoverRow key={q.symbol} quote={q} />)}</Panel></div></Section><p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p></div>; }

function PreciousMetals() { const metals = useQuery({ queryKey: ["precious-metals-mcx-official-v9"], queryFn: () => fetchPreciousMetals(), staleTime: 15000, refetchInterval: 15000, refetchOnWindowFocus: true, retry: 2 }); const cards = [{ name: "Gold", price: metals.data?.gold10g ?? null, unit: "₹ / 10g" }, { name: "Silver", price: metals.data?.silverKg ?? null, unit: "₹ / kg" }]; const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`; return <Section title="Gold & Silver" hint="Official MCX prices in Indian rupees"><div className="grid gap-3 sm:grid-cols-2">{cards.map(m => <Panel key={m.name} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">{m.name}</div><div className="mt-1 text-xs text-muted">MCX · {m.unit}</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{m.price != null ? formatINR(m.price) : metals.isLoading ? "Loading…" : "Price unavailable"}</div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[10,20,30,40].map(d => <div key={d} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{d}% discount</div><div className="mt-1 tabular text-sm text-fg">{m.price != null ? formatINR(m.price * (1-d/100)) : "—"}</div></div>)}</div></Panel>)}</div><p className="mt-2 text-[11px] text-subtle">Source: MCX official market data. Gold is shown per 10g and Silver per kg. These are exchange reference prices, not jewellery retail prices{metals.data?.asOf ? ` · ${metals.data.asOf}` : ""}.</p></Section>; }

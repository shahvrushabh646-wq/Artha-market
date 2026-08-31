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

type McxPage = { gold10g: number | null; silverKg: number | null; asOf?: string | null };

const fetchPage = async (url: string): Promise<string> => {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json,*/*",
      },
    });
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
};

const parseNumber = (value: string): number | null => {
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const parseOfficialMcx = (html: string): McxPage => {
  const text = html
    .replace(new RegExp("<script[\\s\\S]*?<\\/script>", "gi"), " ")
    .replace(new RegExp("<style[\\s\\S]*?<\\/style>", "gi"), " ")
    .replace(new RegExp("<[^>]+>", "g"), " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");

  // MCX official Gold quote exposes: Price Quote Unit = 10 GRMS and UL Product LTP = current INR/10g.
  const goldMatch = text.match(new RegExp("Price Quote Unit\\s*:?\\s*10\\s*GRMS[\\s\\S]{0,900}?UL\\s+Product\\s+LTP\\s+([0-9,]+(?:\\.[0-9]+)?)", "i"));
  const gold = goldMatch ? parseNumber(goldMatch[1]) : null;

  // MCX official Most Active Puts/Calls page contains SILVER rows with their underlying MCX LTP.
  // Accept either SILVER or SILVERM and capture the last numeric value on the row as UL Product LTP.
  let silver: number | null = null;
  const silverRows = [...text.matchAll(new RegExp("SILVER(?:M|100|MIC)?[\\s\\S]{0,500}?UL\\s+Product\\s+LTP\\s+([0-9,]+(?:\\.[0-9]+)?)", "gi"))];
  for (const m of silverRows) {
    const n = parseNumber(m[1]);
    if (n != null && n > 100000) { silver = n; break; }
  }

  const asOf = text.match(new RegExp("As\\s+on\\s+([^|]{0,80}?)(?:Refresh|$)", "i"))?.[1]?.trim() ?? null;
  return { gold10g: gold, silverKg: silver, asOf };
};

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async () => {
  const [goldHtml, silverHtml] = await Promise.all([
    fetchPage("https://www.mcxindia.com/en/market-data/get-quote/OPTFUT/GOLD/24MAR2026/CE/160000.00"),
    fetchPage("https://www.mcxindia.com/market-data/most-active-puts-calls"),
  ]);

  const gold = parseOfficialMcx(goldHtml);
  const silver = parseOfficialMcx(silverHtml);
  const gold10g = gold.gold10g ?? silver.gold10g;
  const silverKg = silver.silverKg ?? gold.silverKg;

  if (gold10g == null && silverKg == null) {
    throw new Error("Official MCX gold/silver prices unavailable");
  }

  return {
    gold10g,
    silverKg,
    source: "MCX · official INR market data",
    asOf: gold.asOf ?? silver.asOf ?? null,
  };
});

function Home() {
  const clock = getMarketClock();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60_000 });
  return <div><p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p><div className="flex items-start justify-between gap-3"><div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div><Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link></div><div className="mt-5"><SymbolSearch /></div><PreciousMetals /><Section title="Overview" hint="NIFTY, Sensex and sector indices">{dash.isLoading ? <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div> : dash.isError ? <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel> : <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map((row) => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}</div>}</Section><Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener">{dash.isLoading ? <div className="grid gap-3 sm:grid-cols-2"><SkeletonBlock className="h-56" /><SkeletonBlock className="h-56" /></div> : <div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel></div>}</Section><p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p></div>;
}

function PreciousMetals() {
  const metals = useQuery({ queryKey: ["precious-metals-mcx-official-v8"], queryFn: () => fetchPreciousMetals(), staleTime: 5_000, refetchInterval: 15_000, retry: 2 });
  const cards = [{ name: "Gold", price: metals.data?.gold10g ?? null, unit: "₹ / 10g" }, { name: "Silver", price: metals.data?.silverKg ?? null, unit: "₹ / kg" }];
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Official MCX prices in Indian rupees"><div className="grid gap-3 sm:grid-cols-2">{cards.map((m) => <Panel key={m.name} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">{m.name}</div><div className="mt-1 text-xs text-muted">MCX · {m.unit}</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{m.price != null ? formatINR(m.price) : metals.isLoading ? "Loading…" : "—"}</div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[10, 20, 30, 40].map((d) => <div key={d} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{d}% discount</div><div className="mt-1 tabular text-sm text-fg">{m.price != null ? formatINR(m.price * (1 - d / 100)) : "—"}</div></div>)}</div></Panel>)}</div><p className="mt-2 text-[11px] text-subtle">Source: MCX official market data. Gold is quoted per 10g and Silver per kg. These are exchange reference prices, not jewellery retail prices{metals.data?.asOf ? ` · ${metals.data.asOf}` : ""}.</p></Section>;
}

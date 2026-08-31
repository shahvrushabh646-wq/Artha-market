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
type McxPage = { gold10g: number | null; silverKg: number | null };

const yahoo = async (symbol: string): Promise<number | null> => {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const u = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);
      u.searchParams.set("range", "1d");
      u.searchParams.set("interval", "1m");
      const r = await fetch(u, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
      if (!r.ok) continue;
      const p = (await r.json() as YahooChart).chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof p === "number" && Number.isFinite(p) && p > 0) return p;
    } catch {}
  }
  return null;
};

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

const parseMcxGold = (html: string): number | null => {
  const match = html.match(new RegExp("UL\\s+Product\\s+LTP\\s+([0-9,]+(?:\\.[0-9]+)?)", "i"));
  return match ? parseNumber(match[1]) : null;
};

const parseEt = (html: string): McxPage => {
  const text = html.replace(new RegExp("<script[\\s\\S]*?<\\/script>", "gi"), " ").replace(new RegExp("<style[\\s\\S]*?<\\/style>", "gi"), " ").replace(new RegExp("<[^>]+>", "g"), " ").replace(new RegExp("\\s+", "g"), " ");
  const gold = text.match(new RegExp("MCX\\s+[0-9:.]+\\s*(?:AM|PM)?\\s*IST\\s*\\|[\\s\\S]{0,160}?(\\d{5,7}(?:\\.\\d+)?)\\s+Per\\s+10\\s*GRMS", "i"));
  const silver = text.match(new RegExp("MCX\\s+[0-9:.]+\\s*(?:AM|PM)?\\s*IST\\s*\\|[\\s\\S]{0,160}?(\\d{5,8}(?:\\.\\d+)?)\\s+Per\\s+1\\s*KGS", "i"));
  return { gold10g: gold ? parseNumber(gold[1]) : null, silverKg: silver ? parseNumber(silver[1]) : null };
};

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async () => {
  // Yahoo Finance futures are the reliable live fallback and are converted from USD/oz to Indian INR units.
  const [goldUsd, silverUsd, usdInr] = await Promise.all([yahoo("GC=F"), yahoo("SI=F"), yahoo("INR=X")]);
  let gold10g = goldUsd != null && usdInr != null ? goldUsd * usdInr * 10 / 31.1034768 : null;
  let silverKg = silverUsd != null && usdInr != null ? silverUsd * usdInr * 1000 / 31.1034768 : null;
  let source = gold10g != null || silverKg != null ? "Yahoo Finance · live futures converted to INR" : "";

  // MCX official gold page is preferred when its live underlying LTP is available.
  const mcxGoldHtml = await fetchPage("https://www.mcxindia.com/en/market-data/get-quote/OPTFUT/GOLD/24MAR2026/CE/160000.00");
  const mcxGold = parseMcxGold(mcxGoldHtml);
  if (mcxGold != null) {
    gold10g = mcxGold;
    source = "MCX · official Gold LTP + Yahoo Finance Silver";
  }

  // Final fallback for either missing metal.
  if (gold10g == null || silverKg == null) {
    const [goldHtml, silverHtml] = await Promise.all([
      fetchPage("https://economictimes.indiatimes.com/commoditysummary/symbol-GOLD.cms"),
      fetchPage("https://economictimes.indiatimes.com/commoditysummary/symbol-SILVER.cms"),
    ]);
    const et = parseEt(goldHtml + " " + silverHtml);
    if (gold10g == null && et.gold10g != null) gold10g = et.gold10g;
    if (silverKg == null && et.silverKg != null) silverKg = et.silverKg;
    if (et.gold10g != null || et.silverKg != null) source = "Economic Times · MCX reference fallback";
  }

  if (gold10g == null && silverKg == null) throw new Error("Live gold/silver price unavailable");
  return { gold10g, silverKg, source };
});

function Home() {
  const clock = getMarketClock();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60_000 });
  return <div><p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p><div className="flex items-start justify-between gap-3"><div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div><Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link></div><div className="mt-5"><SymbolSearch /></div><PreciousMetals /><Section title="Overview" hint="NIFTY, Sensex and sector indices">{dash.isLoading ? <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div> : dash.isError ? <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel> : <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map((row) => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}</div>}</Section><Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener">{dash.isLoading ? <div className="grid gap-3 sm:grid-cols-2"><SkeletonBlock className="h-56" /><SkeletonBlock className="h-56" /></div> : <div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel></div>}</Section><p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p></div>;
}

function PreciousMetals() {
  const metals = useQuery({ queryKey: ["precious-metals-live-v7"], queryFn: () => fetchPreciousMetals(), staleTime: 10_000, refetchInterval: 15_000, retry: 2 });
  const cards = [{ name: "Gold", price: metals.data?.gold10g ?? null, unit: "₹ / 10g" }, { name: "Silver", price: metals.data?.silverKg ?? null, unit: "₹ / kg" }];
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Live Indian INR reference prices"><div className="grid gap-3 sm:grid-cols-2">{cards.map((m) => <Panel key={m.name} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">{m.name}</div><div className="mt-1 text-xs text-muted">Live · {m.unit}</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{m.price != null ? formatINR(m.price) : metals.isLoading ? "Loading…" : "—"}</div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[10, 20, 30, 40].map((d) => <div key={d} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{d}% discount</div><div className="mt-1 tabular text-sm text-fg">{m.price != null ? formatINR(m.price * (1 - d / 100)) : "—"}</div></div>)}</div></Panel>)}</div><p className="mt-2 text-[11px] text-subtle">Source: {metals.data?.source ?? "Live market feed"}. Gold is ₹/10g and Silver is ₹/kg. Rates are exchange/reference prices, not jewellery retail prices.</p></Section>;
}

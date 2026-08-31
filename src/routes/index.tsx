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
const clean = (s: string) => s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ");
const yahoo = async (symbol: string) => { for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) { try { const u = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`); u.searchParams.set("range", "1d"); u.searchParams.set("interval", "1m"); const r = await fetch(u, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } }); if (!r.ok) continue; const p = (await r.json() as YahooChart).chart?.result?.[0]?.meta?.regularMarketPrice; if (typeof p === "number" && Number.isFinite(p) && p > 0) return p; } catch {} } return null; };

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async () => {
  let gold10g: number | null = null;
  let silverKg: number | null = null;
  let source = "MCX India · Market Watch";

  // Primary Indian exchange source: MCX public Market Watch page.
  // MCX publishes commodity prices in INR; its official real-time feed itself
  // requires a subscribed data-feed connection, so this public page is used here.
  try {
    const res = await fetch("https://www.mcxindia.com/market-data/market-watch", {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json,*/*",
        Referer: "https://www.mcxindia.com/",
      },
    });
    if (res.ok) {
      const html = await res.text();
      const text = clean(html);
      const parseAround = (commodity: string) => {
        const escaped = commodity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const patterns = [
          new RegExp(`(?:${escaped}[\\s\\S]{0,700}?)(?:LTP|Last Price|Last Traded Price)[\\s:=]*([0-9,]+(?:\\.[0-9]+)?)`, "i"),
          new RegExp(`(?:LTP|Last Price|Last Traded Price)[\\s:=]*([0-9,]+(?:\\.[0-9]+)?)[\\s\\S]{0,700}?${escaped}`, "i"),
        ];
        for (const re of patterns) {
          const m = text.match(re);
          if (!m) continue;
          const v = Number(m[1].replace(/,/g, ""));
          if (Number.isFinite(v) && v > 0) return v;
        }
        return null;
      };
      const g = parseAround("GOLD");
      const s = parseAround("SILVER");
      // MCX Gold is quoted per 10 grams and Silver per kg for the standard contracts.
      if (g != null) gold10g = g;
      if (s != null) silverKg = s;
    }
  } catch {}

  // Fallback: Yahoo Finance futures, converted to INR using the live USD/INR rate.
  // This keeps the dashboard usable if MCX's public page does not expose its
  // client-side table to server-side fetches.
  if (gold10g == null || silverKg == null) {
    try {
      const [g, s, fx] = await Promise.all([
        gold10g == null ? yahoo("GC=F") : Promise.resolve(null),
        silverKg == null ? yahoo("SI=F") : Promise.resolve(null),
        yahoo("INR=X"),
      ]);
      const oz = 31.1034768;
      if (fx != null && fx > 0) {
        if (gold10g == null && g != null) gold10g = g * 10 / oz * fx;
        if (silverKg == null && s != null) silverKg = s * 1000 / oz * fx;
        if (g != null || s != null) source = "MCX India / Yahoo Finance fallback";
      }
    } catch {}
  }

  if (gold10g == null && silverKg == null) throw new Error("Current Indian precious-metal prices unavailable");
  return { gold10g, silverKg, source };
});

function Home() {
  const clock = getMarketClock();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60_000 });
  return <div><p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p><div className="flex items-start justify-between gap-3"><div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div><Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link></div><div className="mt-5"><SymbolSearch /></div><PreciousMetals /><Section title="Overview" hint="NIFTY, Sensex and sector indices">{dash.isLoading ? <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div> : dash.isError ? <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel> : <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map((row) => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}</div>}</Section><Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener">{dash.isLoading ? <div className="grid gap-3 sm:grid-cols-2"><SkeletonBlock className="h-56" /><SkeletonBlock className="h-56" /></div> : <div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel></div>}</Section><p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p></div>;
}

function PreciousMetals() {
  const metals = useQuery({ queryKey: ["precious-metals-mcx-india-v7"], queryFn: () => fetchPreciousMetals(), staleTime: 30_000, refetchInterval: 30_000, retry: 3 });
  const cards = [{ name: "Gold", price: metals.data?.gold10g ?? null, unit: "₹ / 10g" }, { name: "Silver", price: metals.data?.silverKg ?? null, unit: "₹ / kg" }];
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Current Indian MCX market reference prices"><div className="grid gap-3 sm:grid-cols-2">{cards.map((m) => <Panel key={m.name} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">{m.name}</div><div className="mt-1 text-xs text-muted">MCX India · {m.unit}</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{m.price != null ? formatINR(m.price) : metals.isLoading ? "Loading…" : "—"}</div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[10, 20, 30, 40].map((d) => <div key={d} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{d}% discount</div><div className="mt-1 tabular text-sm text-fg">{m.price != null ? formatINR(m.price * (1 - d / 100)) : "—"}</div></div>)}</div></Panel>)}</div><p className="mt-2 text-[11px] text-subtle">Source: {metals.data?.source ?? "MCX India"}. Prices are INR exchange-market reference values; Gold ₹/10g and Silver ₹/kg. MCX notes that its public spot prices are informational and its real-time data feed is a subscriber service. citeturn1search1turn1search4</p></Section>;
}

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

type MetalPrices = { gold10g: number | null; silverKg: number | null; gold5yHigh10g: number | null; gold75Price10g: number | null; gold85Price10g: number | null; gold95Price10g: number | null; goldSignal: "BUY" | "WAIT" | null; asOf: string | null; source: string };
type MoneycontrolResult = { price: number | null; asOf: string | null };
type YahooChartResponse = { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ high?: Array<number | null> }> } }> } };
const TROY_OUNCE_GRAMS = 31.1034768;

function decodeMoneycontrolText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8377;/g, "₹")
    .replace(/&#x20b9;/gi, "₹")
    .replace(/\s+/g, " ")
    .trim();
}

async function getMoneycontrolPrice(kind: "gold" | "silver"): Promise<MoneycontrolResult> {
  try {
    const path = kind === "gold" ? "gold-rates-today/mumbai/" : "silver-rates-today/mumbai/";
    const res = await fetch(`https://www.moneycontrol.com/news/${path}`, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; ArthaMarket/1.0)",
      },
      cache: "no-store",
    });
    if (!res.ok) return { price: null, asOf: null };
    const html = await res.text();
    const text = decodeMoneycontrolText(html);

    // Moneycontrol Mumbai pages expose the standard current retail reference:
    // Gold = 24 Carat / 10 Gram, Silver = 1 KG.
    const pattern = kind === "gold"
      ? /Current Price\s*\(24 Carat\s*\/\s*10 Gram\)\s*₹?\s*([0-9,]+(?:\.[0-9]+)?)/i
      : /Current Price\s*\(1 KG\)\s*₹?\s*([0-9,]+(?:\.[0-9]+)?)/i;

    const match = text.match(pattern);
    if (!match) return { price: null, asOf: null };
    const price = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(price) || price <= 0) return { price: null, asOf: null };
    if (kind === "gold" && (price < 50000 || price > 500000)) return { price: null, asOf: null };
    if (kind === "silver" && (price < 50000 || price > 1000000)) return { price: null, asOf: null };

    return { price, asOf: new Date().toISOString() };
  } catch {
    return { price: null, asOf: null };
  }
}

async function getGoldFiveYearHigh10g(currentGoldTozInr: number): Promise<number | null> {
  try {
    const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=5y&interval=1d", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const raw = await res.json() as YahooChartResponse;
    const highs = raw.chart?.result?.[0]?.indicators?.quote?.[0]?.high ?? [];
    const validHighs = highs.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
    if (!validHighs.length) return null;
    const liveYahooApprox = validHighs[validHighs.length - 1];
    if (!Number.isFinite(liveYahooApprox) || liveYahooApprox <= 0) return null;
    const inrPerUsdToz = currentGoldTozInr / liveYahooApprox;
    return Math.max(...validHighs) * inrPerUsdToz * 10 / TROY_OUNCE_GRAMS;
  } catch {
    return null;
  }
}

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async (): Promise<MetalPrices> => {
  const [goldQuote, silverQuote] = await Promise.all([
    getMoneycontrolPrice("gold"),
    getMoneycontrolPrice("silver"),
  ]);

  if (goldQuote.price == null || silverQuote.price == null) {
    throw new Error("Moneycontrol gold/silver price is temporarily unavailable");
  }

  const gold10g = goldQuote.price;
  const silverKg = silverQuote.price;
  const currentGoldTozInr = gold10g * TROY_OUNCE_GRAMS / 10;
  const gold5yHigh10g = await getGoldFiveYearHigh10g(currentGoldTozInr);
  const gold75Price10g = gold5yHigh10g != null ? Math.round(gold5yHigh10g * 0.25 * 100) / 100 : null;
  const gold85Price10g = gold5yHigh10g != null ? Math.round(gold5yHigh10g * 0.15 * 100) / 100 : null;
  const gold95Price10g = gold5yHigh10g != null ? Math.round(gold5yHigh10g * 0.05 * 100) / 100 : null;
  const goldSignal = gold75Price10g != null ? (gold10g <= gold75Price10g ? "BUY" : "WAIT") : null;

  return { gold10g, silverKg, gold5yHigh10g, gold75Price10g, gold85Price10g, gold95Price10g, goldSignal, asOf: goldQuote.asOf, source: "Moneycontrol" };
});

function Home() {
  const clock = getMarketClock();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60000 });
  return <div>
    <p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p>
    <div className="flex items-start justify-between gap-3">
      <div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div>
      <Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link>
    </div>
    <div className="mt-5"><SymbolSearch /></div>
    <PreciousMetals />
    <Section title="Overview" hint="NIFTY, Sensex and sector indices">
      {dash.isLoading ? <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div> : dash.isError ? <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel> : <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map(row => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}</div>}
    </Section>
    <Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener">
      <div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map(q => <MoverRow key={q.symbol} quote={q} />)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map(q => <MoverRow key={q.symbol} quote={q} />)}</Panel></div>
    </Section>
    <p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p>
  </div>;
}

function PreciousMetals() {
  const metals = useQuery({ queryKey: ["precious-metals-moneycontrol-v1"], queryFn: () => fetchPreciousMetals(), staleTime: 30000, refetchInterval: 60000, refetchOnWindowFocus: true, retry: 2 });
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Live Moneycontrol prices for Mumbai">
    <div className="grid gap-3 sm:grid-cols-2">
      <Panel className="p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">Gold</div><div className="mt-1 text-xs text-muted">Moneycontrol · ₹ / 10g · 24K</div></div><div className="text-xs text-muted">INR</div></div>
        <div className="mt-2 text-2xl font-semibold tabular text-fg">{metals.data?.gold10g != null ? formatINR(metals.data.gold10g) : metals.isLoading ? "Loading…" : "Price unavailable"}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[{ label: "75% discount", value: metals.data?.gold75Price10g }, { label: "85% discount", value: metals.data?.gold85Price10g }, { label: "95% discount", value: metals.data?.gold95Price10g }, { label: "Rule", value: null }].map((row) => <div key={row.label} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{row.label}</div><div className="mt-1 tabular text-sm text-fg">{row.value != null ? formatINR(row.value) : metals.data?.goldSignal ?? "—"}</div></div>)}
        </div>
        <div className="mt-3 text-xs text-muted">5Y high reference: {metals.data?.gold5yHigh10g != null ? formatINR(metals.data.gold5yHigh10g) : "—"} · Rule: BUY when current price ≤ 25% of 5Y high</div>
      </Panel>
      <Panel className="p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">Silver</div><div className="mt-1 text-xs text-muted">Moneycontrol · ₹ / kg · Mumbai</div></div><div className="text-xs text-muted">INR</div></div>
        <div className="mt-2 text-2xl font-semibold tabular text-fg">{metals.data?.silverKg != null ? formatINR(metals.data.silverKg) : metals.isLoading ? "Loading…" : "Price unavailable"}</div>
        <div className="mt-3 text-xs text-muted">Live Mumbai reference price from Moneycontrol. Silver is shown per kilogram.</div>
      </Panel>
    </div>
    <p className="mt-2 text-[11px] text-subtle">Source: Moneycontrol Mumbai rates. Gold uses the 24-carat rate per 10g and Silver uses the standard rate per kg. Prices are reference market/retail rates and may differ from jewellery or dealer quotes{metals.data?.asOf ? ` · ${metals.data.asOf}` : ""}.</p>
  </Section>;
}

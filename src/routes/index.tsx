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
type GoogleFinanceResult = { price: number | null; asOf: string | null };
type YahooChartResponse = { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ high?: Array<number | null> }> } }> } };
const TROY_OUNCE_GRAMS = 31.1034768;

async function getGoogleFinancePrice(ticker: string): Promise<GoogleFinanceResult> {
  try {
    const res = await fetch(`https://www.google.com/finance/quote/${encodeURIComponent(ticker)}`, { headers: { Accept: "text/html" }, cache: "no-store" });
    if (!res.ok) return { price: null, asOf: null };
    const html = await res.text();
    // Google Finance server-rendered pages contain the current quote in the page data.
    const patterns = [
      /<div[^>]*class="[^\"]*YMlKec[^\"]*"[^>]*>\$?([0-9,]+(?:\.[0-9]+)?)<\/div>/,
      /\"price\"\s*:\s*\"?([0-9,]+(?:\.[0-9]+)?)\"?/,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const price = Number(match[1].replace(/,/g, ""));
        if (Number.isFinite(price) && price > 0) return { price, asOf: new Date().toISOString() };
      }
    }
    return { price: null, asOf: null };
  } catch {
    return { price: null, asOf: null };
  }
}

async function getGoogleUsdInr(): Promise<number | null> {
  const result = await getGoogleFinancePrice("USD-INR");
  return result.price;
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
  const [goldQuote, silverQuote, usdInr] = await Promise.all([
    getGoogleFinancePrice("GCW00:COMEX"),
    getGoogleFinancePrice("SIW00:COMEX"),
    getGoogleUsdInr(),
  ]);

  if (goldQuote.price == null || silverQuote.price == null || usdInr == null || usdInr <= 0) {
    throw new Error("Google Finance gold/silver price is temporarily unavailable");
  }

  // Google Finance quotes COMEX continuous contracts in USD/troy oz.
  // Convert directly to the units displayed by Artha.
  const goldTozInr = goldQuote.price * usdInr;
  const silverTozInr = silverQuote.price * usdInr;
  const gold10g = goldTozInr * 10 / TROY_OUNCE_GRAMS;
  const silverKg = silverTozInr * 1000 / TROY_OUNCE_GRAMS;
  const gold5yHigh10g = await getGoldFiveYearHigh10g(goldTozInr);
  const gold75Price10g = gold5yHigh10g != null ? Math.round(gold5yHigh10g * 0.25 * 100) / 100 : null;
  const gold85Price10g = gold5yHigh10g != null ? Math.round(gold5yHigh10g * 0.15 * 100) / 100 : null;
  const gold95Price10g = gold5yHigh10g != null ? Math.round(gold5yHigh10g * 0.05 * 100) / 100 : null;
  const goldSignal = gold75Price10g != null ? (gold10g <= gold75Price10g ? "BUY" : "WAIT") : null;

  return { gold10g, silverKg, gold5yHigh10g, gold75Price10g, gold85Price10g, gold95Price10g, goldSignal, asOf: goldQuote.asOf, source: "Google Finance" };
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
  const metals = useQuery({ queryKey: ["precious-metals-google-v1"], queryFn: () => fetchPreciousMetals(), staleTime: 30000, refetchInterval: 60000, refetchOnWindowFocus: true, retry: 2 });
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Live Google Finance prices converted to Indian rupees">
    <div className="grid gap-3 sm:grid-cols-2">
      <Panel className="p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">Gold</div><div className="mt-1 text-xs text-muted">Google Finance · ₹ / 10g</div></div><div className="text-xs text-muted">INR</div></div>
        <div className="mt-2 text-2xl font-semibold tabular text-fg">{metals.data?.gold10g != null ? formatINR(metals.data.gold10g) : metals.isLoading ? "Loading…" : "Price unavailable"}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[{ label: "75% discount", value: metals.data?.gold75Price10g }, { label: "85% discount", value: metals.data?.gold85Price10g }, { label: "95% discount", value: metals.data?.gold95Price10g }, { label: "Rule", value: null }].map((row) => <div key={row.label} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{row.label}</div><div className="mt-1 tabular text-sm text-fg">{row.value != null ? formatINR(row.value) : metals.data?.goldSignal ?? "—"}</div></div>)}
        </div>
        <div className="mt-3 text-xs text-muted">5Y high reference: {metals.data?.gold5yHigh10g != null ? formatINR(metals.data.gold5yHigh10g) : "—"} · Rule: BUY when current price ≤ 25% of 5Y high</div>
      </Panel>
      <Panel className="p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">Silver</div><div className="mt-1 text-xs text-muted">Google Finance · ₹ / kg</div></div><div className="text-xs text-muted">INR</div></div>
        <div className="mt-2 text-2xl font-semibold tabular text-fg">{metals.data?.silverKg != null ? formatINR(metals.data.silverKg) : metals.isLoading ? "Loading…" : "Price unavailable"}</div>
        <div className="mt-3 text-xs text-muted">Live reference price from Google Finance. Silver is shown per kilogram.</div>
      </Panel>
    </div>
    <p className="mt-2 text-[11px] text-subtle">Source: Google Finance market quotes. Gold and silver COMEX continuous contracts are converted from USD/troy oz to INR; Gold is shown per 10g and Silver per kg. Prices are reference market prices, not jewellery retail prices{metals.data?.asOf ? ` · ${metals.data.asOf}` : ""}.</p>
  </Section>;
}

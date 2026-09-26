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

type MetalPrices = { gold10g: number | null; silverKg: number | null; goldChange24hPct: number | null; goldChange24hAmount10g: number | null; silverChange24hPct: number | null; silverChange24hAmountKg: number | null; gold5yHigh10g: number | null; goldDiscount10Price10g: number | null; goldDiscount20Price10g: number | null; goldDiscount30Price10g: number | null; goldDiscount40Price10g: number | null; silver5yHighKg: number; silver25PriceKg: number; silver35PriceKg: number; silver45PriceKg: number; silver50PriceKg: number; silver55PriceKg: number; goldSignal: "BUY" | "WAIT" | null; asOf: string | null; source: string };

async function getIndianMetalPrices(): Promise<{ gold10g: number; silverKg: number; goldChange24hPct: number | null; goldChange24hAmount10g: number | null; silverChange24hPct: number | null; silverChange24hAmountKg: number | null; asOf: string | null } | null> {
  const headers = {
    Accept: "text/html,application/xhtml+xml",
    "User-Agent": "Mozilla/5.0 (compatible; ArthaApp/1.0; +https://github.com/shahvrushabh646-wq/Artha-market)"
  };

  try {
    // Mumbai 24K 999 retail:
    // 1) IBJA Fine Gold (999) — official Indian indicative retail rate (per gram, excl. GST/making)
    // 2) Goodreturns Mumbai — city page for gold fallback + silver 999
    const [ibjaRes, mumbaiGoldRes, mumbaiSilverRes] = await Promise.all([
      fetch("https://www.ibja.co/", { headers, cache: "no-store" }),
      fetch("https://www.goodreturns.in/gold-rates/mumbai.html", { headers, cache: "no-store" }),
      fetch("https://www.goodreturns.in/silver-rates/mumbai.html", { headers, cache: "no-store" }).catch(() => null as any)
    ]);

    let goldPerGram: number | null = null;
    let silverKg: number | null = null;

    // --- Gold: prefer IBJA Fine Gold 999 ---
    if (ibjaRes.ok) {
      const ibjaHtml = await ibjaRes.text();
      const ibjaMatch =
        ibjaHtml.match(/id=["']lblFineGold999["'][^>]*>\s*₹?\s*([\d,]+)/i) ||
        ibjaHtml.match(/Fine Gold\s*\(999\)[^0-9₹]{0,40}₹?\s*([\d,]{4,6})/i);
      if (ibjaMatch) {
        const v = Number(ibjaMatch[1].replace(/,/g, ""));
        if (Number.isFinite(v) && v > 5000 && v < 50000) goldPerGram = v;
      }
    }

    // Fallback: Goodreturns Mumbai 24K
    if (goldPerGram == null && mumbaiGoldRes.ok) {
      const goldHtml = await mumbaiGoldRes.text();
      let mumbaiGold: number | null = null;
      const goldJs = goldHtml.match(/['"]24['"]\s*:\s*(\d+(?:\.\d+)?)/);
      if (goldJs) mumbaiGold = Number(goldJs[1]);
      if (mumbaiGold == null || !Number.isFinite(mumbaiGold) || mumbaiGold <= 0) {
        const goldText = goldHtml.match(/per gram for 24[^0-9]*?([\d,]+)/i)
          || goldHtml.match(/id=["']24K-price["'][^>]*>[^0-9]*([\d,]+)/i)
          || goldHtml.match(/&#8377;([\d,]+)<\/strong>\s*per gram for 24/i);
        if (goldText) mumbaiGold = Number(goldText[1].replace(/,/g, ""));
      }
      if (mumbaiGold != null && Number.isFinite(mumbaiGold) && mumbaiGold > 5000 && mumbaiGold < 50000) {
        goldPerGram = mumbaiGold;
      }
    }

    // Silver: Mumbai 999 rate per kg
    if (mumbaiSilverRes?.ok) {
      const silverHtml = await mumbaiSilverRes.text();
      const silverTicker = silverHtml.match(/₹\s*([\d,]+)\s*\/\s*kg/i)
        || silverHtml.match(/&#x20b9;\s*([\d,]+)\s*\/\s*kg/i)
        || silverHtml.match(/([\d,]+)\s*\/\s*kg/i);
      if (silverTicker) silverKg = Number(silverTicker[1].replace(/,/g, ""));
    }

    if (silverKg != null && (silverKg < 50000 || silverKg > 800000)) silverKg = null;

    if (goldPerGram == null || silverKg == null || !Number.isFinite(goldPerGram) || !Number.isFinite(silverKg) || goldPerGram <= 0 || silverKg <= 0) {
      return null;
    }

    const gold10g = Math.round(goldPerGram * 10);

    return {
      gold10g,
      silverKg,
      goldChange24hAmount10g: null,
      goldChange24hPct: null,
      silverChange24hAmountKg: null,
      silverChange24hPct: null,
      asOf: new Date().toISOString()
    };
  } catch {
    return null;
  }
}

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async (): Promise<MetalPrices> => {
  const quote = await getIndianMetalPrices();
  const gold5yHigh10g = 170000;
  const silver5yHighKg = 400000;
  const goldDiscount10Price10g = Math.round(gold5yHigh10g * 0.90);
  const goldDiscount20Price10g = Math.round(gold5yHigh10g * 0.80);
  const goldDiscount30Price10g = Math.round(gold5yHigh10g * 0.70);
  const goldDiscount40Price10g = Math.round(gold5yHigh10g * 0.60);
  const silver25PriceKg = Math.round(silver5yHighKg * 0.75);
  const silver35PriceKg = Math.round(silver5yHighKg * 0.65);
  const silver45PriceKg = Math.round(silver5yHighKg * 0.55);
  const silver50PriceKg = Math.round(silver5yHighKg * 0.50);
  const silver55PriceKg = Math.round(silver5yHighKg * 0.45);

  if (!quote) {
    return {
      gold10g: null,
      silverKg: null,
      goldChange24hPct: null,
      goldChange24hAmount10g: null,
      silverChange24hPct: null,
      silverChange24hAmountKg: null,
      gold5yHigh10g,
      goldDiscount10Price10g,
      goldDiscount20Price10g,
      goldDiscount30Price10g,
      goldDiscount40Price10g,
      silver5yHighKg,
      silver25PriceKg,
      silver35PriceKg,
      silver45PriceKg,
      silver50PriceKg,
      silver55PriceKg,
      goldSignal: null,
      asOf: null,
      source: "IBJA / Goodreturns (unavailable — will retry)"
    };
  }

  const { gold10g, silverKg, goldChange24hPct, goldChange24hAmount10g, silverChange24hPct, silverChange24hAmountKg, asOf } = quote;
  const goldSignal = gold10g <= goldDiscount40Price10g ? "BUY" : "WAIT";
  return {
    gold10g,
    silverKg,
    goldChange24hPct,
    goldChange24hAmount10g,
    silverChange24hPct,
    silverChange24hAmountKg,
    gold5yHigh10g,
    goldDiscount10Price10g,
    goldDiscount20Price10g,
    goldDiscount30Price10Price10g: goldDiscount30Price10g,
    goldDiscount40Price10g,
    silver5yHighKg,
    silver25PriceKg,
    silver35PriceKg,
    silver45PriceKg,
    silver50PriceKg,
    silver55PriceKg,
    goldSignal,
    asOf,
    source: "IBJA Fine Gold 999 / Goodreturns Mumbai"
  };
});

function Home() {
  const clock = getMarketClock();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60000 });
  return <div>
    <p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p>
    <div className="flex items-start justify-between gap-3"><div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div><Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link></div>
    <div className="mt-5"><SymbolSearch /></div><PreciousMetals />
    <Section title="Overview" hint="NIFTY, Sensex and sector indices">{dash.isLoading ? <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div> : dash.isError ? <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel> : <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map(row => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}</div>}</Section>
    <Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener"><div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map(q => <MoverRow key={q.symbol} quote={q} />)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map(q => <MoverRow key={q.symbol} quote={q} />)}</Panel></div></Section>
    <p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p>
  </div>;
}

function PreciousMetals() {
  const metals = useQuery({ queryKey: ["precious-metals-ibja-goodreturns-v2"], queryFn: () => fetchPreciousMetals(), staleTime: 30000, refetchInterval: 60000, refetchOnWindowFocus: true, retry: 2 });
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Current prices in Indian ₹">
    <div className="grid gap-3 sm:grid-cols-2">
      <Panel className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">Gold 24K</div><div className="mt-1 text-xs text-muted">Current Indian Gold · ₹ / 10g</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{metals.data?.gold10g != null ? formatINR(metals.data.gold10g) : metals.isLoading ? "Loading…" : "Price unavailable"}</div>{metals.data?.gold10g != null ? <div className="mt-0.5 text-xs text-muted tabular">{formatINR(metals.data.gold10g / 10)} / 1g</div> : null}<div className="mt-1 text-sm font-medium tabular">{metals.data?.goldChange24hPct != null && metals.data?.goldChange24hAmount10g != null ? <span className={metals.data.goldChange24hPct > 0 ? "text-up" : metals.data.goldChange24hPct < 0 ? "text-down" : "text-muted"}>{metals.data.goldChange24hPct > 0 ? "↑" : metals.data.goldChange24hPct < 0 ? "↓" : "→"} {metals.data.goldChange24hAmount10g >= 0 ? "+" : "-"}{formatINR(Math.abs(metals.data.goldChange24hAmount10g))} ({metals.data.goldChange24hPct >= 0 ? "+" : ""}{metals.data.goldChange24hPct.toFixed(2)}%) today</span> : <span className="text-muted">Today’s change unavailable</span>}</div><div className="mt-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2"><div className="text-sm font-semibold text-fg">5-Year High: {formatINR(metals.data?.gold5yHigh10g ?? 170000)}</div></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[{ label: "10% discount", value: metals.data?.goldDiscount10Price10g }, { label: "20% discount", value: metals.data?.goldDiscount20Price10g }, { label: "30% discount", value: metals.data?.goldDiscount30Price10g }, { label: "40% discount", value: metals.data?.goldDiscount40Price10g }].map((row) => <div key={row.label} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{row.label}</div><div className="mt-1 tabular text-sm text-fg">{row.value != null ? formatINR(row.value) : "—"}</div></div>)}</div><div className="mt-3 text-xs text-muted">Rule: BUY when current price ≤ 60% of 5-Year High</div></Panel>
      <Panel className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">Silver 999</div><div className="mt-1 text-xs text-muted">Current Indian Silver · ₹ / kg</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{metals.data?.silverKg != null ? formatINR(metals.data.silverKg) : metals.isLoading ? "Loading…" : "Price unavailable"}</div>{metals.data?.silverKg != null ? <div className="mt-0.5 text-xs text-muted tabular">{formatINR(metals.data.silverKg / 100)} / 10g · {formatINR(metals.data.silverKg / 1000)} / 1g</div> : null}<div className="mt-1 text-sm font-medium tabular">{metals.data?.silverChange24hPct != null && metals.data?.silverChange24hAmountKg != null ? <span className={metals.data.silverChange24hPct > 0 ? "text-up" : metals.data.silverChange24hPct < 0 ? "text-down" : "text-muted"}>{metals.data.silverChange24hPct > 0 ? "↑" : metals.data.silverChange24hPct < 0 ? "↓" : "→"} {metals.data.silverChange24hAmountKg >= 0 ? "+" : "-"}{formatINR(Math.abs(metals.data.silverChange24hAmountKg))} ({metals.data.silverChange24hPct >= 0 ? "+" : ""}{metals.data.silverChange24hPct.toFixed(2)}%) today</span> : <span className="text-muted">Today’s change unavailable</span>}</div><div className="mt-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2"><div className="text-sm font-semibold text-fg">5-Year High: {formatINR(metals.data?.silver5yHighKg ?? 400000)}</div></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{[{ label: "25%", value: metals.data?.silver25PriceKg }, { label: "35%", value: metals.data?.silver35PriceKg }, { label: "45%", value: metals.data?.silver45PriceKg }, { label: "50%", value: metals.data?.silver50PriceKg }, { label: "55%", value: metals.data?.silver55PriceKg }].map((row) => <div key={row.label} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{row.label}</div><div className="mt-1 tabular text-sm text-fg">{row.value != null ? formatINR(row.value) : "—"}</div></div>)}</div><div className="mt-3 text-xs text-muted">Silver rule levels are calculated from the fixed 5-Year High reference.</div></Panel>
    </div><p className="mt-2 text-[11px] text-subtle">Current Indian prices in ₹ only (24K gold · ₹/10g · Silver 999 · ₹/kg). Source: {metals.data?.source ?? "IBJA / Goodreturns"}. Refreshed every 60s.{metals.data?.asOf ? ` · Last updated: ${new Date(metals.data.asOf).toLocaleString("en-IN")}` : metals.data?.gold10g == null && !metals.isLoading ? " · Live rate could not be refreshed." : ""}</p>
  </Section>;
}

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
  try {
    const currentRes = await fetch("https://api.oropocket.com/public/prices", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!currentRes.ok) return null;
    const raw = await currentRes.json() as { data?: { gold?: { buy?: number }; silver?: { buy?: number }; timestamp?: string } };
    const gold = Number(raw.data?.gold?.buy);
    const silver = Number(raw.data?.silver?.buy);
    if (!Number.isFinite(gold) || !Number.isFinite(silver) || gold <= 0 || silver <= 0) return null;

    const gold10g = gold * 10;
    const silverKg = silver * 1000;
    let goldChange24hPct: number | null = null;
    let silverChange24hPct: number | null = null;
    let goldChange24hAmount10g: number | null = null;
    let silverChange24hAmountKg: number | null = null;

    // The public feed does not expose a 24h-change field. Use its historical endpoint
    // when available so the app never invents a movement value.
    try {
      const from = new Date(Date.now() - 2 * 86400000).toISOString();
      const historyRes = await fetch(`https://api.oropocket.com/public/prices/history?asset=gold&interval=day&from=${encodeURIComponent(from)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const historyRaw = historyRes.ok ? await historyRes.json() as any : null;
      const rows = Array.isArray(historyRaw?.data) ? historyRaw.data : Array.isArray(historyRaw?.data?.rows) ? historyRaw.data.rows : [];
      const goldPrev = [...rows].reverse().find((row: any) => Number(row?.buy ?? row?.buy_price ?? row?.price) > 0);
      const goldPrevPerGram = goldPrev ? Number(goldPrev.buy ?? goldPrev.buy_price ?? goldPrev.price) : NaN;
      if (Number.isFinite(goldPrevPerGram) && goldPrevPerGram > 0) {
        const previous10g = goldPrevPerGram * 10;
        goldChange24hAmount10g = gold10g - previous10g;
        goldChange24hPct = (goldChange24hAmount10g / previous10g) * 100;
      }
    } catch {}

    try {
      const from = new Date(Date.now() - 2 * 86400000).toISOString();
      const historyRes = await fetch(`https://api.oropocket.com/public/prices/history?asset=silver&interval=day&from=${encodeURIComponent(from)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const historyRaw = historyRes.ok ? await historyRes.json() as any : null;
      const rows = Array.isArray(historyRaw?.data) ? historyRaw.data : Array.isArray(historyRaw?.data?.rows) ? historyRaw.data.rows : [];
      const silverPrev = [...rows].reverse().find((row: any) => Number(row?.buy ?? row?.buy_price ?? row?.price) > 0);
      const silverPrevPerGram = silverPrev ? Number(silverPrev.buy ?? silverPrev.buy_price ?? silverPrev.price) : NaN;
      if (Number.isFinite(silverPrevPerGram) && silverPrevPerGram > 0) {
        const previousKg = silverPrevPerGram * 1000;
        silverChange24hAmountKg = silverKg - previousKg;
        silverChange24hPct = (silverChange24hAmountKg / previousKg) * 100;
      }
    } catch {}

    return { gold10g, silverKg, goldChange24hPct, goldChange24hAmount10g, silverChange24hPct, silverChange24hAmountKg, asOf: raw.data?.timestamp ?? new Date().toISOString() };
  } catch { return null; }
}

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async (): Promise<MetalPrices> => {
  const quote = await getIndianMetalPrices();
  if (!quote) throw new Error("Live Indian Gold/Silver rate is temporarily unavailable");
  const { gold10g, silverKg } = quote;
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
  const goldSignal = gold10g <= goldDiscount40Price10g ? "BUY" : "WAIT";
  return { gold10g, silverKg, goldChange24hPct: quote.goldChange24hPct, goldChange24hAmount10g: quote.goldChange24hAmount10g, silverChange24hPct: quote.silverChange24hPct, silverChange24hAmountKg: quote.silverChange24hAmountKg, gold5yHigh10g, goldDiscount10Price10g, goldDiscount20Price10g, goldDiscount30Price10g, goldDiscount40Price10g, silver5yHighKg, silver25PriceKg, silver35PriceKg, silver45PriceKg, silver50PriceKg, silver55PriceKg, goldSignal, asOf: quote.asOf, source: "Live Indian bullion quote" };
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
  const metals = useQuery({ queryKey: ["precious-metals-india-live-v3"], queryFn: () => fetchPreciousMetals(), staleTime: 30000, refetchInterval: 60000, refetchOnWindowFocus: true, retry: 2 });
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Live Indian bullion quote">
    <div className="grid gap-3 sm:grid-cols-2">
      <Panel className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">Gold 999</div><div className="mt-1 text-xs text-muted">Live Indian quote · ₹ / 10g · 999 fine</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{metals.data?.gold10g != null ? formatINR(metals.data.gold10g) : metals.isLoading ? "Loading…" : "Price unavailable"}</div><div className="mt-1 text-sm font-medium tabular">{metals.data?.goldChange24hPct != null && metals.data?.goldChange24hAmount10g != null ? <span className={metals.data.goldChange24hPct > 0 ? "text-up" : metals.data.goldChange24hPct < 0 ? "text-down" : "text-muted"}>{metals.data.goldChange24hPct > 0 ? "↑" : metals.data.goldChange24hPct < 0 ? "↓" : "→"} {metals.data.goldChange24hAmount10g >= 0 ? "+" : "-"}{formatINR(Math.abs(metals.data.goldChange24hAmount10g))} ({metals.data.goldChange24hPct >= 0 ? "+" : ""}{metals.data.goldChange24hPct.toFixed(2)}%) today</span> : <span className="text-muted">Today’s change unavailable</span>}</div><div className="mt-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2"><div className="text-sm font-semibold text-fg">5-Year High: {formatINR(metals.data?.gold5yHigh10g ?? 170000)}</div></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[{ label: "10% discount", value: metals.data?.goldDiscount10Price10g }, { label: "20% discount", value: metals.data?.goldDiscount20Price10g }, { label: "30% discount", value: metals.data?.goldDiscount30Price10g }, { label: "40% discount", value: metals.data?.goldDiscount40Price10g }].map((row) => <div key={row.label} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{row.label}</div><div className="mt-1 tabular text-sm text-fg">{row.value != null ? formatINR(row.value) : "—"}</div></div>)}</div><div className="mt-3 text-xs text-muted">Rule: BUY when current price ≤ 60% of 5-Year High</div></Panel>
      <Panel className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">Silver 999</div><div className="mt-1 text-xs text-muted">Live Indian quote · ₹ / kg · 999 fine</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{metals.data?.silverKg != null ? formatINR(metals.data.silverKg) : metals.isLoading ? "Loading…" : "Price unavailable"}</div><div className="mt-1 text-sm font-medium tabular">{metals.data?.silverChange24hPct != null && metals.data?.silverChange24hAmountKg != null ? <span className={metals.data.silverChange24hPct > 0 ? "text-up" : metals.data.silverChange24hPct < 0 ? "text-down" : "text-muted"}>{metals.data.silverChange24hPct > 0 ? "↑" : metals.data.silverChange24hPct < 0 ? "↓" : "→"} {metals.data.silverChange24hAmountKg >= 0 ? "+" : "-"}{formatINR(Math.abs(metals.data.silverChange24hAmountKg))} ({metals.data.silverChange24hPct >= 0 ? "+" : ""}{metals.data.silverChange24hPct.toFixed(2)}%) today</span> : <span className="text-muted">Today’s change unavailable</span>}</div><div className="mt-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2"><div className="text-sm font-semibold text-fg">5-Year High: {formatINR(metals.data?.silver5yHighKg ?? 400000)}</div></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{[{ label: "25%", value: metals.data?.silver25PriceKg }, { label: "35%", value: metals.data?.silver35PriceKg }, { label: "45%", value: metals.data?.silver45PriceKg }, { label: "50%", value: metals.data?.silver50PriceKg }, { label: "55%", value: metals.data?.silver55PriceKg }].map((row) => <div key={row.label} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{row.label}</div><div className="mt-1 tabular text-sm text-fg">{row.value != null ? formatINR(row.value) : "—"}</div></div>)}</div><div className="mt-3 text-xs text-muted">Silver rule levels are calculated from the fixed 5-Year High reference.</div></Panel>
    </div><p className="mt-2 text-[11px] text-subtle">Source: live Indian bullion buy quote, converted from ₹/gram to Gold ₹/10g and Silver ₹/kg. Quote timestamp is supplied by the price feed. Data is refreshed by the app every 60 seconds.</p>
  </Section>;
}
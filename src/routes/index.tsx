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

type MetalPrices = { gold10g: number | null; silverKg: number | null; asOf: string | null; source: string };
type MetalsResponse = { status?: string; timestamp?: string; error_message?: string; error?: string; metals?: Record<string, unknown> };
const TROY_OUNCE_GRAMS = 31.1034768;

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async (): Promise<MetalPrices> => {
  const apiKey = (process.env.METAL || "").trim();
  if (!apiKey) throw new Error("METAL API key is not configured in Vercel");

  const url = new URL("https://api.metals.dev/v1/latest");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("currency", "INR");
  url.searchParams.set("unit", "toz");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" }, cache: "no-store" });
  const raw = await res.json().catch(() => ({})) as MetalsResponse;
  if (!res.ok || raw.status !== "success") throw new Error(raw.error_message || raw.error || `Metals.Dev HTTP ${res.status}`);

  const metals = raw.metals || {};
  const goldToz = Number(metals.gold);
  const silverToz = Number(metals.silver);
  if (!Number.isFinite(goldToz) || !Number.isFinite(silverToz) || goldToz <= 0 || silverToz <= 0) throw new Error("Metals.Dev returned invalid gold/silver rates");

  return {
    gold10g: goldToz * 10 / TROY_OUNCE_GRAMS,
    silverKg: silverToz * 1000 / TROY_OUNCE_GRAMS,
    asOf: raw.timestamp ?? null,
    source: "Metals.Dev",
  };
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
  const metals = useQuery({ queryKey: ["precious-metals-metalsdev-v4"], queryFn: () => fetchPreciousMetals(), staleTime: 30000, refetchInterval: 60000, refetchOnWindowFocus: true, retry: 2 });
  const cards = [
    { name: "Gold", price: metals.data?.gold10g ?? null, unit: "₹ / 10g" },
    { name: "Silver", price: metals.data?.silverKg ?? null, unit: "₹ / kg" },
  ];
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Live Metals.Dev prices in Indian rupees">
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map(m => <Panel key={m.name} className="p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">{m.name}</div><div className="mt-1 text-xs text-muted">Metals.Dev · {m.unit}</div></div><div className="text-xs text-muted">INR</div></div>
        <div className="mt-2 text-2xl font-semibold tabular text-fg">{m.price != null ? formatINR(m.price) : metals.isLoading ? "Loading…" : "Price unavailable"}</div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[10,20,30,40].map(d => <div key={d} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{d}% discount</div><div className="mt-1 tabular text-sm text-fg">{m.price != null ? formatINR(m.price * (1-d/100)) : "—"}</div></div>)}</div>
      </Panel>)}
    </div>
    <p className="mt-2 text-[11px] text-subtle">Source: Metals.Dev live market API. Gold is shown per 10g and Silver per kg. Prices are reference market prices, not jewellery retail prices{metals.data?.asOf ? ` · ${metals.data.asOf}` : ""}.</p>
  </Section>;
}

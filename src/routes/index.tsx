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

function n(v: unknown) { const x = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) && x > 0 ? x : null; }

async function etMetal(symbol: "GOLD" | "SILVER") {
  const url = `https://economictimes.indiatimes.com/commoditysummary/symbol-${symbol}.cms`;
  const r = await fetch(url, { cache: "no-store", headers: { Accept: "text/html,application/xhtml+xml,*/*", "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`Economic Times HTTP ${r.status}`);
  const html = await r.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ");
  const unit = symbol === "GOLD" ? "Per 10 GRMS" : "Per 1 KGS";
  const match = text.match(new RegExp(`MCX\\s+[0-9:.]+\\s*(?:AM|PM)?\\s*IST\\s*\\|[\\s\\S]{0,160}?(\\d{5,7}(?:\\.\\d+)?)\\s+${unit}`, "i"));
  const price = n(match?.[1]);
  if (price == null) throw new Error(`${symbol} MCX price unavailable`);
  return price;
}

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async () => {
  const [gold, silver] = await Promise.all([etMetal("GOLD"), etMetal("SILVER")]);
  return { gold10g: gold, silverKg: silver, source: "Economic Times · MCX", asOf: new Date().toISOString() };
});

function Home() {
  const clock = getMarketClock(); const dash = useQuery({ queryKey:["dashboard"], queryFn:()=>fetchDashboard(), refetchInterval:60000 });
  return <div><p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p><div className="flex items-start justify-between gap-3"><div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div><Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link></div><div className="mt-5"><SymbolSearch /></div><PreciousMetals /><Section title="Overview" hint="NIFTY, Sensex and sector indices">{dash.isLoading?<div className="flex gap-2 overflow-x-auto pb-1">{Array.from({length:5}).map((_,i)=><SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div>:dash.isError?<Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel>:<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map(row=><IndexCard key={row.quote.symbol} name={row.short} quote={row.quote}/>)}</div>}</Section><Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener"><div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map(q=><MoverRow key={q.symbol} quote={q}/>)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map(q=><MoverRow key={q.symbol} quote={q}/>)}</Panel></div></Section><p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p></div>;
}

function PreciousMetals() {
  const metals=useQuery({queryKey:["precious-metals-mcx-v2"],queryFn:()=>fetchPreciousMetals(),staleTime:15000,refetchInterval:30000,retry:1});
  const cards=[{name:"Gold",price:metals.data?.gold10g??null,unit:"₹ / 10g"},{name:"Silver",price:metals.data?.silverKg??null,unit:"₹ / kg"}]; const fmt=(v:number)=>`₹${Math.round(v).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Current MCX price"><div className="grid gap-3 sm:grid-cols-2">{cards.map(m=><Panel key={m.name} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">{m.name}</div><div className="mt-1 text-xs text-muted">MCX · {m.unit}</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{m.price!=null?fmt(m.price):metals.isLoading?"Loading…":"Price unavailable"}</div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[10,20,30,40].map(d=><div key={d} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{d}% discount</div><div className="mt-1 tabular text-sm text-fg">{m.price!=null?fmt(m.price*(1-d/100)):"—"}</div></div>)}</div></Panel>)}</div><p className="mt-2 text-[11px] text-subtle">Source: Economic Times MCX feed. Gold ₹/10g and Silver ₹/kg.</p></Section>;
}

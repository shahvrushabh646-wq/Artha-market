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

const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const res = await fetch("https://api.oropocket.com/public/prices", { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    if (res.ok) {
      const raw = await res.json() as unknown;
      const root = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const read = (name: string) => {
        const item = root[name];
        if (!item || typeof item !== "object") return null;
        const obj = item as Record<string, unknown>;
        for (const key of ["sell", "sell_price", "price", "buy", "buy_price", "rate"]) {
          const value = obj[key];
          if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
        }
        return null;
      };
      const goldGram = read("gold");
      const silverGram = read("silver");
      if (goldGram !== null || silverGram !== null) return { gold10g: goldGram !== null ? goldGram * 10 : null, silverKg: silverGram !== null ? silverGram * 1000 : null, source: "Oropocket · India rates" };
    }
  } catch {}

  try {
    const urls = ["https://economictimes.indiatimes.com/commoditysummary/symbol-GOLD.cms", "https://economictimes.indiatimes.com/commoditysummary/symbol-SILVER.cms"];
    const pages = await Promise.all(urls.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,application/xhtml+xml,*/*" } });
        return res.ok ? await res.text() : "";
      } catch { return ""; }
    }));
    const clean = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ");
    const goldText = clean(pages[0]);
    const silverText = clean(pages[1]);
    const goldMatch = goldText.match(/MCX\s+[0-9:.]+\s*(?:AM|PM)?\s*IST\s*\|[\s\S]{0,80}?(\d{5,7}(?:\.\d+)?)\s+Per\s+10\s*GRMS/i);
    const silverMatch = silverText.match(/MCX\s+[0-9:.]+\s*(?:AM|PM)?\s*IST\s*\|[\s\S]{0,80}?(\d{5,8}(?:\.\d+)?)\s+Per\s+1\s*KGS/i);
    const gold = goldMatch ? Number(goldMatch[1]) : null;
    const silver = silverMatch ? Number(silverMatch[1]) : null;
    if (Number.isFinite(gold) || Number.isFinite(silver)) return { gold10g: Number.isFinite(gold) ? gold : null, silverKg: Number.isFinite(silver) ? silver : null, source: "Economic Times · MCX" };
  } catch {}

  throw new Error("Precious metal prices unavailable");
});

function Home() {
  const clock = getMarketClock();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60_000 });
  return <div><p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p><div className="flex items-start justify-between gap-3"><div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div><Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link></div><div className="mt-5"><SymbolSearch /></div><PreciousMetals /><Section title="Overview" hint="NIFTY, Sensex and sector indices">{dash.isLoading ? <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div> : dash.isError ? <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel> : <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map((row) => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}</div>}</Section><Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener">{dash.isLoading ? <div className="grid gap-3 sm:grid-cols-2"><SkeletonBlock className="h-56" /><SkeletonBlock className="h-56" /></div> : <div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel></div>}</Section><p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p></div>;
}

function PreciousMetals() {
  const metals = useQuery({ queryKey: ["india-precious-metals"], queryFn: () => fetchPreciousMetals(), staleTime: 30_000, refetchInterval: 30_000, retry: 2 });
  const cards = [{ name: "Gold", price: metals.data?.gold10g ?? null, unit: "₹ / 10g" }, { name: "Silver", price: metals.data?.silverKg ?? null, unit: "₹ / kg" }];
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return <Section title="Gold & Silver" hint="Current Indian bullion rates"><div className="grid gap-3 sm:grid-cols-2">{cards.map((m) => <Panel key={m.name} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-medium text-fg">{m.name}</div><div className="mt-1 text-xs text-muted">India · {m.unit}</div></div><div className="text-xs text-muted">INR</div></div><div className="mt-2 text-2xl font-semibold tabular text-fg">{m.price != null ? formatINR(m.price) : metals.isLoading ? "Loading…" : "—"}</div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[10, 20, 30, 40].map((d) => <div key={d} className="rounded-lg bg-surface-2 p-2"><div className="text-xs text-muted">{d}% discount</div><div className="mt-1 tabular text-sm text-fg">{m.price != null ? formatINR(m.price * (1 - d / 100)) : "—"}</div></div>)}</div></Panel>)}</div><p className="mt-2 text-[11px] text-subtle">Source: Oropocket India rates, with Economic Times MCX fallback. Gold ₹/10g and Silver ₹/kg. Rates are reference bullion prices and can differ from jewellery-shop rates.</p></Section>;
}

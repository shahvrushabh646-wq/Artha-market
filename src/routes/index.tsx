import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { SymbolSearch } from "@/components/symbol-search";
import { IndexCard, MoverRow, Panel, Section, SkeletonBlock } from "@/components/widgets";
import { DATA_NOTE } from "@/lib/market/config";
import { getMarketClock } from "@/lib/market/math";
import { fetchDashboard } from "@/lib/market/server";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const clock = getMarketClock();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard(), refetchInterval: 60_000 });

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-subtle">Indian cash market</p>
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">The tape, on your phone.</h1><p className="mt-2 max-w-xl text-sm text-muted">{clock.label}</p></div>
        <Link to="/suggestions" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg shadow-[var(--shadow-border)]"><Lightbulb className="size-4" /> Suggestions</Link>
      </div>
      <div className="mt-5"><SymbolSearch /></div>
      <PreciousMetals />
      <Section title="Overview" hint="NIFTY, Sensex and sector indices">
        {dash.isLoading ? <div className="flex gap-2 overflow-x-auto pb-1">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-24 min-w-[9.5rem] flex-1" />)}</div> : dash.isError ? <Panel><p className="text-sm text-muted">Index data is unavailable right now. Pull to refresh in a minute.</p></Panel> : <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">{dash.data?.indices.map((row) => <IndexCard key={row.quote.symbol} name={row.short} quote={row.quote} />)}</div>}
      </Section>
      <Section title="Market movers" hint="From a liquid large-cap NSE basket — not a full-exchange screener">
        {dash.isLoading ? <div className="grid gap-3 sm:grid-cols-2"><SkeletonBlock className="h-56" /><SkeletonBlock className="h-56" /></div> : <div className="grid gap-3 sm:grid-cols-2"><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-up">Top gainers</div>{dash.data?.gainers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel><Panel className="p-2"><div className="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.16em] text-down">Top losers</div>{dash.data?.losers.map((q) => <MoverRow key={q.symbol} quote={q} />)}</Panel></div>}
      </Section>
      <p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p>
    </div>
  );
}

function PreciousMetals() {
  const metals = useQuery({
    queryKey: ["mcx-precious-metals-inr"],
    queryFn: async () => {
      // Server-side scrape of the current MCX Gold/Silver table. Unlike the
      // old XAU conversion, these values are already Indian INR contract prices.
      const res = await fetch("https://mcxlive.org/", {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36", Accept: "text/html,*/*" },
      });
      if (!res.ok) throw new Error("MCX precious metal prices unavailable");
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ");

      const number = "([\\d,]+(?:\\.\\d+)?)";
      const goldMatch = text.match(new RegExp(`MCX Gold\\s+${number}\\s+[+-]?[\\d,]+(?:\\.\\d+)?\\s+[+-]?[\\d.]+%`, "i"));
      const silverMatch = text.match(new RegExp(`MCX Silver\\s+${number}\\s+[+-]?[\\d,]+(?:\\.\\d+)?\\s+[+-]?[\\d.]+%`, "i"));
      const gold = goldMatch ? Number(goldMatch[1].replace(/,/g, "")) : null;
      const silver = silverMatch ? Number(silverMatch[1].replace(/,/g, "")) : null;
      if (gold == null && silver == null) throw new Error("MCX precious metal prices unavailable");
      return { gold10g: Number.isFinite(gold) ? gold : null, silverKg: Number.isFinite(silver) ? silver : null };
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 2,
  });

  const cards = [
    { name: "Gold", price: metals.data?.gold10g ?? null, unit: "₹ / 10g", note: "MCX Gold · INR" },
    { name: "Silver", price: metals.data?.silverKg ?? null, unit: "₹ / kg", note: "MCX Silver · INR" },
  ];
  const formatINR = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;

  return <Section title="Gold & Silver" hint="Current Indian MCX prices">
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((m) => <Panel key={m.name} className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-sm font-medium text-fg">{m.name}</div><div className="mt-1 text-xs text-muted">{m.note} · {m.unit}</div></div>
          <div className="text-xs text-muted">INR</div>
        </div>
        <div className="mt-2 text-2xl font-semibold tabular text-fg">{m.price != null ? formatINR(m.price) : "—"}</div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[10, 20, 30, 40].map((d) => <div key={d} className="rounded-lg bg-surface-2 p-2">
            <div className="text-xs text-muted">{d}% discount</div>
            <div className="mt-1 tabular text-sm text-fg">{m.price != null ? formatINR(m.price * (1 - d / 100)) : "—"}</div>
          </div>)}
        </div>
      </Panel>)}
    </div>
    <p className="mt-2 text-[11px] text-subtle">Gold is shown per 10g and silver per kg. Prices are MCX futures reference values in INR and can differ from local jewellery-shop rates because of purity, GST, premiums and making charges.</p>
  </Section>;
}

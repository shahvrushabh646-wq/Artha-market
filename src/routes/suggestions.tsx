import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lightbulb, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchSuggestions } from "@/lib/market/suggestions";
import { displaySymbol } from "@/lib/market/config";
import { fmtCurrency } from "@/lib/market/math";
import type { Quote } from "@/lib/market/types";
import { Panel, Section, SignalBadge, SkeletonBlock } from "@/components/widgets";

export const Route = createFileRoute("/suggestions")({ component: Suggestions });

const STORAGE_KEY = "artha:suggestions:v2";

function readSavedSuggestions(): Quote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as Quote[] : [];
  } catch { return []; }
}

function indiaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function StockRow({ quote, todayTrigger }: { quote: Quote; todayTrigger: boolean }) {
  const isLow = (quote.price ?? 0) < 20;
  const level = (quote.high5y ?? 0) * (isLow ? 0.10 : 0.25);
  return (
    <Link to="/stock" search={{ symbol: quote.symbol, period: "1Y" }} className="block">
      <Panel className="p-3 transition hover:bg-surface-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-fg">{displaySymbol(quote.symbol)}</div>
            <div className="mt-1 text-xs text-muted">{isLow ? "90% Rule" : "75% Rule"} · Trigger ≤ {fmtCurrency(level)}</div>
          </div>
          <div className="text-right">
            <div className="tabular text-sm text-fg">{fmtCurrency(quote.price)}</div>
            <div className="mt-1 text-xs text-muted">5Y high {fmtCurrency(quote.high5y)}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <SignalBadge signal={quote.signal75 === "BUY" ? "BUY" : "WAIT"} />
          {todayTrigger && <span className="text-xs font-medium text-up">Triggered today</span>}
        </div>
      </Panel>
    </Link>
  );
}

function Suggestions() {
  const [saved, setSaved] = useState<Quote[]>(readSavedSuggestions);
  const q = useQuery({
    queryKey: ["suggestions-scanner-v2"],
    queryFn: () => fetchSuggestions(),
    initialData: saved.length ? saved : undefined,
    staleTime: 0,
    gcTime: 24 * 60 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 60_000,
  });
  const suggestions = q.data ?? saved;
  const today = indiaToday();
  const todayTriggers = useMemo(() => suggestions.filter(q => q.triggerDate === today && q.signal75 === "BUY"), [suggestions, today]);
  const todaySymbols = useMemo(() => new Set(todayTriggers.map(q => q.symbol)), [todayTriggers]);
  const otherStocks = useMemo(() => suggestions.filter(q => !todaySymbols.has(q.symbol)), [suggestions, todaySymbols]);

  useEffect(() => {
    if (!q.data?.length || typeof window === "undefined") return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(q.data)); setSaved(q.data); } catch {}
  }, [q.data]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-subtle">Artha scanner</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-fg">Suggestions</h1>
          <p className="mt-2 text-sm text-muted">Daily valuation triggers first, followed by all other scanned stocks.</p>
        </div>
        <button type="button" onClick={() => void q.refetch()} className="flex h-10 items-center gap-2 rounded-lg bg-surface-2 px-3 text-xs text-muted shadow-[var(--shadow-border)]" aria-label="Refresh suggestions">
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>

      <Section title="Today's triggers" hint="Stocks that crossed into the valuation trigger today">
        {q.isLoading && suggestions.length === 0 ? <div className="space-y-2"><SkeletonBlock className="h-20" /><SkeletonBlock className="h-20" /></div> : todayTriggers.length === 0 ? <Panel><div className="flex items-center gap-3"><Lightbulb className="size-5 text-muted" /><p className="text-sm text-muted">No stocks triggered the rule today.</p></div></Panel> : <div className="space-y-2">{todayTriggers.map(quote => <StockRow key={quote.symbol} quote={quote} todayTrigger />)}</div>}
      </Section>

      <Section title="All other stocks" hint={`Total scanned: ${otherStocks.length}`}>
        {q.isError && suggestions.length === 0 ? <Panel><p className="text-sm text-muted">Suggestions are temporarily unavailable. Try Refresh.</p></Panel> : otherStocks.length === 0 ? <Panel><p className="text-sm text-muted">No other scanned stocks are available yet.</p></Panel> : <div className="space-y-2">{otherStocks.map(quote => <StockRow key={quote.symbol} quote={quote} todayTrigger={false} />)}</div>}
      </Section>
      <p className="mt-6 text-xs text-subtle">The scanner refreshes automatically every 30 minutes and reorders today's triggers to the top. Data may be delayed.</p>
    </div>
  );
}

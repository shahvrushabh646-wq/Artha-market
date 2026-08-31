import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lightbulb, RefreshCw } from "lucide-react";
import { fetchSuggestions } from "@/lib/market/suggestions";
import { displaySymbol } from "@/lib/market/config";
import { fmtCurrency } from "@/lib/market/math";
import { Panel, Section, SignalBadge, SkeletonBlock } from "@/components/widgets";

export const Route = createFileRoute("/suggestions")({ component: Suggestions });

function Suggestions() {
  const q = useQuery({
    queryKey: ["suggestions-scanner"],
    queryFn: () => fetchSuggestions(),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
  const suggestions = q.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-subtle">Artha scanner</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-fg">Suggestions</h1>
          <p className="mt-2 text-sm text-muted">Stocks currently triggering your valuation rule.</p>
        </div>
        <button type="button" onClick={() => void q.refetch()} className="flex h-10 items-center gap-2 rounded-lg bg-surface-2 px-3 text-xs text-muted shadow-[var(--shadow-border)]" aria-label="Refresh suggestions">
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>
      <Section title="Rule triggers" hint="₹20 and above: 75% level · Below ₹20: 90% level">
        {q.isLoading ? <div className="space-y-2"><SkeletonBlock className="h-20" /><SkeletonBlock className="h-20" /></div> : q.isError ? <Panel><p className="text-sm text-muted">Suggestions are temporarily unavailable. Try again.</p></Panel> : suggestions.length === 0 ? <Panel><div className="flex items-center gap-3"><Lightbulb className="size-5 text-muted" /><p className="text-sm text-muted">No stocks are currently triggering the rule.</p></div></Panel> : <div className="space-y-2">{suggestions.map((quote) => { const isLow = (quote.price ?? 0) < 20; const level = isLow ? (quote.high5y ?? 0) * 0.10 : (quote.high5y ?? 0) * 0.25; return <Link key={quote.symbol} to="/stock" search={{ symbol: quote.symbol, period: "1Y" }} className="block"><Panel className="p-3 transition hover:bg-surface-2"><div className="flex items-center justify-between gap-3"><div><div className="font-medium text-fg">{displaySymbol(quote.symbol)}</div><div className="mt-1 text-xs text-muted">{isLow ? "90% Rule" : "75% Rule"} · Trigger ≤ {fmtCurrency(level)}</div></div><div className="text-right"><div className="tabular text-sm text-fg">{fmtCurrency(quote.price)}</div><div className="mt-1 text-xs text-muted">5Y high {fmtCurrency(quote.high5y)}</div></div></div><div className="mt-2"><SignalBadge signal="BUY" /></div></Panel></Link>; })}</div>}
      </Section>
      <p className="mt-6 text-xs text-subtle">Suggestions use batched 5-year market history. Data may be delayed or incomplete.</p>
    </div>
  );
}

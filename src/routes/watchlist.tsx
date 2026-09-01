import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { Signed } from "@/components/price";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, Panel, SignalBadge } from "@/components/widgets";
import { displaySymbol, normalizeSymbol } from "@/lib/market/config";
import { customValuation, fmtCurrency, fmtNumber, lastValid, periodHighLow, rsi, sma } from "@/lib/market/math";
import { fetchWatchPack } from "@/lib/market/server";
import { useDesk } from "@/lib/store";

export const Route = createFileRoute("/watchlist")({ component: WatchPage });

function WatchPage() {
  const watchlist = useDesk((s) => s.watchlist);
  const addWatch = useDesk((s) => s.addWatch);
  const removeWatch = useDesk((s) => s.removeWatch);
  const [raw, setRaw] = useState("");
  const [showDailyAlert, setShowDailyAlert] = useState(false);

  const pack = useQuery({ queryKey: ["watch", watchlist], queryFn: () => fetchWatchPack({ data: { symbols: watchlist } }), enabled: watchlist.length > 0, refetchInterval: 90_000 });

  const rows = useMemo(() => {
    const quotes = new Map((pack.data?.quotes ?? []).map((q) => [q.symbol, q]));
    const hist = new Map((pack.data?.packs ?? []).map((p) => [p.symbol, p]));
    return [...watchlist].sort((a,b) => displaySymbol(a).localeCompare(displaySymbol(b), undefined, { sensitivity: "base" })).map((symbol) => {
      const q = quotes.get(symbol); const h = hist.get(symbol); const closes = (h?.bars1y ?? []).map((b) => b.c);
      const s20 = lastValid(sma(closes,20)); const s50 = lastValid(sma(closes,50)); const s200 = lastValid(sma(closes,200));
      const r = lastValid(rsi(closes,14)); const hl1 = periodHighLow(h?.bars1y ?? []); const hl5 = periodHighLow(h?.bars5y ?? []);
      const val = customValuation(hl5.high, q?.price ?? null);
      return { symbol, q, s20, s50, s200, r, hl1, signal: val?.signal ?? null };
    });
  }, [pack.data, watchlist]);

  const triggered = rows.filter((row) => row.signal);

  useEffect(() => {
    if (pack.isLoading || watchlist.length === 0) return;
    const today = new Date().toLocaleDateString("en-CA");
    const key = "artha_watchlist_alert_date";
    if (localStorage.getItem(key) === today) return;
    localStorage.setItem(key, today);
    if (rows.some((row) => row.signal)) setShowDailyAlert(true);
  }, [pack.isLoading, watchlist.length, rows]);

  return (
    <div>
      {showDailyAlert && triggered.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true">
          <Panel className="w-full max-w-md p-5">
            <h2 className="text-xl font-semibold">🔔 Watchlist Alert</h2>
            <p className="mt-1 text-sm text-muted">Today’s watchlist triggers:</p>
            <div className="mt-4 space-y-2">
              {triggered.map((row) => <div key={row.symbol} className="flex items-center justify-between rounded-md border p-3"><span className="font-medium">{displaySymbol(row.symbol)}</span><SignalBadge signal={row.signal!} /></div>)}
            </div>
            <Button className="mt-4 w-full" onClick={() => setShowDailyAlert(false)}>OK</Button>
          </Panel>
        </div>
      )}
      <h1 className="font-display text-3xl tracking-tight">Watchlist</h1>
      <p className="mt-1 text-sm text-muted">Live price, 52-week range, RSI and the 25%-of-high rule.</p>
      <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!raw.trim()) return; const added = addWatch(raw); toast(added ? `Added ${normalizeSymbol(raw)}` : "Already watching"); setRaw(""); }}>
        <Input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Add symbol" autoCapitalize="characters" /><Button type="submit" className="shrink-0">Add</Button>
      </form>
      <div className="mt-5 space-y-2">
        {rows.length === 0 ? <Empty title="Nothing on the list" body="Add RELIANCE, TCS or any NSE name to start tracking." /> : rows.map((row) => (
          <Panel key={row.symbol} className="p-3">
            <div className="flex items-start justify-between gap-3"><Link to="/stock" search={{ symbol: row.symbol, period: "1Y" }} className="min-w-0"><div className="font-medium text-fg">{displaySymbol(row.symbol)}</div><div className="truncate text-xs text-muted">{row.q?.name ?? row.symbol}</div></Link><div className="text-right"><div className="tabular text-fg">{fmtCurrency(row.q?.price ?? null)}</div><Signed value={row.q?.changePct ?? null} as="percent" className="text-xs" /></div></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted"><span>52W H <span className="tabular text-fg">{fmtCurrency(row.hl1.high ?? row.q?.high52w ?? null)}</span></span><span>52W L <span className="tabular text-fg">{fmtCurrency(row.hl1.low ?? row.q?.low52w ?? null)}</span></span><span>RSI <span className="tabular text-fg">{fmtNumber(row.r)}</span></span><span>SMA20 <span className="tabular text-fg">{fmtCurrency(row.s20)}</span></span><span>SMA50 <span className="tabular text-fg">{fmtCurrency(row.s50)}</span></span><span>SMA200 <span className="tabular text-fg">{fmtCurrency(row.s200)}</span></span></div>
            <div className="mt-3 flex items-center justify-between">{row.signal ? <SignalBadge signal={row.signal} /> : <span className="text-xs text-subtle">No signal</span>}<Button variant="ghost" size="sm" className="h-10" onClick={() => removeWatch(row.symbol)}>Remove</Button></div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

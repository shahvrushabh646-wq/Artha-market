import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Bookmark, CandlestickChart, Eye, LayoutGrid, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { APP_NAME, displaySymbol } from "@/lib/market/config";
import { getMarketClock } from "@/lib/market/math";
import { fetchWatchPack } from "@/lib/market/server";
import { useDesk } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: LayoutGrid },
  { to: "/stock", label: "Analyze", icon: CandlestickChart },
  { to: "/portfolio", label: "Book", icon: Bookmark },
  { to: "/watchlist", label: "Watch", icon: Eye },
  { to: "/alerts", label: "Alerts", icon: Bell },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const clock = getMarketClock();
  const watchlist = useDesk((s) => s.watchlist);
  const watchPack = useQuery({
    queryKey: ["startup-watch-buy", watchlist],
    queryFn: () => fetchWatchPack({ data: { symbols: watchlist } }),
    enabled: watchlist.length > 0,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const buyStocks = (watchPack.data?.quotes ?? [])
    .filter((quote) => quote.ok && quote.high5y != null && quote.price != null && quote.price <= (quote.price < 20 ? quote.high5y * 0.10 : quote.high5y * 0.25))
    .map((quote) => ({ symbol: quote.symbol, price: quote.price }))
    .slice(0, 10);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/92 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex min-w-0 items-baseline gap-2">
            <span className="font-display text-xl tracking-tight text-fg">{APP_NAME}</span>
            <span className="hidden text-[11px] uppercase tracking-[0.18em] text-subtle sm:inline">Desk</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", clock.open ? "bg-up/15 text-up" : "bg-surface-2 text-muted")}>
              <span className={cn("size-1.5 rounded-full", clock.open ? "bg-up" : "bg-muted")} />
              {clock.open ? "Market open" : "Market closed"}
            </span>
            <Link to="/settings" aria-label="Settings" className="inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors duration-[var(--motion-quick)] hover:bg-surface-2 hover:text-fg">
              <Settings className="size-5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5">
        {buyStocks.length > 0 ? (
          <div className="mb-5 rounded-xl border-2 border-up/50 bg-up/10 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-up">🟢 WATCHLIST BUY ALERT</div>
            <p className="mt-1 text-xs text-muted">Buy signal found when the app opened.</p>
            <div className="mt-3 space-y-2">
              {buyStocks.map((stock) => (
                <Link key={stock.symbol} to="/stock" search={{ symbol: stock.symbol, period: "1Y" }} className="flex items-center justify-between rounded-lg bg-bg/60 px-3 py-2">
                  <span className="font-semibold text-fg">{displaySymbol(stock.symbol)}</span>
                  <span className="tabular text-sm font-bold text-up">BUY · ₹{stock.price?.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/94 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <ul className="mx-auto grid max-w-5xl grid-cols-5">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname === item.to || pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link to={item.to} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] tracking-wide transition-colors duration-[var(--motion-quick)]", active ? "text-fg" : "text-subtle")}>
                  <Icon className="size-5" strokeWidth={active ? 2.2 : 1.7} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Bookmark, CandlestickChart, Eye, LayoutGrid, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/market/config";
import { getMarketClock } from "@/lib/market/math";
import { cn } from "@/lib/utils";
import { WatchlistRuleNotifications } from "@/components/watchlist-rule-notifications";
import { OneSignalPush } from "@/components/onesignal-push";
import { ShareholdingPledge } from "@/components/shareholding-pledge";

const NAV = [
  { to: "/", label: "Home", icon: LayoutGrid },
  { to: "/stock", label: "Analyze", icon: CandlestickChart },
  { to: "/portfolio", label: "Book", icon: Bookmark },
  { to: "/watchlist", label: "Watch", icon: Eye },
  { to: "/alerts", label: "Alerts", icon: Bell },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const clock = getMarketClock();
  const stockSymbol = pathname === "/stock" ? new URLSearchParams(searchStr).get("symbol") ?? "RELIANCE.NS" : null;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <OneSignalPush />
      <WatchlistRuleNotifications />
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
        {children}
        {stockSymbol ? <ShareholdingPledge symbol={stockSymbol} /> : null}
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

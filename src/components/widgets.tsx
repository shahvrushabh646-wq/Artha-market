import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { displaySymbol } from "@/lib/market/config";
import { fmtCurrency } from "@/lib/market/math";
import type { Quote } from "@/lib/market/types";
import { cn } from "@/lib/utils";
import { PriceBlock, Signed } from "./price";
import { Badge } from "./ui/badge";

export function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl tracking-tight text-fg">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]", className)}>{children}</div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">{label}</div>
      <div className="mt-1 tabular text-base text-fg">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function IndexCard({ name, quote }: { name: string; quote: Quote }) {
  return (
    <div className="min-w-[9.5rem] flex-1 rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
      <div className="text-[11px] uppercase tracking-[0.16em] text-subtle">{name}</div>
      <div className="mt-2 tabular text-lg text-fg">{fmtCurrency(quote.price, "", 2)}</div>
      <div className="mt-1">
        <Signed value={quote.changePct} as="percent" className="text-xs" />
      </div>
    </div>
  );
}

export function MoverRow({ quote }: { quote: Quote }) {
  return (
    <Link
      to="/stock"
      search={{ symbol: quote.symbol, period: "1Y" }}
      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors duration-[var(--motion-quick)] hover:bg-surface-2"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-fg">{displaySymbol(quote.symbol)}</div>
        <div className="truncate text-xs text-muted">{quote.name}</div>
      </div>
      <div className="text-right">
        <div className="tabular text-sm text-fg">{fmtCurrency(quote.price)}</div>
        <Signed value={quote.changePct} as="percent" className="text-xs" />
      </div>
    </Link>
  );
}

export function QuoteHeader({ quote }: { quote: Quote }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl tracking-tight text-fg sm:text-3xl">{quote.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {quote.symbol}
          {quote.exchange ? ` · ${quote.exchange}` : ""}
        </p>
      </div>
      <PriceBlock price={quote.price} change={quote.change} changePct={quote.changePct} size="lg" />
    </div>
  );
}

export function SignalBadge({ signal }: { signal: "BUY" | "WAIT" | string }) {
  const buy = signal.includes("BUY");
  return <Badge tone={buy ? "buy" : "wait"}>{signal.includes("RULE") ? signal : buy ? "Buy zone" : "Wait"}</Badge>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Panel className="px-5 py-10 text-center">
      <h3 className="font-display text-lg text-fg">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Panel>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-2", className)} />;
}

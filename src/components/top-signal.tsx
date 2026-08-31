import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { fetchAnalysis } from "@/lib/market/server";
import { normalizeSymbol } from "@/lib/market/config";

type TopSignalProps = {
  signal: string | null | undefined;
  price75: number | null | undefined;
  currentPrice?: number | null;
};

export function TopSignal({ signal, price75, currentPrice }: TopSignalProps) {
  const buy = Boolean(signal?.includes("BUY"));
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const symbol = search?.get("symbol") || "RELIANCE.NS";
  const needsPrice = currentPrice == null;
  const live = useQuery({
    queryKey: ["top-signal-price", symbol],
    queryFn: () => fetchAnalysis({ data: { symbol: normalizeSymbol(symbol), period: "1Y" } }),
    enabled: needsPrice,
    staleTime: 60_000,
  });
  const livePrice = live.data?.quote?.price ?? null;
  const price = currentPrice ?? livePrice;
  const isLowPrice = price != null && price < 20;
  const rule = isLowPrice ? "90% Rule Signal" : "75% Rule Signal";
  const high5y = live.data?.bars5y?.length ? Math.max(...live.data.bars5y.map((b) => b.h)) : null;
  const threshold = high5y != null ? high5y * (isLowPrice ? 0.10 : 0.25) : price75;

  return (
    <div className={cn("mt-4 rounded-2xl border-2 p-4 text-center shadow-sm", buy ? "border-up/50 bg-up/10" : "border-down/50 bg-down/10")}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{rule}</div>
      <div className={cn("mt-1 text-3xl font-black tracking-tight", buy ? "text-up" : "text-down")}>
        {buy ? "🟢 BUY" : "🔴 WAIT"}
      </div>
      <div className="mt-1 text-sm text-muted">
        {threshold != null ? `Buy only at or below ₹${threshold.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "5Y history required"}
      </div>
    </div>
  );
}

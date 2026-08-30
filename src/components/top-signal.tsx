import { cn } from "@/lib/utils";

export function TopSignal({ signal, price75 }: { signal: string | null | undefined; price75: number | null | undefined }) {
  const buy = Boolean(signal?.includes("BUY"));
  const rule = signal?.includes("95% RULE") ? "95% Rule Signal" : "75% Rule Signal";
  return (
    <div className={cn("mt-4 rounded-2xl border-2 p-4 text-center shadow-sm", buy ? "border-up/50 bg-up/10" : "border-down/50 bg-down/10")}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{rule}</div>
      <div className={cn("mt-1 text-3xl font-black tracking-tight", buy ? "text-up" : "text-down")}>
        {buy ? "🟢 BUY" : "🔴 WAIT"}
      </div>
      <div className="mt-1 text-sm text-muted">
        {price75 != null ? `Buy only at or below ₹${price75.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "5Y history required"}
      </div>
    </div>
  );
}

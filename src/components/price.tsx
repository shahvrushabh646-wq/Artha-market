import { fmtChange, fmtCurrency, fmtPercent } from "@/lib/market/math";
import { cn } from "@/lib/utils";

export function Signed({
  value,
  as = "change",
  className,
}: {
  value: number | null | undefined;
  as?: "change" | "percent" | "currency";
  className?: string;
}) {
  const tone = value == null ? "text-muted" : value > 0 ? "text-up" : value < 0 ? "text-down" : "text-muted";
  const text = as === "percent" ? fmtPercent(value) : as === "currency" ? fmtCurrency(value) : fmtChange(value);
  return <span className={cn("tabular", tone, className)}>{text}</span>;
}

export function PriceBlock({
  price,
  change,
  changePct,
  size = "md",
}: {
  price: number | null;
  change: number | null;
  changePct: number | null;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "tabular font-medium tracking-tight text-fg",
          size === "lg" && "text-3xl",
          size === "md" && "text-xl",
          size === "sm" && "text-base",
        )}
      >
        {fmtCurrency(price)}
      </div>
      <div className={cn("mt-0.5 flex items-center gap-2 text-sm", size === "sm" && "text-xs")}>
        <Signed value={change} />
        <Signed value={changePct} as="percent" />
      </div>
    </div>
  );
}

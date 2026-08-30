import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "up" | "down" | "wait" | "buy" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "up" && "bg-up/15 text-up",
        tone === "down" && "bg-down/15 text-down",
        tone === "buy" && "bg-up/15 text-up",
        tone === "wait" && "bg-down/15 text-down",
        className,
      )}
      {...props}
    />
  );
}

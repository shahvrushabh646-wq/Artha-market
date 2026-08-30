import type { Quote } from "./types";

/** Return the best available price without ever converting missing data to zero. */
export function hasValidPrice(quote: Quote | null | undefined): boolean {
  return quote?.price != null && Number.isFinite(quote.price) && quote.price > 0;
}

export function lastPriceLabel(quote: Quote | null | undefined): string | null {
  if (!quote?.lastPriceTime) return null;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(quote.lastPriceTime * 1000));
}

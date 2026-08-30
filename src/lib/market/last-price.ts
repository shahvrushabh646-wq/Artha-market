import type { Bar, Quote } from "./types";

/** Build a quote from the last valid historical bar when the live quote is stale/missing. */
export function withHistoricalFallback(quote: Quote, bars: Bar[]): Quote {
  if (quote.price != null && quote.price > 0) return quote;
  const last = [...bars].reverse().find((bar) => Number.isFinite(bar.c) && bar.c > 0);
  if (!last) return quote;
  return {
    ...quote,
    price: last.c,
    previousClose: last.c,
    change: 0,
    changePct: 0,
    lastPriceTime: last.t,
    ok: true,
  };
}

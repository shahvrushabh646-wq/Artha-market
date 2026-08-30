import type { Bar, Quote } from "./types";

/**
 * Use the most recent valid trading bar when the live quote is missing/stale.
 * This is especially important on NSE/BSE weekends, exchange holidays, and
 * when Yahoo's intraday endpoint temporarily returns no regular-market price.
 */
export function withHistoricalFallback(
  quote: Quote,
  bars: Bar[],
  forceHistorical = false,
): Quote {
  const last = [...bars]
    .reverse()
    .find((bar) => Number.isFinite(bar.c) && bar.c > 0);

  if (!last) return quote;
  if (!forceHistorical && quote.price != null && quote.price > 0) return quote;

  const previous = quote.previousClose ?? last.c;
  const change = quote.price != null && !forceHistorical
    ? Math.round((quote.price - previous) * 100) / 100
    : 0;
  const changePct = previous > 0 && quote.price != null && !forceHistorical
    ? Math.round(((quote.price - previous) / previous) * 10000) / 100
    : 0;

  return {
    ...quote,
    price: last.c,
    previousClose: previous,
    change,
    changePct,
    lastPriceTime: last.t,
    ok: true,
  };
}

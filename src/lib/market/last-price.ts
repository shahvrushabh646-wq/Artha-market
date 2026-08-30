import type { Bar, Quote } from "./types";

/**
 * Use the most recent valid trading bar when the live quote is missing/stale.
 * This is important on NSE/BSE weekends, exchange holidays, and when the
 * live quote endpoint temporarily returns no valid regular-market price.
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

  // During normal market hours, keep a valid live quote.
  if (!forceHistorical && quote.price != null && quote.price > 0) {
    return quote;
  }

  const previousClose =
    quote.previousClose != null && quote.previousClose > 0
      ? quote.previousClose
      : last.c;

  // If we are using the historical close, calculate the move against the
  // previous close only when a distinct previous close is available.
  const historicalPrice = last.c;

  const change =
    previousClose > 0
      ? Math.round((historicalPrice - previousClose) * 100) / 100
      : 0;

  const changePct =
    previousClose > 0
      ? Math.round(
          ((historicalPrice - previousClose) / previousClose) * 10000,
        ) / 100
      : 0;

  return {
    ...quote,
    price: historicalPrice,
    previousClose,
    change,
    changePct,
    lastPriceTime: last.t,
    ok: true,
  };
}

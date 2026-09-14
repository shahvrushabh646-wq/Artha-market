import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeSymbol, displaySymbol } from "./config";
import type { Bar, Quote } from "./types";

type YahooResult = { bars: Bar[]; meta: Record<string, unknown> };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? v as Record<string, unknown> : null;
}

async function yahoo(symbol: string, range: string, interval: string): Promise<YahooResult> {
  const params = new URLSearchParams({ range, interval, includePrePost: "false" });
  let lastError: unknown = null;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const res = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`, {
        headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*", "Accept-Language": "en-US,en;q=0.9" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
      const raw = await res.json();
      const chart = rec(raw)?.chart;
      const result = rec((Array.isArray(rec(chart)?.result) ? rec(chart)?.result : [])[0]);
      if (!result) throw new Error("Yahoo returned no result");
      const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
      const indicators = rec(result.indicators);
      const q = rec((Array.isArray(indicators?.quote) ? indicators.quote : [])[0]);
      const opens = Array.isArray(q?.open) ? q.open : [];
      const highs = Array.isArray(q?.high) ? q.high : [];
      const lows = Array.isArray(q?.low) ? q.low : [];
      const closes = Array.isArray(q?.close) ? q.close : [];
      const volumes = Array.isArray(q?.volume) ? q.volume : [];
      const bars: Bar[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const t = num(timestamps[i]);
        const o = num(opens[i]);
        const h = num(highs[i]);
        const l = num(lows[i]);
        const c = num(closes[i]);
        if (t != null && o != null && h != null && l != null && c != null) bars.push({ t, o, h, l, c, v: num(volumes[i]) ?? 0 });
      }
      return { bars, meta: rec(result.meta) ?? {} };
    } catch (e) { lastError = e; }
  }
  throw lastError instanceof Error ? lastError : new Error("Yahoo unavailable");
}

function quoteFromBars(symbol: string, bars: Bar[], meta: Record<string, unknown>): Quote {
  const last = bars.at(-1);
  const prev = bars.at(-2);
  const metaPrice = num(meta.regularMarketPrice);
  const price = metaPrice ?? last?.c ?? null;
  const previous = num(meta.chartPreviousClose) ?? num(meta.previousClose) ?? prev?.c ?? null;
  const change = price != null && previous != null ? price - previous : null;
  const high52w = num(meta.fiftyTwoWeekHigh) ?? (bars.length ? Math.max(...bars.map(b => b.h)) : null);
  const low52w = num(meta.fiftyTwoWeekLow) ?? (bars.length ? Math.min(...bars.map(b => b.l)) : null);
  return {
    symbol,
    name: typeof meta.longName === "string" ? meta.longName : typeof meta.shortName === "string" ? meta.shortName : displaySymbol(symbol),
    price,
    previousClose: previous,
    change: change != null ? Math.round(change * 100) / 100 : null,
    changePct: change != null && previous ? Math.round(change / previous * 10000) / 100 : null,
    currency: typeof meta.currency === "string" ? meta.currency : "INR",
    exchange: typeof meta.fullExchangeName === "string" ? meta.fullExchangeName : typeof meta.exchangeName === "string" ? meta.exchangeName : null,
    high52w,
    low52w,
    high5y: null,
    low5y: null,
    price75: null,
    signal75: null,
    volume: num(meta.regularMarketVolume) ?? last?.v ?? null,
    dayHigh: num(meta.regularMarketDayHigh) ?? null,
    dayLow: num(meta.regularMarketDayLow) ?? null,
    ok: price != null,
  };
}

export const fetchWatchlistLive = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ symbols: z.array(z.string()).max(40) }).parse(data))
  .handler(async ({ data }) => {
    const results = await Promise.all(data.symbols.map(async raw => {
      const symbol = normalizeSymbol(raw);
      try {
        const [oneYear, fiveYear] = await Promise.all([yahoo(symbol, "1y", "1d"), yahoo(symbol, "5y", "1d")]);
        const q = quoteFromBars(symbol, oneYear.bars, fiveYear.meta);
        const high5y = fiveYear.bars.length ? Math.max(...fiveYear.bars.map(b => b.h)) : null;
        const low5y = fiveYear.bars.length ? Math.min(...fiveYear.bars.map(b => b.l)) : null;
        const price75 = high5y != null ? Math.round(high5y * 0.25 * 100) / 100 : null;
        return {
          quote: { ...q, high5y, low5y, price75, signal75: q.price != null && price75 != null ? (q.price <= price75 ? "BUY" : "WAIT") : null },
          pack: { symbol, bars1y: oneYear.bars, bars5y: fiveYear.bars },
        };
      } catch {
        return { quote: { symbol, name: displaySymbol(symbol), price: null, previousClose: null, change: null, changePct: null, currency: "INR", exchange: null, high52w: null, low52w: null, high5y: null, low5y: null, price75: null, signal75: null, volume: null, dayHigh: null, dayLow: null, ok: false } satisfies Quote, pack: { symbol, bars1y: [], bars5y: [] } };
      }
    }));
    return { quotes: results.map(x => x.quote), packs: results.map(x => x.pack) };
  });

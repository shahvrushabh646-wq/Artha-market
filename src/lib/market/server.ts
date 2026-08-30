import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CHART_PERIODS, INDICES, MOVERS_UNIVERSE, PERIOD_MAP, displaySymbol, normalizeSymbol, type ChartPeriod } from "./config";
import type { Bar, Dividend, Quote, SearchHit } from "./types";

const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/122 Safari/537.36";
type CacheEntry = { exp: number; val: unknown };
type YahooMeta = { currency?: string; symbol?: string; exchangeName?: string; fullExchangeName?: string; regularMarketPrice?: number; regularMarketChangePercent?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number; regularMarketDayHigh?: number; regularMarketDayLow?: number; regularMarketVolume?: number; longName?: string; shortName?: string; chartPreviousClose?: number; previousClose?: number };
const cache = new Map<string, CacheEntry>();

function record(v: unknown): Record<string, unknown> | null { return v && typeof v === "object" ? v as Record<string, unknown> : null; }
function number(v: unknown): number | null { if (typeof v === "number" && Number.isFinite(v)) return v; if (typeof v === "string" && v.trim()) { const n = Number(v); return Number.isFinite(n) ? n : null; } return null; }
function string(v: unknown): string | null { return typeof v === "string" && v.trim() ? v : null; }

async function getJson(url: string, headers?: HeadersInit): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*", ...headers }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val as T;
  const value = await fn();
  cache.set(key, { exp: Date.now() + ttl, val: value });
  return value;
}

function emptyQuote(symbol: string): Quote {
  return { symbol, name: displaySymbol(symbol), price: null, previousClose: null, change: null, changePct: null, currency: "INR", exchange: null, high52w: null, low52w: null, high5y: null, low5y: null, price75: null, signal75: null, volume: null, dayHigh: null, dayLow: null, ok: false };
}

function makeQuote(meta: YahooMeta, fallback: string): Quote {
  const price = number(meta.regularMarketPrice);
  const previous = number(meta.chartPreviousClose) ?? number(meta.previousClose);
  const change = price != null && previous != null ? Math.round((price - previous) * 100) / 100 : null;
  const changePct = number(meta.regularMarketChangePercent) ?? (change != null && previous ? Math.round(change / previous * 10000) / 100 : null);
  return { symbol: string(meta.symbol) ?? fallback, name: string(meta.longName) ?? string(meta.shortName) ?? fallback, price, previousClose: previous, change, changePct, currency: string(meta.currency) ?? "INR", exchange: string(meta.fullExchangeName) ?? string(meta.exchangeName), high52w: number(meta.fiftyTwoWeekHigh), low52w: number(meta.fiftyTwoWeekLow), high5y: null, low5y: null, price75: null, signal75: null, volume: number(meta.regularMarketVolume), dayHigh: number(meta.regularMarketDayHigh), dayLow: number(meta.regularMarketDayLow), ok: price != null };
}

function parseYahoo(raw: unknown): { bars: Bar[]; meta: YahooMeta; dividends: Dividend[] } {
  const chart = record(record(raw)?.chart);
  const result = record((Array.isArray(chart?.result) ? chart.result : [])[0]);
  if (!result) return { bars: [], meta: {}, dividends: [] };
  const meta = (record(result.meta) ?? {}) as YahooMeta;
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const indicators = record(result.indicators);
  const quote = record((Array.isArray(indicators?.quote) ? indicators.quote : [])[0]);
  const opens = Array.isArray(quote?.open) ? quote.open : [];
  const highs = Array.isArray(quote?.high) ? quote.high : [];
  const lows = Array.isArray(quote?.low) ? quote.low : [];
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const volumes = Array.isArray(quote?.volume) ? quote.volume : [];
  const bars: Bar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = number(timestamps[i]), o = number(opens[i]), h = number(highs[i]), l = number(lows[i]), c = number(closes[i]), v = number(volumes[i]) ?? 0;
    if (t != null && o != null && h != null && l != null && c != null) bars.push({ t, o, h, l, c, v });
  }
  const dividends: Dividend[] = [];
  const divMap = record(record(result.events)?.dividends);
  if (divMap) for (const item of Object.values(divMap)) { const row = record(item), amount = number(row?.amount), date = number(row?.date); if (amount != null && date != null) dividends.push({ t: date, amount }); }
  dividends.sort((a, b) => b.t - a.t);
  return { bars, meta, dividends };
}

async function yahooChart(symbol: string, range: string, interval: string, events = false): Promise<unknown> {
  const params = new URLSearchParams({ range, interval, includePrePost: "false" });
  if (events) params.set("events", "div");
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`;
  return cached(`chart:${symbol}:${range}:${interval}:${events}`, 60_000, async () => {
    try { return await getJson(`https://query1.finance.yahoo.com${path}`); }
    catch { return getJson(`https://query2.finance.yahoo.com${path}`); }
  });
}

function quoteFromParsed(parsed: { bars: Bar[]; meta: YahooMeta }, symbol: string): Quote {
  const last = parsed.bars.at(-1);
  const prev = parsed.bars.at(-2);
  return makeQuote({ ...parsed.meta, regularMarketPrice: number(parsed.meta.regularMarketPrice) ?? last?.c, chartPreviousClose: number(parsed.meta.chartPreviousClose) ?? number(parsed.meta.previousClose) ?? prev?.c }, symbol);
}

async function nseQuote(symbol: string): Promise<Quote | null> {
  const bare = displaySymbol(symbol).toUpperCase().replace(/\.NS$|\.BO$/i, "").trim();
  if (!bare || bare.startsWith("^")) return null;
  try {
    const raw = await cached(`nse:${bare}`, 30_000, async () => {
      const home = `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(bare)}`;
      try { await getJson(home, { Referer: "https://www.nseindia.com/", Accept: "text/html,*/*" }); } catch {}
      return getJson(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(bare)}`, { Referer: home, "X-Requested-With": "XMLHttpRequest" });
    });
    const root = record(raw), p = record(root?.priceInfo), meta = record(root?.metadata), info = record(root?.info);
    const price = number(p?.lastPrice);
    if (price == null) return null;
    const previous = number(p?.previousClose) ?? number(p?.close);
    const change = number(p?.change) ?? (previous != null ? price - previous : null);
    const changePct = number(p?.pChange) ?? (change != null && previous ? change / previous * 100 : null);
    const week = record(p?.weekHighLow), intra = record(p?.intraDayHighLow);
    return { symbol: `${bare}.NS`, name: string(meta?.companyName) ?? string(info?.companyName) ?? bare, price, previousClose: previous, change: change != null ? Math.round(change * 100) / 100 : null, changePct: changePct != null ? Math.round(changePct * 100) / 100 : null, currency: "INR", exchange: "NSE", high52w: number(week?.max), low52w: number(week?.min), high5y: null, low5y: null, price75: null, signal75: null, volume: number(p?.totalTradedVolume), dayHigh: number(intra?.max), dayLow: number(intra?.min), ok: true };
  } catch { return null; }
}

async function latestQuote(symbol: string): Promise<Quote> {
  for (const [range, interval] of [["1d", "1m"], ["5d", "1d"], ["1mo", "1d"]] as const) {
    try { const parsed = parseYahoo(await yahooChart(symbol, range, interval)); if (parsed.bars.length) return quoteFromParsed(parsed, symbol); } catch {}
  }
  return (await nseQuote(symbol)) ?? emptyQuote(symbol);
}

async function withFiveYear(quote: Quote, symbol: string, bars?: Bar[]): Promise<Quote> {
  let five = bars ?? [];
  if (!five.length) {
    try { five = parseYahoo(await yahooChart(symbol, "5y", "1d")).bars; } catch {}
  }
  if (!five.length) return quote;
  const high5y = Math.max(...five.map(b => b.h));
  const low5y = Math.min(...five.map(b => b.l));
  const current = quote.price ?? five.at(-1)?.c ?? null;
  const price75 = Math.round(high5y * 0.25 * 100) / 100;
  return { ...quote, high5y, low5y, price75, signal75: current != null && current <= price75 ? "BUY" : "WAIT" };
}

function limitBars(bars: Bar[], period: ChartPeriod): Bar[] {
  if (period !== "3Y") return bars;
  const cutoff = Date.now() / 1000 - 3 * 365 * 24 * 60 * 60;
  return bars.filter(b => b.t >= cutoff);
}

export const fetchDashboard = createServerFn({ method: "POST" }).handler(async () => {
  const [indexQuotes, moverQuotes] = await Promise.all([Promise.all(INDICES.map(i => latestQuote(i.symbol))), Promise.all(MOVERS_UNIVERSE.map(s => latestQuote(s)))]);
  const bySym = new Map(indexQuotes.map(q => [q.symbol, q]));
  const indices = INDICES.map(i => ({ name: i.name, short: i.short, quote: bySym.get(i.symbol) ?? emptyQuote(i.symbol) }));
  const movers = moverQuotes.filter(q => q.ok && q.changePct != null).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  return { indices, gainers: movers.slice(0, 5), losers: [...movers].reverse().slice(0, 5) };
});

export const fetchQuotes = createServerFn({ method: "POST" }).validator((data: unknown) => z.object({ symbols: z.array(z.string()).max(40) }).parse(data)).handler(async ({ data }) => Promise.all(data.symbols.map(async raw => { const symbol = normalizeSymbol(raw); return withFiveYear(await latestQuote(symbol), symbol); })));

export const fetchHistory = createServerFn({ method: "POST" }).validator((data: unknown) => z.object({ symbol: z.string().min(1).max(80), period: z.enum(CHART_PERIODS).default("1Y") }).parse(data)).handler(async ({ data }) => {
  const symbol = normalizeSymbol(data.symbol), spec = PERIOD_MAP[data.period];
  let parsed = { bars: [] as Bar[], meta: {} as YahooMeta, dividends: [] as Dividend[] };
  try { parsed = parseYahoo(await yahooChart(symbol, spec.range, spec.interval)); } catch {}
  const quote = await withFiveYear(parsed.bars.length ? quoteFromParsed(parsed, symbol) : await latestQuote(symbol), symbol, parsed.bars.length && data.period === "5Y" ? parsed.bars : undefined);
  return { symbol, bars: limitBars(parsed.bars, data.period), quote };
});

export const fetchAnalysis = createServerFn({ method: "POST" }).validator((data: unknown) => z.object({ symbol: z.string().min(1).max(80), period: z.enum(CHART_PERIODS).default("1Y") }).parse(data)).handler(async ({ data }) => {
  const symbol = normalizeSymbol(data.symbol), spec = PERIOD_MAP[data.period];
  const [fiveResult, periodResult] = await Promise.allSettled([yahooChart(symbol, "5y", "1d", true), data.period === "1D" || data.period === "1W" ? yahooChart(symbol, spec.range, spec.interval) : Promise.resolve(null)]);
  const five = fiveResult.status === "fulfilled" ? parseYahoo(fiveResult.value) : { bars: [], meta: {}, dividends: [] };
  const period = periodResult.status === "fulfilled" && periodResult.value ? parseYahoo(periodResult.value) : five;
  const source = five.bars.length ? five : period;
  const base = source.bars.length ? quoteFromParsed(source, symbol) : await latestQuote(symbol);
  const quote = await withFiveYear(base, symbol, five.bars.length ? five.bars : undefined);
  const yearAgo = Date.now() / 1000 - 365 * 24 * 60 * 60;
  const bars1y = five.bars.filter(b => b.t >= yearAgo);
  return { symbol, quote, bars: limitBars(period.bars, data.period), bars1y: bars1y.length ? bars1y : source.bars.slice(-260), bars5y: five.bars.length ? five.bars : source.bars, dividends: five.dividends, company: null, fundamentals: [], statements: [], valuation: quote.high5y != null && quote.price75 != null && quote.price != null ? { high5y: quote.high5y, price75: quote.price75, price85: Math.round(quote.high5y * 0.15 * 100) / 100, price95: Math.round(quote.high5y * 0.05 * 100) / 100, currentPrice: quote.price, signal: quote.signal75 === "BUY" ? "BUY" : "WAIT" } : null };
});

export const fetchWatchPack = createServerFn({ method: "POST" }).validator((data: unknown) => z.object({ symbols: z.array(z.string()).max(20) }).parse(data)).handler(async ({ data }) => {
  const symbols = data.symbols.map(normalizeSymbol);
  const quotes = await Promise.all(symbols.map(async symbol => withFiveYear(await latestQuote(symbol), symbol)));
  const packs = await Promise.all(symbols.map(async symbol => {
    try { const [one, five] = await Promise.all([yahooChart(symbol, "1y", "1d"), yahooChart(symbol, "5y", "1wk")]); return { symbol, bars1y: parseYahoo(one).bars, bars5y: parseYahoo(five).bars }; }
    catch { return { symbol, bars1y: [] as Bar[], bars5y: [] as Bar[] }; }
  }));
  return { quotes, packs };
});

export const searchSymbols = createServerFn({ method: "POST" }).validator((data: unknown) => z.object({ q: z.string().min(1).max(80) }).parse(data)).handler(async ({ data }): Promise<SearchHit[]> => {
  const query = data.q.trim(), terms = [query, `${query} NSE`, `${query} India`];
  for (const term of terms) {
    try {
      const params = new URLSearchParams({ q: term, quotesCount: "20", newsCount: "0", enableFuzzyQuery: "true" });
      let raw: unknown;
      try { raw = await getJson(`https://query1.finance.yahoo.com/v1/finance/search?${params}`); } catch { raw = await getJson(`https://query2.finance.yahoo.com/v1/finance/search?${params}`); }
      const root = record(raw), quotes = Array.isArray(root?.quotes) ? root.quotes : [], hits: SearchHit[] = [];
      for (const item of quotes) {
        const row = record(item), symbol = string(row?.symbol);
        if (!symbol) continue;
        const type = string(row?.quoteType), exchange = string(row?.exchDisp) ?? "";
        const indian = symbol.endsWith(".NS") || symbol.endsWith(".BO") || /NSE|BSE|Bombay/i.test(exchange);
        if (type && type !== "EQUITY" && type !== "INDEX") continue;
        if (!indian && !symbol.startsWith("^")) continue;
        hits.push({ symbol, name: string(row?.longname) ?? string(row?.shortname) ?? symbol, exchange: exchange || (symbol.endsWith(".BO") ? "BSE" : "NSE") });
      }
      if (hits.length) return hits;
    } catch {}
  }
  const known: Record<string, string> = { RELIANCE: "RELIANCE.NS", "RELIANCE INDUSTRIES": "RELIANCE.NS", TCS: "TCS.NS", INFY: "INFY.NS", INFOSYS: "INFY.NS", HDFCBANK: "HDFCBANK.NS", "HDFC BANK": "HDFCBANK.NS", ICICIBANK: "ICICIBANK.NS", "ICICI BANK": "ICICIBANK.NS", SBIN: "SBIN.NS", "STATE BANK OF INDIA": "SBIN.NS", ITC: "ITC.NS", TATAMOTORS: "TATAMOTORS.NS", "TATA MOTORS": "TATAMOTORS.NS", LT: "LT.NS", "LARSEN & TOUBRO": "LT.NS", MARUTI: "MARUTI.NS", AXISBANK: "AXISBANK.NS", KOTAKBANK: "KOTAKBANK.NS", SUNPHARMA: "SUNPHARMA.NS", WIPRO: "WIPRO.NS", HINDUNILVR: "HINDUNILVR.NS", BHARTIARTL: "BHARTIARTL.NS", ASIANPAINT: "ASIANPAINT.NS", TITAN: "TITAN.NS" };
  const key = query.toUpperCase().replace(/\s+/g, " ");
  const normalized = known[key] ?? normalizeSymbol(query);
  return [{ symbol: normalized, name: displaySymbol(normalized), exchange: normalized.endsWith(".BO") ? "BSE" : "NSE" }];
});

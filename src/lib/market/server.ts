import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  CHART_PERIODS,
  INDICES,
  MOVERS_UNIVERSE,
  PERIOD_MAP,
  displaySymbol,
  normalizeSymbol,
  type ChartPeriod,
} from "./config";

import type {
  Bar,
  Dividend,
  Quote,
  SearchHit,
} from "./types";

const UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/122 Safari/537.36";

type YahooMeta = {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  longName?: string;
  shortName?: string;
  chartPreviousClose?: number;
};

type CacheEntry = {
  exp: number;
  val: unknown;
};

const cache = new Map<string, CacheEntry>();

function record(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return null;
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const n = Number(value);

    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value
    : null;
}

async function getJson(
  url: string,
  headers?: HeadersInit,
): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json,text/plain,*/*",
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function cached<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  const old = cache.get(key);

  if (old && old.exp > Date.now()) {
    return old.val as T;
  }

  const value = await fn();

  cache.set(key, {
    exp: Date.now() + ttl,
    val: value,
  });

  return value;
}

function emptyQuote(symbol: string): Quote {
  return {
    symbol,
    name: displaySymbol(symbol),
    price: null,
    previousClose: null,
    change: null,
    changePct: null,
    currency: "INR",
    exchange: null,
    high52w: null,
    low52w: null,
    volume: null,
    dayHigh: null,
    dayLow: null,
    ok: false,
  };
}

function makeQuote(
  meta: YahooMeta,
  fallback: string,
): Quote {
  const price = number(meta.regularMarketPrice);
  const previous = number(meta.chartPreviousClose);

  const change =
    price !== null && previous !== null
      ? Math.round((price - previous) * 100) / 100
      : null;

  const changePct = number(
    meta.regularMarketChangePercent,
  );

  return {
    symbol: string(meta.symbol) ?? fallback,

    name:
      string(meta.longName) ??
      string(meta.shortName) ??
      fallback,

    price,
    previousClose: previous,
    change,
    changePct,

    currency:
      string(meta.currency) ?? "INR",

    exchange:
      string(meta.fullExchangeName) ??
      string(meta.exchangeName),

    high52w: number(meta.fiftyTwoWeekHigh),
    low52w: number(meta.fiftyTwoWeekLow),

    volume: number(meta.regularMarketVolume),

    dayHigh: number(meta.regularMarketDayHigh),
    dayLow: number(meta.regularMarketDayLow),

    ok: price !== null,
  };
}

function parseYahoo(
  raw: unknown,
): {
  bars: Bar[];
  meta: YahooMeta;
  dividends: Dividend[];
} {
  const root = record(raw);
  const chart = record(root?.chart);

  const results = Array.isArray(chart?.result)
    ? chart.result
    : [];

  const result = record(results[0]);

  if (!result) {
    return {
      bars: [],
      meta: {},
      dividends: [],
    };
  }

  const meta =
    (record(result.meta) ?? {}) as YahooMeta;

  const timestamps = Array.isArray(result.timestamp)
    ? result.timestamp
    : [];

  const indicators = record(result.indicators);

  const quotes = Array.isArray(indicators?.quote)
    ? indicators.quote
    : [];

  const quote = record(quotes[0]);

  const opens = Array.isArray(quote?.open)
    ? quote.open
    : [];

  const highs = Array.isArray(quote?.high)
    ? quote.high
    : [];

  const lows = Array.isArray(quote?.low)
    ? quote.low
    : [];

  const closes = Array.isArray(quote?.close)
    ? quote.close
    : [];

  const volumes = Array.isArray(quote?.volume)
    ? quote.volume
    : [];

  const bars: Bar[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const t = number(timestamps[i]);
    const o = number(opens[i]);
    const h = number(highs[i]);
    const l = number(lows[i]);
    const c = number(closes[i]);
    const v = number(volumes[i]) ?? 0;

    if (
      t === null ||
      o === null ||
      h === null ||
      l === null ||
      c === null
    ) {
      continue;
    }

    bars.push({
      t,
      o,
      h,
      l,
      c,
      v,
    });
  }

  const dividends: Dividend[] = [];

  const events = record(result.events);
  const dividendMap = record(events?.dividends);

  if (dividendMap) {
    for (const item of Object.values(dividendMap)) {
      const row = record(item);

      const amount = number(row?.amount);
      const date = number(row?.date);

      if (amount !== null && date !== null) {
        dividends.push({
          t: date,
          amount,
        });
      }
    }
  }

  dividends.sort((a, b) => b.t - a.t);

  return {
    bars,
    meta,
    dividends,
  };
}

async function yahooChart(
  symbol: string,
  range: string,
  interval: string,
  events = false,
): Promise<unknown> {
  const params = new URLSearchParams({
    range,
    interval,
    includePrePost: "false",
  });

  if (events) {
    params.set("events", "div");
  }

  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}?${params}`;

  return cached(
    `chart:${symbol}:${range}:${interval}:${events}`,
    15 * 60 * 1000,
    () => getJson(url),
  );
}

async function yahooQuotes(
  symbols: string[],
): Promise<Quote[]> {
  const unique = [
    ...new Set(symbols.filter(Boolean)),
  ];

  const output: Quote[] = [];

  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20);

    const params = new URLSearchParams({
      symbols: chunk.join(","),
      range: "1d",
      interval: "1d",
    });

    const raw = await cached(
      `spark:${chunk.join(",")}`,
      45 * 1000,
      () =>
        getJson(
          `https://query2.finance.yahoo.com/v7/finance/spark?${params}`,
        ),
    );

    const root = record(raw);
    const spark = record(root?.spark);

    const results = Array.isArray(spark?.result)
      ? spark.result
      : [];

    const found = new Map<string, Quote>();

    for (const item of results) {
      const row = record(item);

      const symbol =
        string(row?.symbol) ?? "";

      const responses = Array.isArray(
        row?.response,
      )
        ? row.response
        : [];

      const response = record(responses[0]);

      const meta =
        (record(response?.meta) ?? {}) as YahooMeta;

      const quote = makeQuote(
        meta,
        symbol,
      );

      if (quote.symbol) {
        found.set(
          quote.symbol,
          quote,
        );
      }
    }

    for (const symbol of chunk) {
      output.push(
        found.get(symbol) ??
          emptyQuote(symbol),
      );
    }
  }

  return output;
}

function limitBars(
  bars: Bar[],
  period: ChartPeriod,
): Bar[] {
  if (period !== "3Y") {
    return bars;
  }

  const cutoff =
    Date.now() / 1000 -
    3 * 365 * 24 * 60 * 60;

  return bars.filter(
    (bar) => bar.t >= cutoff,
  );
}

/* =========================
   DASHBOARD
========================= */

export const fetchDashboard =
  createServerFn({
    method: "POST",
  }).handler(async () => {
    const indexSymbols =
      INDICES.map(
        (item) => item.symbol,
      );

    const [
      indexQuotes,
      moverQuotes,
    ] = await Promise.all([
      yahooQuotes(indexSymbols),
      yahooQuotes([
        ...MOVERS_UNIVERSE,
      ]),
    ]);

    const indexMap = new Map(
      indexQuotes.map(
        (quote) => [
          quote.symbol,
          quote,
        ],
      ),
    );

    const indices =
      INDICES.map((item) => ({
        name: item.name,
        short: item.short,

        quote:
          indexMap.get(
            item.symbol,
          ) ??
          emptyQuote(
            item.symbol,
          ),
      }));

    const movers =
      moverQuotes.filter(
        (quote) =>
          quote.ok &&
          quote.changePct !== null,
      );

    const sorted = [
      ...movers,
    ].sort(
      (a, b) =>
        (b.changePct ?? 0) -
        (a.changePct ?? 0),
    );

    return {
      indices,

      gainers:
        sorted.slice(0, 5),

      losers:
        [...sorted]
          .reverse()
          .slice(0, 5),
    };
  });

/* =========================
   QUOTES
========================= */

export const fetchQuotes =
  createServerFn({
    method: "POST",
  })
    .validator((data: unknown) =>
      z
        .object({
          symbols:
            z
              .array(z.string())
              .max(40),
        })
        .parse(data),
    )
    .handler(async ({ data }) => {
      const symbols =
        data.symbols.map(
          normalizeSymbol,
        );

      return yahooQuotes(symbols);
    });

/* =========================
   HISTORY
========================= */

export const fetchHistory =
  createServerFn({
    method: "POST",
  })
    .validator((data: unknown) =>
      z
        .object({
          symbol:
            z
              .string()
              .min(1)
              .max(24),

          period:
            z
              .enum(CHART_PERIODS)
              .default("1Y"),
        })
        .parse(data),
    )
    .handler(async ({ data }) => {
      const symbol =
        normalizeSymbol(
          data.symbol,
        );

      const spec =
        PERIOD_MAP[data.period];

      const raw =
        await yahooChart(
          symbol,
          spec.range,
          spec.interval,
        );

      const parsed =
        parseYahoo(raw);

      return {
        symbol,

        bars:
          limitBars(
            parsed.bars,
            data.period,
          ),

        quote:
          makeQuote(
            parsed.meta,
            symbol,
          ),
      };
    });

/* =========================
   ANALYSIS
========================= */

export const fetchAnalysis =
  createServerFn({
    method: "POST",
  })
    .validator((data: unknown) =>
      z
        .object({
          symbol:
            z
              .string()
              .min(1)
              .max(24),

          period:
            z
              .enum(CHART_PERIODS)
              .default("1Y"),
        })
        .parse(data),
    )
    .handler(async ({ data }) => {
      const symbol =
        normalizeSymbol(
          data.symbol,
        );

      const spec =
        PERIOD_MAP[data.period];

      const raw =
        await yahooChart(
          symbol,
          spec.range,
          spec.interval,
          true,
        );

      const parsed =
        parseYahoo(raw);

      const quote =
        makeQuote(
          parsed.meta,
          symbol,
        );

      const oneYearAgo =
        Date.now() / 1000 -
        365 * 24 * 60 * 60;

      const bars1y =
        parsed.bars.filter(
          (bar) =>
            bar.t >= oneYearAgo,
        );

      return {
        symbol,

        quote,

        bars:
          limitBars(
            parsed.bars,
            data.period,
          ),

        bars1y:
          bars1y.length > 0
            ? bars1y
            : parsed.bars.slice(
                -260,
              ),

        bars5y:
          parsed.bars,

        dividends:
          parsed.dividends,

        company: null,

        fundamentals: [],

        statements: [],
      };
    });

/* =========================
   WATCHLIST
========================= */

export const fetchWatchPack =
  createServerFn({
    method: "POST",
  })
    .validator((data: unknown) =>
      z
        .object({
          symbols:
            z
              .array(z.string())
              .max(20),
        })
        .parse(data),
    )
    .handler(async ({ data }) => {
      const symbols =
        data.symbols.map(
          normalizeSymbol,
        );

      const quotes =
        await yahooQuotes(symbols);

      const packs =
        await Promise.all(
          symbols.map(
            async (symbol) => {
              try {
                const oneYear =
                  parseYahoo(
                    await yahooChart(
                      symbol,
                      "1y",
                      "1d",
                    ),
                  );

                const fiveYear =
                  parseYahoo(
                    await yahooChart(
                      symbol,
                      "5y",
                      "1wk",
                    ),
                  );

                return {
                  symbol,

                  bars1y:
                    oneYear.bars,

                  bars5y:
                    fiveYear.bars,
                };
              } catch {
                return {
                  symbol,

                  bars1y:
                    [] as Bar[],

                  bars5y:
                    [] as Bar[],
                };
              }
            },
          ),
        );

      return {
        quotes,
        packs,
      };
    });

/* =========================
   SEARCH
========================= */

export const searchSymbols =
  createServerFn({
    method: "POST",
  })
    .validator((data: unknown) =>
      z
        .object({
          q:
            z
              .string()
              .min(1)
              .max(40),
        })
        .parse(data),
    )
    .handler(
      async ({
        data,
      }): Promise<SearchHit[]> => {
        const query =
          data.q.trim();

        try {
          const raw =
            await getJson(
              `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
                query,
              )}&quotesCount=10&newsCount=0`,
            );

          const root =
            record(raw);

          const quotes =
            Array.isArray(
              root?.quotes,
            )
              ? root.quotes
              : [];

          const hits: SearchHit[] =
            [];

          for (const item of quotes) {
            const row =
              record(item);

            const symbol =
              string(row?.symbol);

            if (!symbol) {
              continue;
            }

            const type =
              string(row?.quoteType);

            const exchange =
              string(row?.exchDisp) ??
              "";

            const indian =
              symbol.endsWith(".NS") ||
              symbol.endsWith(".BO") ||
              /NSE|BSE|Bombay/i.test(
                exchange,
              );

            if (
              type &&
              type !== "EQUITY" &&
              type !== "INDEX"
            ) {
              continue;
            }

            if (
              !indian &&
              !symbol.startsWith("^")
            ) {
              continue;
            }

            hits.push({
              symbol,

              name:
                string(row?.longname) ??
                string(row?.shortname) ??
                symbol,

              exchange:
                exchange ||
                (symbol.endsWith(".BO")
                  ? "BSE"
                  : "NSE"),
            });
          }

          if (hits.length > 0) {
            return hits;
          }
        } catch {
          // Use fallback below.
        }

                const normalized = normalizeSymbol(query);

        return [
          {
            symbol: normalized,
            name: normalized,
            exchange: "NSE",
          },
        ];
      },
    );

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
  CompanyInfo,
  Dividend,
  FundamentalRow,
  Quote,
  SearchHit,
  StatementRow,
} from "./types";

const UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";

type CacheEntry = {
  exp: number;
  val: unknown;
};

const mem = new Map<string, CacheEntry>();

async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = mem.get(key);

  if (hit && hit.exp > Date.now()) {
    return hit.val as T;
  }

  const val = await fn();

  mem.set(key, {
    exp: Date.now() + ttlMs,
    val,
  });

  return val;
}

async function fetchJson(
  url: string,
  extra?: HeadersInit,
): Promise<unknown> {
  const run = async () => {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json,text/plain,*/*",
        ...extra,
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json() as Promise<unknown>;
  };

  try {
    return await run();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return run();
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object"
    ? (v as Record<string, unknown>)
    : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }

  if (typeof v === "string" && v.trim()) {
    const n = Number(v);

    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim()
    ? v
    : null;
}

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

function quoteFromMeta(
  meta: YahooMeta,
  fallbackSymbol: string,
): Quote {
  const price = num(meta.regularMarketPrice);
  const prev = num(meta.chartPreviousClose);
  const changePct = num(meta.regularMarketChangePercent);

  const change =
    price != null && prev != null
      ? Math.round((price - prev) * 100) / 100
      : null;

  return {
    symbol: str(meta.symbol) ?? fallbackSymbol,

    name:
      str(meta.longName) ??
      str(meta.shortName) ??
      fallbackSymbol,

    price,
    previousClose: prev,
    change,
    changePct,

    currency: str(meta.currency) ?? "INR",

    exchange:
      str(meta.fullExchangeName) ??
      str(meta.exchangeName),

    high52w: num(meta.fiftyTwoWeekHigh),
    low52w: num(meta.fiftyTwoWeekLow),

    volume: num(meta.regularMarketVolume),

    dayHigh: num(meta.regularMarketDayHigh),
    dayLow: num(meta.regularMarketDayLow),

    ok: price != null,
  };
}

function parseBars(
  raw: unknown,
): {
  bars: Bar[];
  meta: YahooMeta;
  dividends: Dividend[];
} {
  const root = asRecord(raw);
  const chart = asRecord(root?.chart);

  const result = Array.isArray(chart?.result)
    ? asRecord(chart.result[0])
    : null;

  if (!result) {
    return {
      bars: [],
      meta: {},
      dividends: [],
    };
  }

  const meta = (asRecord(result.meta) ?? {}) as YahooMeta;

  const ts = Array.isArray(result.timestamp)
    ? (result.timestamp as unknown[])
    : [];

  const indicators = asRecord(result.indicators);

  const quoteArr = Array.isArray(indicators?.quote)
    ? asRecord(indicators.quote[0])
    : null;

  const open = Array.isArray(quoteArr?.open)
    ? (quoteArr.open as unknown[])
    : [];

  const high = Array.isArray(quoteArr?.high)
    ? (quoteArr.high as unknown[])
    : [];

  const low = Array.isArray(quoteArr?.low)
    ? (quoteArr.low as unknown[])
    : [];

  const close = Array.isArray(quoteArr?.close)
    ? (quoteArr.close as unknown[])
    : [];

  const volume = Array.isArray(quoteArr?.volume)
    ? (quoteArr.volume as unknown[])
    : [];

  const bars: Bar[] = [];

  for (let i = 0; i < ts.length; i++) {
    const t = num(ts[i]);
    const o = num(open[i]);
    const h = num(high[i]);
    const l = num(low[i]);
    const c = num(close[i]);
    const v = num(volume[i]) ?? 0;

    if (
      t == null ||
      o == null ||
      h == null ||
      l == null ||
      c == null
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

  const events = asRecord(result.events);
  const divs = asRecord(events?.dividends);

  const dividends: Dividend[] = [];

  if (divs) {
    for (const row of Object.values(divs)) {
      const rec = asRecord(row);

      const amount = num(rec?.amount);
      const date = num(rec?.date);

      if (amount != null && date != null) {
        dividends.push({
          t: date,
          amount,
        });
      }
    }

    dividends.sort((a, b) => b.t - a.t);
  }

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
) {
  const q = new URLSearchParams({
    range,
    interval,
    includePrePost: "false",
  });

  if (events) {
    q.set("events", "div");
  }

  const url =
    `https://query2.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}?${q}`;

  return cached(
    `chart:${symbol}:${range}:${interval}:${events}`,
    15 * 60_000,
    () => fetchJson(url),
  );
}

async function yahooSpark(
  symbols: string[],
): Promise<Quote[]> {
  const unique = [
    ...new Set(symbols.filter(Boolean)),
  ];

  const out: Quote[] = [];

  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20);

    const key = `spark:${chunk.join(",")}`;

    const raw = await cached(
      key,
      45_000,
      () => {
        const q = new URLSearchParams({
          symbols: chunk.join(","),
          range: "1d",
          interval: "1d",
        });

        return fetchJson(
          `https://query2.finance.yahoo.com/v7/finance/spark?${q}`,
        );
      },
    );

    const spark = asRecord(
      asRecord(raw)?.spark,
    );

    const result = Array.isArray(spark?.result)
      ? spark.result
      : [];

    const bySym = new Map<string, Quote>();

    for (const item of result) {
      const rec = asRecord(item);

      const symbol = str(rec?.symbol) ?? "";

      const response = Array.isArray(rec?.response)
        ? asRecord(rec.response[0])
        : null;

      const meta = (asRecord(response?.meta) ??
        {}) as YahooMeta;

      const quote = quoteFromMeta(
        meta,
        symbol,
      );

      if (quote.symbol) {
        bySym.set(
          quote.symbol,
          quote,
        );
      }
    }

    for (const symbol of chunk) {
      out.push(
        bySym.get(symbol) ??
          emptyQuote(symbol),
      );
    }
  }

  return out;
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

type GrowwCompany = {
  info: CompanyInfo;
  fundamentals: FundamentalRow[];
  statements: StatementRow[];
};

async function growwSearchId(
  symbol: string,
): Promise<string | null> {
  const bare = displaySymbol(symbol);

  return cached(
    `groww-id:${bare}`,
    6 * 60 * 60_000,
    async () => {
      try {
        const raw = await fetchJson(
          `https://groww.in/v1/api/search/v1/entity?query=${encodeURIComponent(
            bare,
          )}&page=0&size=8`,
          {
            Referer: "https://groww.in/",
          },
        );

        const rec = asRecord(raw);

        const content = Array.isArray(rec?.content)
          ? rec.content
          : [];

        const stocks = content
          .map(asRecord)
          .filter(
            (
              x,
            ): x is Record<string, unknown> =>
              !!x &&
              str(x.entity_type) ===
                "Stocks",
          );

        const match =
          stocks.find(
            (s) =>
              str(
                s.nse_scrip_code,
              )?.toUpperCase() === bare,
          ) ??
          stocks.find(
            (s) =>
              str(s.bse_scrip_code) ===
              bare,
          ) ??
          stocks[0];

        return (
          str(match?.search_id) ??
          str(match?.id)
        );
      } catch {
        return null;
      }
    },
  );
}

async function growwCompany(
  symbol: string,
): Promise<GrowwCompany | null> {
  const id = await growwSearchId(symbol);

  if (!id) {
    return null;
  }

  return cached(
    `groww-co:${id}`,
    60 * 60_000,
    async () => {
      try {
        const raw = await fetchJson(
          `https://groww.in/v1/api/stocks_data/v1/company/search_id/${id}`,
          {
            Referer: "https://groww.in/",
          },
        );

        const rec = asRecord(raw);

        if (!rec) {
          return null;
        }

        const header = asRecord(rec.header);
        const details = asRecord(rec.details);

        const info: CompanyInfo = {
          name:
            str(details?.fullName) ??
            str(header?.displayName) ??
            displaySymbol(symbol),

          industry:
            str(header?.industryName),

          website:
            str(details?.websiteUrl),

          ceo:
            str(details?.ceo) ??
            str(details?.managingDirector),

          founded:
            str(details?.foundedYear),

          summary:
            str(details?.businessSummary),

          nse:
            str(header?.nseScriptCode),

          bse:
            str(header?.bseScriptCode),

          logo:
            str(header?.logoUrl),
        };

        const fundamentals: FundamentalRow[] = [];

        if (Array.isArray(rec.fundamentals)) {
          for (const row of rec.fundamentals) {
            const r = asRecord(row);

            const name = str(r?.name);
            const value = str(r?.value);

            if (name && value) {
              fundamentals.push({
                name,
                value,
              });
            }
          }
        }

        const statements: StatementRow[] = [];

        const fs2 = asRecord(
          rec.financialStatementV2,
        );

        const list = Array.isArray(
          fs2?.CONSOLIDATED,
        )
          ? fs2.CONSOLIDATED
          : Array.isArray(
                rec.financialStatement,
              )
            ? rec.financialStatement
            : [];

        for (const row of list) {
          const r = asRecord(row);

          const title = str(r?.title);

          if (!title) {
            continue;
          }

          const yearly: Record<
            string,
            number | null
          > = {};

          const quarterly: Record<
            string,
            number | null
          > = {};

          const y = asRecord(r?.yearly);
          const q = asRecord(r?.quarterly);

          if (y) {
            for (const [k, v] of Object.entries(y)) {
              yearly[k] = num(v);
            }
          }

          if (q) {
            for (const [k, v] of Object.entries(q)) {
              quarterly[k] = num(v);
            }
          }

          statements.push({
            title,
            yearly,
            quarterly,
          });
        }

        return {
          info,
          fundamentals,
          statements,
        };
      } catch {
        return null;
      }
    },
  );
}

function sliceBars(
  bars: Bar[],
  period: ChartPeriod,
): Bar[] {
  if (period !== "3Y") {
    return bars;
  }

  const cutoff =
    Date.now() / 1000 -
    3 * 365 * 24 * 3600;

  return bars.filter(
    (bar) => bar.t >= cutoff,
  );
}

/* =========================================================
   DASHBOARD
   ========================================================= */

export const fetchDashboard =
  createServerFn({
    method: "POST",
  }).handler(async () => {
    const indexSymbols =
      INDICES.map(
        (i) => i.symbol,
      );

    const [
      indexQuotes,
      moverQuotes,
    ] = await Promise.all([
      yahooSpark(indexSymbols),
      yahooSpark([
        ...MOVERS_UNIVERSE,
      ]),
    ]);

    const bySym = new Map(
      indexQuotes.map(
        (q) => [q.symbol, q],
      ),
    );

    const indices =
      INDICES.map((i) => ({
        name: i.name,
        short: i.short,

        quote:
          bySym.get(i.symbol) ??
          emptyQuote(i.symbol),
      }));

    const movers =
      moverQuotes.filter(
        (q) =>
          q.ok &&
          q.changePct != null,
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

/* =========================================================
   QUOTES
   ========================================================= */

export const fetchQuotes =
  createServerFn({
    method: "POST",
  })
    .validator((d: unknown) =>
      z
        .object({
          symbols:
            z
              .array(z.string())
              .max(40),
        })
        .parse(d),
    )
    .handler(async ({ data }) => {
      const symbols =
        data.symbols.map(
          normalizeSymbol,
        );

      return yahooSpark(symbols);
    });

/* =========================================================
   HISTORY
   ========================================================= */

export const fetchHistory =
  createServerFn({
    method: "POST",
  })
    .validator((d: unknown) =>
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
        .parse(d),
    )
    .handler(async ({ data }) => {
      const symbol =
        normalizeSymbol(
          data.symbol,
        );

      const spec =
        PERIOD_MAP[data.period];

      const parsed =
        parseBars(
          await yahooChart(
            symbol,
            spec.range,
            spec.interval,
          ),
        );

      return {
        symbol,

        bars: sliceBars(
          parsed.bars,
          data.period,
        ),

        quote:
          quoteFromMeta(
            parsed.meta,
            symbol,
          ),
      };
    });

/* =========================================================
   ANALYSIS
   ========================================================= */

export const fetchAnalysis =
  createServerFn({
    method: "POST",
  })
    .validator((d: unknown) =>
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
        .parse(d),
    )
    .handler(async ({ data }) => {
      const symbol =
        normalizeSymbol(
          data.symbol,
        );

      const spec =
        PERIOD_MAP[data.period];

      const needIntraday =
        data.period === "1D" ||
        data.period === "1W";

      const needMax =
        data.period === "MAX";

      const [
        fiveYRaw,
        periodRaw,
        groww,
      ] = await Promise.all([
        yahooChart(
          symbol,
          "5y",
          "1d",
          true,
        ),

        needIntraday || needMax
          ? yahooChart(
              symbol,
              spec.range,
              spec.interval,
            )
          : Promise.resolve(null),

        growwCompany(symbol),
      ]);

      const fiveY =
        parseBars(fiveYRaw);

      const period =
        periodRaw
          ? parseBars(periodRaw)
          : fiveY;

      const chartBars =
        sliceBars(
          period.bars,
          data.period,
        );

      const quote =
        quoteFromMeta(
          fiveY.meta
            .regularMarketPrice
            ? fiveY.meta
            : period.meta,
          symbol,
        );

      if (groww?.info.name) {
        quote.name =
          groww.info.name;
      }

      const yearAgo =
        Date.now() / 1000 -
        365 * 24 * 3600;

      const bars1y =
        fiveY.bars.filter(
          (bar) =>
            bar.t >= yearAgo,
        );

      return {
        symbol,

        quote,

        bars: chartBars,

        bars1y:
          bars1y.length
            ? bars1y
            : fiveY.bars.slice(
                -260,
              ),

        bars5y:
          fiveY.bars,

        dividends:
          fiveY.dividends,

        company:
          groww?.info ?? null,

        fundamentals:
          groww?.fundamentals ?? [],

        statements:
          groww?.statements ?? [],
      };
    });

/* =========================================================
   WATCHLIST
   ========================================================= */

export const fetchWatchPack =
  createServerFn({
    method: "POST",
  })
    .validator((d: unknown) =>
      z
        .object({
          symbols:
            z
              .array(z.string())
              .max(20),
        })
        .parse(d),
    )
    .handler(async ({ data }) => {
      const symbols =
        data.symbols.map(
          normalizeSymbol,
        );

      const quotes =
        await yahooSpark(symbols);

      const packs =
        await Promise.all(
          symbols.map(
            async (symbol) => {
              try {
                const parsed =
                  parseBars(
                    await yahooChart(
                      symbol,
                      "1y",
                      "1d",
                    ),
                  );

                const five =
                  parseBars(
                    await yahooChart(
                      symbol,
                      "5y",
                      "1wk",
                    ),
                  );

                return {
                  symbol,

                  bars1y:
                    parsed.bars,

                  bars5y:
                    five.bars,
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

/* =========================================================
   SEARCH
   ========================================================= */

export const searchSymbols =
  createServerFn({
    method: "POST",
  })
    .validator((d: unknown) =>
      z
        .object({
          q:
            z
              .string()
              .min(1)
              .max(40),
        })
        .parse(d),
    )
    .handler(
      async ({
        data,
      }): Promise<SearchHit[]> => {
        const q =
          data.q.trim();

        try {
          const raw =
            await fetchJson(
              `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
                q,
              )}&quotesCount=8&newsCount=0`,
 

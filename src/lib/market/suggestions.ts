import { createServerFn } from "@tanstack/react-start";
import type { Quote } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
const cache = { exp: 0, symbols: [] as string[], data: [] as Quote[] };
const BSE_GROUPS = ["A", "B", "E", "F", "FC", "GC", "I", "IF", "IP", "M", "MS", "MT", "P", "R", "T", "TS", "W", "X", "XD", "XT", "Y", "Z", "ZP", "ZY"];

type Chart = {
  chart?: {
    result?: Array<{
      meta?: Record<string, unknown>;
      timestamp?: number[];
      indicators?: { quote?: Array<{ high?: Array<number | null>; close?: Array<number | null> }> };
    }>;
  };
};
type Suggestion = Quote & { triggerDay?: string };

function num(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function chunk<T>(a: T[], n: number) {
  const r: T[][] = [];
  for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
  return r;
}
function indiaDate(ts: number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }).format(new Date(ts * 1000));
}
function weekStart(date: string) {
  const d = new Date(`${date}T00:00:00+05:30`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}
function currentWeekStart() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return weekStart(today);
}
function previousWeekStart(thisWeek: string) {
  const d = new Date(`${thisWeek}T00:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

async function nseUniverse(): Promise<string[]> {
  try {
    const res = await fetch("https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv", {
      headers: { "User-Agent": UA, Accept: "text/csv,*/*" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const lines = (await res.text()).split(/\r?\n/).filter(Boolean);
    const header = lines.shift()?.split(",").map((x) => x.trim().replace(/^\"|\"$/g, "").toUpperCase()) ?? [];
    const symbolIndex = header.indexOf("SYMBOL");
    const seriesIndex = header.indexOf("SERIES");
    if (symbolIndex < 0) return [];
    return lines
      .map((line) => line.split(",").map((v) => v.trim().replace(/^\"|\"$/g, "")))
      .filter((cols) => seriesIndex < 0 || cols[seriesIndex] === "EQ")
      .map((cols) => cols[symbolIndex])
      .filter(Boolean)
      .map((symbol) => `${symbol}.NS`);
  } catch {
    return [];
  }
}

async function bseUniverse(): Promise<string[]> {
  const out = new Set<string>();
  for (const group of BSE_GROUPS) {
    try {
      const u = new URL("https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w");
      u.searchParams.set("scripcode", "");
      u.searchParams.set("Group", group);
      u.searchParams.set("industry", "");
      u.searchParams.set("segment", "Equity");
      u.searchParams.set("status", "Active");
      const res = await fetch(u, {
        headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: "https://www.bseindia.com/" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const raw = (await res.json()) as unknown;
      const rows = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && Array.isArray((raw as { Data?: unknown }).Data)
          ? (raw as { Data: unknown[] }).Data
          : [];
      for (const item of rows) {
        if (!item || typeof item !== "object") continue;
        const r = item as Record<string, unknown>;
        const code = String(r.scripcode ?? r.SCRIPCODE ?? r.scripCode ?? "").trim();
        if (/^\d{6}$/.test(code)) out.add(`${code}.BO`);
      }
    } catch {
      // Continue with the next BSE group.
    }
  }
  return [...out];
}

async function universe(): Promise<string[]> {
  if (cache.symbols.length) return cache.symbols;
  const [nse, bse] = await Promise.all([nseUniverse(), bseUniverse()]);
  const all = [...new Set([...nse, ...bse])];
  if (all.length) cache.symbols = all;
  return cache.symbols;
}

async function history(symbol: string) {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const u = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);
      u.searchParams.set("range", "5y");
      u.searchParams.set("interval", "1d");
      const res = await fetch(u, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;

      const raw = (await res.json()) as Chart;
      const row = raw.chart?.result?.[0];
      if (!row) continue;

      const highs = (row.indicators?.quote?.[0]?.high ?? []).map(num).filter((v): v is number => v !== null);
      const closes = (row.indicators?.quote?.[0]?.close ?? []).map(num);
      const timestamps = row.timestamp ?? [];
      const price = num(row.meta?.regularMarketPrice) ?? [...closes].reverse().find((v) => v !== null) ?? null;
      if (price === null || highs.length === 0) continue;

      const high5y = Math.max(...highs);
      if (!Number.isFinite(high5y)) continue;

      const threshold = price < 20 ? high5y * 0.10 : high5y * 0.25;
      let triggerDay: string | undefined;

      for (let i = 1; i < closes.length; i += 1) {
        const previous = closes[i - 1];
        const current = closes[i];
        const ts = timestamps[i];
        if (previous !== null && current !== null && previous > threshold && current <= threshold && ts != null) {
          triggerDay = indiaDate(ts);
        }
      }

      if (!triggerDay && price <= threshold) {
        for (let i = 0; i < closes.length; i += 1) {
          const current = closes[i];
          const ts = timestamps[i];
          if (current !== null && current <= threshold && ts != null) {
            triggerDay = indiaDate(ts);
            break;
          }
        }
      }

      return { price, high5y, triggerDay };
    } catch {
      // Try the other Yahoo endpoint.
    }
  }
  return null;
}

async function getSuggestions(): Promise<Quote[]> {
  try {
    const symbols = await universe();
    if (!symbols.length) return cache.data;

    const thisWeek = currentWeekStart();
    const previousWeek = previousWeekStart(thisWeek);
    const result: Suggestion[] = [];

    for (const batch of chunk(symbols, 20)) {
      const rows = await Promise.allSettled(batch.map(async (symbol) => ({ symbol, data: await history(symbol) })));
      for (const row of rows) {
        if (row.status !== "fulfilled" || !row.value.data) continue;
        const { symbol, data } = row.value;
        const threshold = data.high5y * (data.price < 20 ? 0.10 : 0.25);
        if (data.price > threshold) continue;

        result.push({
          symbol,
          name: symbol.replace(/\.NS$|\.BO$/i, ""),
          price: data.price,
          previousClose: null,
          change: null,
          changePct: null,
          currency: "INR",
          exchange: symbol.endsWith(".BO") ? "BSE" : "NSE",
          high52w: null,
          low52w: null,
          high5y: data.high5y,
          low5y: null,
          price75: Math.round(data.high5y * 0.25 * 100) / 100,
          signal75: "BUY",
          volume: null,
          dayHigh: null,
          dayLow: null,
          ok: true,
          triggerDay: data.triggerDay,
        });
      }
    }

    const byCompany = new Map<string, Suggestion>();
    for (const quote of result) {
      const key = quote.name.replace(/[^A-Z0-9]/gi, "").toUpperCase();
      const old = byCompany.get(key);
      if (!old || (quote.exchange === "NSE" && old.exchange === "BSE")) byCompany.set(key, quote);
    }

    cache.data = [...byCompany.values()]
      .sort((a, b) => {
        const priority = (quote: Suggestion) => {
          if (!quote.triggerDay) return 3;
          const week = weekStart(quote.triggerDay);
          if (week === thisWeek) return 0;
          if (week === previousWeek) return 1;
          return 2;
        };
        const pa = priority(a);
        const pb = priority(b);
        if (pa !== pb) return pa - pb;
        const da = a.triggerDay ? new Date(a.triggerDay).getTime() : 0;
        const db = b.triggerDay ? new Date(b.triggerDay).getTime() : 0;
        if (pa <= 1 && da !== db) return db - da;
        return a.name.localeCompare(b.name);
      })
      .map(({ triggerDay, ...quote }) => ({ ...quote, triggerDate: triggerDay ?? null }));

    cache.exp = Date.now() + 300_000;
    return cache.data;
  } catch {
    return cache.data;
  }
}

export const fetchSuggestions = createServerFn({ method: "POST" }).handler(async () => getSuggestions());

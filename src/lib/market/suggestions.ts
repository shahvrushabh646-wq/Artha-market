import { createServerFn } from "@tanstack/react-start";
import type { Quote } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
const cache = { exp: 0, symbols: [] as string[], data: [] as Quote[] };
const BSE_GROUPS = ["A", "B", "E", "F", "FC", "GC", "I", "IF", "IP", "M", "MS", "MT", "P", "R", "T", "TS", "W", "X", "XD", "XT", "Y", "Z", "ZP", "ZY"];

type SparkItem = {
  symbol?: string;
  response?: Array<{
    meta?: { regularMarketPrice?: number; currency?: string; exchangeName?: string; shortName?: string; longName?: string };
    timestamp?: number[];
    indicators?: { quote?: Array<{ high?: Array<number | null>; close?: Array<number | null> }> };
  }>;
};
type SparkResponse = { spark?: { result?: SparkItem[] } };
type Suggestion = Quote & { triggerDay?: string };

function num(v: unknown) { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function chunk<T>(a: T[], n: number) { const r: T[][] = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; }
function indiaDate(ts: number) { return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }).format(new Date(ts * 1000)); }
function indiaToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function weekStart(date: string) { const d = new Date(`${date}T00:00:00+05:30`); const day = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1)); return d.toISOString().slice(0, 10); }
function previousWeekStart(thisWeek: string) { const d = new Date(`${thisWeek}T00:00:00+05:30`); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); }

async function nseUniverse(): Promise<string[]> {
  try {
    const res = await fetch("https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv", { headers: { "User-Agent": UA, Accept: "text/csv,*/*" }, cache: "no-store" });
    if (!res.ok) return [];
    const lines = (await res.text()).split(/\r?\n/).filter(Boolean);
    const header = lines.shift()?.split(",").map((x) => x.trim().replace(/^\"|\"$/g, "").toUpperCase()) ?? [];
    const si = header.indexOf("SYMBOL"); const se = header.indexOf("SERIES"); if (si < 0) return [];
    return lines.map((line) => line.split(",").map((v) => v.trim().replace(/^\"|\"$/g, ""))).filter((cols) => se < 0 || cols[se] === "EQ").map((cols) => cols[si]).filter(Boolean).map((s) => `${s}.NS`);
  } catch { return []; }
}

async function bseUniverse(): Promise<string[]> {
  const out = new Set<string>();
  for (const group of BSE_GROUPS) {
    try {
      const u = new URL("https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w");
      u.searchParams.set("scripcode", ""); u.searchParams.set("Group", group); u.searchParams.set("industry", ""); u.searchParams.set("segment", "Equity"); u.searchParams.set("status", "Active");
      const res = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: "https://www.bseindia.com/" }, cache: "no-store" });
      if (!res.ok) continue;
      const raw = await res.json() as unknown;
      const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { Data?: unknown }).Data) ? (raw as { Data: unknown[] }).Data : [];
      for (const item of rows) { if (!item || typeof item !== "object") continue; const r = item as Record<string, unknown>; const code = String(r.scripcode ?? r.SCRIPCODE ?? r.scripCode ?? "").trim(); if (/^\d{6}$/.test(code)) out.add(`${code}.BO`); }
    } catch { /* continue */ }
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

async function sparkBatch(symbols: string[]): Promise<Suggestion[]> {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const u = new URL(`https://${host}/v7/finance/spark`);
      u.searchParams.set("symbols", symbols.join(",")); u.searchParams.set("range", "5y"); u.searchParams.set("interval", "1d"); u.searchParams.set("indicators", "quote");
      const res = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) continue;
      const raw = await res.json() as SparkResponse; const out: Suggestion[] = [];
      for (const item of raw.spark?.result ?? []) {
        const p = item.response?.[0]; const m = p?.meta ?? {}; const closes = p?.indicators?.quote?.[0]?.close ?? []; const highs = p?.indicators?.quote?.[0]?.high ?? []; const timestamps = p?.timestamp ?? [];
        const validHighs = highs.map(num).filter((x): x is number => x !== null); const price = num(m.regularMarketPrice) ?? [...closes].reverse().map(num).find((x): x is number => x !== null) ?? null;
        if (price === null || validHighs.length === 0) continue;
        const high5y = Math.max(...validHighs); const threshold = price < 20 ? high5y * 0.10 : high5y * 0.25; if (price > threshold) continue;
        let triggerDay: string | undefined;
        for (let i = closes.length - 1; i >= 0; i--) { const close = num(closes[i]); const ts = timestamps[i]; if (close !== null && close <= threshold && ts != null) { triggerDay = indiaDate(ts); break; } }
        const symbol = item.symbol ?? ""; if (!symbol) continue;
        out.push({ symbol, name: m.longName ?? m.shortName ?? symbol.replace(/\.NS$|\.BO$/i, ""), price, previousClose: null, change: null, changePct: null, currency: m.currency ?? "INR", exchange: m.exchangeName ?? (symbol.endsWith(".BO") ? "BSE" : "NSE"), high52w: null, low52w: null, high5y, low5y: null, price75: Math.round(high5y * 0.25 * 100) / 100, signal75: "BUY", volume: null, dayHigh: null, dayLow: null, ok: true, triggerDay });
      }
      return out;
    } catch { /* try second host */ }
  }
  return [];
}

async function getSuggestions(): Promise<Quote[]> {
  if (cache.exp > Date.now()) return cache.data;
  try {
    const symbols = await universe(); if (!symbols.length) return cache.data;
    const result: Suggestion[] = [];
    const batches = chunk(symbols, 50);
    // Yahoo Spark supports many symbols per request; scan concurrently in controlled groups.
    for (const group of chunk(batches, 8)) { const rows = await Promise.all(group.map((batch) => sparkBatch(batch))); for (const r of rows) result.push(...r); }

    const byCompany = new Map<string, Suggestion>();
    for (const q of result) {
      const key = q.name.replace(/[^A-Z0-9]/gi, "").toUpperCase(); const old = byCompany.get(key);
      if (!old || (q.exchange === "NSE" && old.exchange !== "NSE")) byCompany.set(key, q);
    }

    const thisWeek = currentWeekStart(); const previousWeek = previousWeekStart(thisWeek); const today = indiaToday();
    cache.data = [...byCompany.values()].sort((a, b) => {
      const priority = (q: Suggestion) => { if (!q.triggerDay) return 3; if (q.triggerDay === today) return 0; const w = weekStart(q.triggerDay); if (w === thisWeek) return 1; if (w === previousWeek) return 2; return 3; };
      const pa = priority(a), pb = priority(b); if (pa !== pb) return pa - pb;
      if (a.triggerDay && b.triggerDay && a.triggerDay !== b.triggerDay) { const da = Date.parse(a.triggerDay), db = Date.parse(b.triggerDay); if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return db - da; }
      return a.name.localeCompare(b.name);
    }).map(({ triggerDay, ...q }) => ({ ...q, triggerDate: triggerDay ?? null }));
    cache.exp = Date.now() + 300_000;
    return cache.data;
  } catch { return cache.data; }
}

export const fetchSuggestions = createServerFn({ method: "POST" }).handler(async () => getSuggestions());

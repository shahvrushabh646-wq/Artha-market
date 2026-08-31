import { createServerFn } from "@tanstack/react-start";
import type { Quote } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
const BSE_GROUPS = ["A", "B", "E", "F", "FC", "GC", "I", "IF", "IP", "M", "MS", "MT", "P", "R", "T", "TS", "W", "X", "XD", "XT", "Y", "Z", "ZP", "ZY"];
const SEED_SYMBOLS = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "ITC.NS", "LT.NS", "AXISBANK.NS", "BHARTIARTL.NS", "KOTAKBANK.NS", "HINDUNILVR.NS", "MARUTI.NS", "SUNPHARMA.NS", "TATAMOTORS.NS"];
const cache = { exp: 0, symbols: [] as string[], data: [] as Quote[], running: null as Promise<Quote[]> | null };
const historyCache = new Map<string, { exp: number; value: { price: number; high5y: number; triggerDay?: string } | null }>();

type Chart = { chart?: { result?: Array<{ meta?: Record<string, unknown>; timestamp?: number[]; indicators?: { quote?: Array<{ high?: Array<number | null>; close?: Array<number | null> }> } }> } };
type Suggestion = Quote & { triggerDay?: string };
function num(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function chunk<T>(items: T[], size: number): T[][] { const out: T[][] = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out; }
function indiaDate(ts: number): string { return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }).format(new Date(ts * 1000)); }
function weekStart(date: string): string { const d = new Date(`${date}T00:00:00+05:30`); const day = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1)); return d.toISOString().slice(0, 10); }
function currentWeekStart(): string { return weekStart(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())); }
function previousWeekStart(thisWeek: string): string { const d = new Date(`${thisWeek}T00:00:00+05:30`); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); }

async function nseUniverse(): Promise<string[]> {
  try {
    const res = await fetch("https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv", { headers: { "User-Agent": UA, Accept: "text/csv,*/*" }, cache: "no-store" });
    if (!res.ok) return [];
    const lines = (await res.text()).split(/\r?\n/).filter(Boolean);
    const header = lines.shift()?.split(",").map((x) => x.trim().replace(/^\"|\"$/g, "").toUpperCase()) ?? [];
    const symbolIndex = header.indexOf("SYMBOL"); const seriesIndex = header.indexOf("SERIES");
    if (symbolIndex < 0) return [];
    return lines.map((line) => line.split(",").map((v) => v.trim().replace(/^\"|\"$/g, ""))).filter((cols) => seriesIndex < 0 || cols[seriesIndex] === "EQ").map((cols) => cols[symbolIndex]).filter(Boolean).map((symbol) => `${symbol}.NS`);
  } catch { return []; }
}

async function bseUniverse(): Promise<string[]> {
  const out = new Set<string>();
  await Promise.all(BSE_GROUPS.map(async (group) => {
    try {
      const url = new URL("https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w");
      url.searchParams.set("scripcode", ""); url.searchParams.set("Group", group); url.searchParams.set("industry", ""); url.searchParams.set("segment", "Equity"); url.searchParams.set("status", "Active");
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Referer: "https://www.bseindia.com/" }, cache: "no-store" });
      if (!res.ok) return;
      const raw = (await res.json()) as unknown;
      const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { Data?: unknown }).Data) ? (raw as { Data: unknown[] }).Data : [];
      for (const item of rows) { if (!item || typeof item !== "object") continue; const row = item as Record<string, unknown>; const code = String(row.scripcode ?? row.SCRIPCODE ?? row.scripCode ?? "").trim(); if (/^\d{6}$/.test(code)) out.add(`${code}.BO`); }
    } catch { /* keep other groups */ }
  }));
  return [...out];
}

async function universe(): Promise<string[]> {
  if (cache.symbols.length) return cache.symbols;
  const [nse, bse] = await Promise.all([nseUniverse(), bseUniverse()]);
  const all = [...new Set([...nse, ...bse])];
  cache.symbols = all.length ? all : SEED_SYMBOLS;
  return cache.symbols;
}

async function history(symbol: string): Promise<{ price: number; high5y: number; triggerDay?: string } | null> {
  const hit = historyCache.get(symbol);
  if (hit && hit.exp > Date.now()) return hit.value;
  let value: { price: number; high5y: number; triggerDay?: string } | null = null;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const url = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);
      url.searchParams.set("range", "5y"); url.searchParams.set("interval", "1d"); url.searchParams.set("includePrePost", "false");
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) continue;
      const raw = (await res.json()) as Chart; const row = raw.chart?.result?.[0]; if (!row) continue;
      const highs = (row.indicators?.quote?.[0]?.high ?? []).map(num).filter((v): v is number => v !== null);
      const closes = (row.indicators?.quote?.[0]?.close ?? []).map(num); const timestamps = row.timestamp ?? [];
      const price = num(row.meta?.regularMarketPrice) ?? [...closes].reverse().find((v) => v !== null) ?? null;
      if (price === null || !highs.length) continue;
      const high5y = Math.max(...highs); if (!Number.isFinite(high5y) || high5y <= 0) continue;
      const threshold = price < 20 ? high5y * 0.10 : high5y * 0.25;
      let triggerDay: string | undefined;
      for (let i = 1; i < closes.length; i += 1) { const previous = closes[i - 1], current = closes[i], ts = timestamps[i]; if (previous !== null && current !== null && previous > threshold && current <= threshold && ts != null) triggerDay = indiaDate(ts); }
      if (!triggerDay && price <= threshold) { for (let i = closes.length - 1; i >= 0; i -= 1) { const current = closes[i], ts = timestamps[i]; if (current !== null && current <= threshold && ts != null) { triggerDay = indiaDate(ts); break; } } }
      value = { price, high5y, triggerDay }; break;
    } catch { /* try second Yahoo endpoint */ }
  }
  // Do not poison the scanner for 15 minutes when Yahoo temporarily rate-limits one symbol.
  historyCache.set(symbol, { exp: Date.now() + (value ? 15 * 60_000 : 60_000), value });
  return value;
}

async function scanSuggestions(): Promise<Quote[]> {
  const symbols = await universe(); if (!symbols.length) return cache.data;
  const thisWeek = currentWeekStart(); const previousWeek = previousWeekStart(thisWeek); const result: Suggestion[] = [];
  // Yahoo throttles large bursts. Keep a steady 24-request concurrency instead of 100 simultaneous requests.
  for (const batch of chunk(symbols, 24)) {
    const rows = await Promise.allSettled(batch.map(async (symbol) => ({ symbol, data: await history(symbol) })));
    for (const row of rows) {
      if (row.status !== "fulfilled" || !row.value.data) continue;
      const { symbol, data } = row.value; const threshold = data.high5y * (data.price < 20 ? 0.10 : 0.25);
      if (data.price > threshold) continue;
      result.push({ symbol, name: symbol.replace(/\.NS$|\.BO$/i, ""), price: data.price, previousClose: null, change: null, changePct: null, currency: "INR", exchange: symbol.endsWith(".BO") ? "BSE" : "NSE", high52w: null, low52w: null, high5y: data.high5y, low5y: null, price75: Math.round(data.high5y * 0.25 * 100) / 100, signal75: "BUY", volume: null, dayHigh: null, dayLow: null, ok: true, triggerDay: data.triggerDay });
    }
  }
  const byCompany = new Map<string, Suggestion>();
  for (const quote of result) { const key = quote.name.replace(/[^A-Z0-9]/gi, "").toUpperCase(); const old = byCompany.get(key); if (!old || (quote.exchange === "NSE" && old.exchange === "BSE")) byCompany.set(key, quote); }
  cache.data = [...byCompany.values()].sort((a, b) => {
    const priority = (quote: Suggestion) => { if (!quote.triggerDay) return 3; const w = weekStart(quote.triggerDay); if (w === thisWeek) return 0; if (w === previousWeek) return 1; return 2; };
    const pa = priority(a), pb = priority(b); if (pa !== pb) return pa - pb;
    const da = a.triggerDay ? new Date(a.triggerDay).getTime() : 0, db = b.triggerDay ? new Date(b.triggerDay).getTime() : 0;
    if (pa <= 1 && da !== db) return db - da; return a.name.localeCompare(b.name);
  }).map(({ triggerDay, ...quote }) => ({ ...quote, triggerDate: triggerDay ?? null }));
  cache.exp = Date.now() + 15 * 60_000;
  return cache.data;
}

async function getSuggestions(): Promise<Quote[]> {
  if (cache.data.length && cache.exp > Date.now()) return cache.data;
  if (cache.running) return cache.running;
  cache.running = scanSuggestions().catch(() => cache.data).finally(() => { cache.running = null; });
  return cache.running;
}

export const fetchSuggestions = createServerFn({ method: "POST" }).handler(async () => getSuggestions());

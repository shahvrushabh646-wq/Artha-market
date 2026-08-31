import { createServerFn } from "@tanstack/react-start";
import type { Quote } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
const BSE_GROUPS = ["A", "B", "E", "F", "FC", "GC", "I", "IF", "IP", "M", "MS", "MT", "P", "R", "T", "TS", "W", "X", "XD", "XT", "Y", "Z", "ZP", "ZY"];
const FALLBACK = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "ITC.NS", "LT.NS", "AXISBANK.NS", "BHARTIARTL.NS", "KOTAKBANK.NS", "HINDUNILVR.NS", "MARUTI.NS", "SUNPHARMA.NS", "TATAMOTORS.NS"];
const cache = { symbols: [] as string[], data: [] as Quote[], expires: 0, running: null as Promise<Quote[]> | null };

type SparkPoint = { timestamp?: number[]; indicators?: { quote?: Array<{ high?: Array<number | null>; close?: Array<number | null> }> }; meta?: Record<string, unknown> };
type SparkResult = { symbol?: string; response?: SparkPoint[] };
type SparkPayload = { spark?: { result?: SparkResult[] } };
type Suggestion = Quote & { triggerDay?: string };

function num(v: unknown): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function chunk<T>(items: T[], size: number): T[][] { const out: T[][] = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out; }
function indiaDate(ts: number): string { return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }).format(new Date(ts * 1000)); }
function weekStart(date: string): string { const d = new Date(`${date}T00:00:00+05:30`); const day = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1)); return d.toISOString().slice(0, 10); }
function currentWeekStart(): string { return weekStart(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())); }
function previousWeekStart(thisWeek: string): string { const d = new Date(`${thisWeek}T00:00:00+05:30`); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); }

function parseCsvLine(line: string): string[] {
  const cells: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < line.length; i += 1) { const ch = line[i]; if (ch === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted; } else if (ch === "," && !quoted) { cells.push(cell.trim()); cell = ""; } else cell += ch; }
  cells.push(cell.trim()); return cells;
}

async function nseUniverse(): Promise<string[]> {
  try {
    const res = await fetch("https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv", { headers: { "User-Agent": UA, Accept: "text/csv,*/*" }, cache: "no-store" });
    if (!res.ok) return [];
    const lines = (await res.text()).split(/\r?\n/).filter(Boolean);
    const header = parseCsvLine(lines.shift() ?? "").map((x) => x.replace(/^"|"$/g, "").trim().toUpperCase());
    const si = header.indexOf("SYMBOL"), sri = header.indexOf("SERIES"); if (si < 0) return [];
    return lines.map(parseCsvLine).filter((c) => si < c.length && (sri < 0 || c[sri]?.trim().toUpperCase() === "EQ")).map((c) => c[si]?.replace(/^"|"$/g, "").trim().toUpperCase()).filter((s): s is string => Boolean(s) && /^[A-Z0-9&.-]+$/.test(s)).map((s) => `${s}.NS`);
  } catch { return []; }
}

async function bseUniverse(): Promise<string[]> {
  const out = new Set<string>();
  await Promise.all(BSE_GROUPS.map(async (group) => {
    try {
      const u = new URL("https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w");
      u.searchParams.set("scripcode", ""); u.searchParams.set("Group", group); u.searchParams.set("industry", ""); u.searchParams.set("segment", "Equity"); u.searchParams.set("status", "Active");
      const res = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*", Origin: "https://www.bseindia.com", Referer: "https://www.bseindia.com/" }, cache: "no-store" });
      if (!res.ok) return;
      const raw = await res.json() as unknown;
      const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { Data?: unknown }).Data) ? (raw as { Data: unknown[] }).Data : [];
      for (const item of rows) { if (!item || typeof item !== "object") continue; const r = item as Record<string, unknown>; const code = String(r.scripcode ?? r.SCRIPCODE ?? r.scripCode ?? "").trim(); if (/^\d{6}$/.test(code)) out.add(`${code}.BO`); }
    } catch { /* one BSE group failing must not stop the universe */ }
  }));
  return [...out];
}

async function universe(): Promise<string[]> {
  if (cache.symbols.length) return cache.symbols;
  const [nse, bse] = await Promise.all([nseUniverse(), bseUniverse()]);
  const all = [...new Set([...nse, ...bse])];
  cache.symbols = all.length ? all : FALLBACK;
  return cache.symbols;
}

async function sparkBatch(symbols: string[]): Promise<Map<string, { price: number; high5y: number; triggerDay?: string }>> {
  const result = new Map<string, { price: number; high5y: number; triggerDay?: string }>();
  if (!symbols.length) return result;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const u = new URL(`https://${host}/v7/finance/spark`);
      u.searchParams.set("symbols", symbols.join(",")); u.searchParams.set("range", "5y"); u.searchParams.set("interval", "1wk");
      const res = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) continue;
      const payload = await res.json() as SparkPayload;
      for (const item of payload.spark?.result ?? []) {
        const symbol = item.symbol; const point = item.response?.[0]; if (!symbol || !point) continue;
        const quote = point.indicators?.quote?.[0]; if (!quote) continue;
        const highs = (quote.high ?? []).map(num).filter((v): v is number => v !== null);
        const closes = quote.close ?? [];
        const price = num(point.meta?.regularMarketPrice) ?? [...closes].reverse().map(num).find((v): v is number => v !== null) ?? null;
        if (price === null || !highs.length) continue;
        const high5y = Math.max(...highs); if (!Number.isFinite(high5y) || high5y <= 0) continue;
        const threshold = price < 20 ? high5y * 0.10 : high5y * 0.25;
        if (price > threshold) { result.set(symbol, { price, high5y }); continue; }
        const ts = point.timestamp ?? []; let triggerDay: string | undefined;
        for (let i = closes.length - 1; i >= 1; i -= 1) { const prev = num(closes[i - 1]), cur = num(closes[i]); if (prev !== null && cur !== null && prev > threshold && cur <= threshold && ts[i] != null) { triggerDay = indiaDate(ts[i]!); break; } }
        if (!triggerDay && price <= threshold) { for (let i = closes.length - 1; i >= 0; i -= 1) { const cur = num(closes[i]); if (cur !== null && cur <= threshold && ts[i] != null) { triggerDay = indiaDate(ts[i]!); break; } } }
        result.set(symbol, { price, high5y, triggerDay });
      }
      if (result.size) return result;
    } catch { /* try second Yahoo endpoint */ }
  }
  return result;
}

async function scanSuggestions(): Promise<Quote[]> {
  const symbols = await universe(); if (!symbols.length) return cache.data;
  const thisWeek = currentWeekStart(), previousWeek = previousWeekStart(thisWeek);
  const batches = chunk(symbols, 75); const result: Suggestion[] = [];
  // Five concurrent multi-symbol Yahoo requests are much faster than one request per stock.
  for (let i = 0; i < batches.length; i += 5) {
    const group = batches.slice(i, i + 5);
    const maps = await Promise.all(group.map((b) => sparkBatch(b)));
    for (const map of maps) for (const [symbol, data] of map) {
      const threshold = data.high5y * (data.price < 20 ? 0.10 : 0.25); if (data.price > threshold) continue;
      result.push({ symbol, name: symbol.replace(/\.NS$|\.BO$/i, ""), price: data.price, previousClose: null, change: null, changePct: null, currency: "INR", exchange: symbol.endsWith(".BO") ? "BSE" : "NSE", high52w: null, low52w: null, high5y: data.high5y, low5y: null, price75: Math.round(data.high5y * 0.25 * 100) / 100, signal75: "BUY", volume: null, dayHigh: null, dayLow: null, ok: true, triggerDay: data.triggerDay });
    }
  }
  const byCompany = new Map<string, Suggestion>();
  for (const q of result) { const key = q.name.replace(/[^A-Z0-9]/gi, "").toUpperCase(); const old = byCompany.get(key); if (!old || (q.exchange === "NSE" && old.exchange === "BSE")) byCompany.set(key, q); }
  cache.data = [...byCompany.values()].sort((a, b) => {
    const priority = (q: Suggestion) => { if (!q.triggerDay) return 3; const w = weekStart(q.triggerDay); return w === thisWeek ? 0 : w === previousWeek ? 1 : 2; };
    const pa = priority(a), pb = priority(b); if (pa !== pb) return pa - pb;
    if (pa <= 1) return (b.triggerDay ? new Date(b.triggerDay).getTime() : 0) - (a.triggerDay ? new Date(a.triggerDay).getTime() : 0);
    return a.name.localeCompare(b.name);
  }).map(({ triggerDay, ...q }) => ({ ...q, triggerDate: triggerDay ?? null }));
  // Successful non-empty results are cached longer; empty scans retry quickly.
  cache.expires = cache.data.length ? Date.now() + 15 * 60_000 : Date.now() + 30_000;
  return cache.data;
}

async function getSuggestions(): Promise<Quote[]> {
  if (cache.data.length && cache.expires > Date.now()) return cache.data;
  if (cache.running) return cache.running;
  cache.running = scanSuggestions().catch(() => cache.data).finally(() => { cache.running = null; });
  return cache.running;
}

export const fetchSuggestions = createServerFn({ method: "POST" }).handler(async () => getSuggestions());

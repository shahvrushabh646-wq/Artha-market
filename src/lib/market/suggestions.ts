import { createServerFn } from "@tanstack/react-start";
import type { Quote } from "./types";

const UA = "Mozilla/5.0";
const cache = { exp: 0, symbols: [] as string[], data: [] as Quote[] };
const BSE_GROUPS = ["A", "B", "E", "F", "FC", "GC", "I", "IF", "IP", "M", "MS", "MT", "P", "R", "T", "TS", "W", "X", "XD", "XT", "Y", "Z", "ZP", "ZY"];

type Chart = { chart?: { result?: Array<{ meta?: Record<string, unknown>; indicators?: { quote?: Array<{ high?: Array<number | null>; close?: Array<number | null> }> } }> } };
function num(v: unknown) { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function chunk<T>(a: T[], n: number) { const r: T[][] = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; }

async function nseUniverse(): Promise<string[]> {
  try {
    const res = await fetch("https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv", { headers: { "User-Agent": UA, Accept: "text/csv,*/*" }, cache: "no-store" });
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = lines.shift()?.split(",").map(x => x.trim().replace(/^"|"$/g, "").toUpperCase()) ?? [];
    const si = header.indexOf("SYMBOL"), se = header.indexOf("SERIES");
    if (si < 0) return [];
    return lines.map(line => line.split(",").map(x => x.trim().replace(/^"|"$/g, ""))).filter(c => !se || c[se] === "EQ").map(c => c[si]).filter(Boolean).map(s => `${s}.NS`);
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
      const rows = Array.isArray(raw) ? raw : (raw && typeof raw === "object" && Array.isArray((raw as { Data?: unknown }).Data) ? (raw as { Data: unknown[] }).Data : []);
      for (const item of rows) {
        if (!item || typeof item !== "object") continue;
        const r = item as Record<string, unknown>;
        const code = String(r.scripcode ?? r.SCRIPCODE ?? r.scripCode ?? "").trim();
        if (/^\d{6}$/.test(code)) out.add(`${code}.BO`);
      }
    } catch {}
  }
  return [...out];
}

async function universe(): Promise<string[]> {
  if (cache.symbols.length && cache.exp > Date.now()) return cache.symbols;
  const [nse, bse] = await Promise.all([nseUniverse(), bseUniverse()]);
  // Keep NSE when the same company is listed on both exchanges; BSE-only securities remain.
  const all = [...new Set([...nse, ...bse])];
  cache.symbols = all;
  return all;
}

async function history(symbol: string) {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const u = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);
      u.searchParams.set("range", "5y"); u.searchParams.set("interval", "1d");
      const res = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) continue;
      const raw = await res.json() as Chart, row = raw.chart?.result?.[0];
      const highs = (row?.indicators?.quote?.[0]?.high ?? []).map(num).filter((x): x is number => x !== null);
      const closes = (row?.indicators?.quote?.[0]?.close ?? []).map(num).filter((x): x is number => x !== null);
      const price = num(row?.meta?.regularMarketPrice) ?? closes.at(-1) ?? null;
      if (price !== null && highs.length) return { price, high5y: Math.max(...highs) };
    } catch {}
  }
  return null;
}

async function getSuggestions(): Promise<Quote[]> {
  const symbols = await universe();
  const result: Quote[] = [];
  for (const batch of chunk(symbols, 10)) {
    const rows = await Promise.all(batch.map(async symbol => ({ symbol, data: await history(symbol) })));
    for (const { symbol, data } of rows) {
      if (!data) continue;
      const { price, high5y } = data;
      const threshold = high5y * (price < 20 ? 0.10 : 0.25);
      if (price > threshold) continue;
      result.push({ symbol, name: symbol.replace(/\.NS$|\.BO$/i, ""), price, previousClose: null, change: null, changePct: null, currency: "INR", exchange: symbol.endsWith(".BO") ? "BSE" : "NSE", high52w: null, low52w: null, high5y, low5y: null, price75: Math.round(high5y * 0.25 * 100) / 100, signal75: "BUY", volume: null, dayHigh: null, dayLow: null, ok: true });
    }
  }
  // De-duplicate by company symbol/name and prefer NSE when both exchange symbols exist.
  const byCompany = new Map<string, Quote>();
  for (const q of result) {
    const key = q.name.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const old = byCompany.get(key);
    if (!old || (q.exchange === "NSE" && old.exchange === "BSE")) byCompany.set(key, q);
  }
  cache.data = [...byCompany.values()].sort((a, b) => a.name.localeCompare(b.name));
  cache.exp = Date.now() + 300_000;
  return cache.data;
}

export const fetchSuggestions = createServerFn({ method: "POST" }).handler(async () => getSuggestions());

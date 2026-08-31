import { createServerFn } from "@tanstack/react-start";
import { MOVERS_UNIVERSE } from "./config";
import type { Quote } from "./types";

const UA = "Mozilla/5.0";
const cache = { exp: 0, data: [] as Quote[] };

type Chart = { chart?: { result?: Array<{ meta?: Record<string, unknown>; timestamp?: number[]; indicators?: { quote?: Array<{ high?: Array<number | null>; close?: Array<number | null> }> } }> } };
function number(v: unknown) { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function chunk<T>(a: T[], n: number) { const r: T[][] = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; }

async function history(symbol: string) {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const u = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);
      u.searchParams.set("range", "5y"); u.searchParams.set("interval", "1d"); u.searchParams.set("events", "div");
      const res = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) continue;
      const raw = await res.json() as Chart;
      const row = raw.chart?.result?.[0];
      const highs = (row?.indicators?.quote?.[0]?.high ?? []).map(number).filter((x): x is number => x !== null);
      const closes = (row?.indicators?.quote?.[0]?.close ?? []).map(number).filter((x): x is number => x !== null);
      const price = number(row?.meta?.regularMarketPrice) ?? closes.at(-1) ?? null;
      if (price !== null && highs.length) return { row, price, high5y: Math.max(...highs) };
    } catch {}
  }
  return null;
}

async function getSuggestions(): Promise<Quote[]> {
  if (cache.exp > Date.now()) return cache.data;
  const result: Quote[] = [];
  for (const batch of chunk([...new Set(MOVERS_UNIVERSE.map(String))], 8)) {
    const rows = await Promise.all(batch.map(async symbol => ({ symbol, data: await history(symbol) })));
    for (const { symbol, data } of rows) {
      if (!data) continue;
      const { price, high5y } = data;
      const isBelow20 = price < 20;
      const threshold = high5y * (isBelow20 ? 0.10 : 0.25);
      if (price > threshold) continue;
      result.push({ symbol, name: symbol.replace(/\.NS$|\.BO$/i, ""), price, previousClose: null, change: null, changePct: null, currency: "INR", exchange: symbol.endsWith(".BO") ? "BSE" : "NSE", high52w: null, low52w: null, high5y, low5y: null, price75: Math.round(high5y * 0.25 * 100) / 100, signal75: "BUY", volume: null, dayHigh: null, dayLow: null, ok: true });
    }
  }
  const unique = new Map(result.map(q => [q.symbol, q]));
  cache.data = [...unique.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  cache.exp = Date.now() + 300_000;
  return cache.data;
}

export const fetchSuggestions = createServerFn({ method: "POST" }).handler(async () => getSuggestions());

import { createServerFn } from "@tanstack/react-start";
import { MOVERS_UNIVERSE } from "./config";
import type { Quote } from "./types";

const UA = "Mozilla/5.0";
const cache = { exp: 0, data: [] as Quote[] };

type SparkResult = { symbol?: string; response?: Array<{ meta?: { regularMarketPrice?: number; currency?: string; exchangeName?: string; shortName?: string; longName?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ high?: Array<number | null>; close?: Array<number | null> }> } }> };
type SparkPayload = { spark?: { result?: SparkResult[] } };

function chunks<T>(items: T[], size: number) { const out: T[][] = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out; }

async function fetchBatch(symbols: string[]): Promise<SparkResult[]> {
  const makeUrl = (host: string) => { const u = new URL(`https://${host}/v7/finance/spark`); u.searchParams.set("symbols", symbols.join(",")); u.searchParams.set("range", "5y"); u.searchParams.set("interval", "1d"); u.searchParams.set("indicators", "quote"); return u; };
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const res = await fetch(makeUrl(host), { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) continue;
      const raw = await res.json() as SparkPayload;
      if (Array.isArray(raw.spark?.result)) return raw.spark.result;
    } catch {}
  }
  return [];
}

async function getSuggestions(): Promise<Quote[]> {
  if (cache.exp > Date.now()) return cache.data;
  const symbols = [...new Set(MOVERS_UNIVERSE.map(String))];
  const result: Quote[] = [];
  for (const batch of chunks(symbols, 20)) {
    const rows = await fetchBatch(batch);
    for (const item of rows) {
      const response = item.response?.[0];
      const meta = response?.meta ?? {};
      const closes = (response?.indicators?.quote?.[0]?.close ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      const highs = (response?.indicators?.quote?.[0]?.high ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      const price = Number(meta.regularMarketPrice ?? closes.at(-1));
      if (!Number.isFinite(price) || highs.length === 0) continue;
      const high5y = Math.max(...highs);
      // ₹20+ stocks trigger at 25% of 5Y high. Stocks below ₹20 trigger at 10% of 5Y high.
      const isBelow20 = price < 20;
      const threshold = high5y * (isBelow20 ? 0.10 : 0.25);
      if (price > threshold) continue;
      const symbol = item.symbol ?? "";
      result.push({ symbol, name: meta.longName ?? meta.shortName ?? symbol, price, previousClose: null, change: null, changePct: null, currency: meta.currency ?? "INR", exchange: meta.exchangeName ?? (symbol.endsWith(".BO") ? "BSE" : "NSE"), high52w: null, low52w: null, high5y, low5y: null, price75: Math.round(high5y * 0.25 * 100) / 100, signal75: "BUY", volume: null, dayHigh: null, dayLow: null, ok: true });
    }
  }
  const unique = new Map(result.map(q => [q.symbol, q]));
  cache.data = [...unique.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  cache.exp = Date.now() + 300_000;
  return cache.data;
}

export const fetchSuggestions = createServerFn({ method: "POST" }).handler(async () => getSuggestions());

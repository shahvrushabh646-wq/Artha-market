import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Chart = {
  chart?: {
    result?: Array<{
      meta?: Record<string, unknown>;
      indicators?: { quote?: Array<{ high?: Array<number | null>; close?: Array<number | null> }> };
    }>;
  };
};

export type DrawdownRow = {
  symbol: string;
  price: number | null;
  high5y: number | null;
  /** Percent down from 5Y high: ((high5y - price) / high5y) * 100. Null if not verified. */
  downFrom5yHighPct: number | null;
};

const UA = "Mozilla/5.0 (compatible; ArthaMarket/1.0)";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function yahooSymbol(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (!s) return s;
  if (s.endsWith(".NS") || s.endsWith(".BO")) return s;
  return `${s}.NS`;
}

async function loadDrawdown(symbolInput: string): Promise<DrawdownRow> {
  const symbol = yahooSymbol(symbolInput);
  const base = {
    symbol: symbolInput.trim().toUpperCase().replace(/\.NS$|\.BO$/i, "") || symbol,
    price: null as number | null,
    high5y: null as number | null,
    downFrom5yHighPct: null as number | null,
  };
  if (!symbol) return base;

  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const u = new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);
      u.searchParams.set("range", "5y");
      u.searchParams.set("interval", "1d");
      const res = await fetch(u.toString(), {
        headers: { "User-Agent": UA, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const raw = (await res.json()) as Chart;
      const row = raw.chart?.result?.[0];
      if (!row) continue;
      const highs = (row.indicators?.quote?.[0]?.high ?? []).map(num).filter((x): x is number => x !== null && x > 0);
      const closes = (row.indicators?.quote?.[0]?.close ?? []).map(num).filter((x): x is number => x !== null && x > 0);
      const price = num(row.meta?.regularMarketPrice) ?? closes.at(-1) ?? null;
      const high5y = highs.length ? Math.max(...highs) : null;
      if (price === null || high5y === null || high5y <= 0) continue;
      const down = ((high5y - price) / high5y) * 100;
      const downFrom5yHighPct = Math.round(Math.max(0, down) * 100) / 100;
      return {
        symbol: base.symbol,
        price: Math.round(price * 100) / 100,
        high5y: Math.round(high5y * 100) / 100,
        downFrom5yHighPct,
      };
    } catch {
      continue;
    }
  }
  return base;
}

export const fetchHoldingsDrawdowns = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z
      .object({
        symbols: z.array(z.string().min(1).max(40)).min(1).max(80),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const unique = [...new Set(data.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
    const out: DrawdownRow[] = [];
    for (let i = 0; i < unique.length; i += 6) {
      const batch = unique.slice(i, i + 6);
      const rows = await Promise.all(batch.map((s) => loadDrawdown(s)));
      out.push(...rows);
    }
    return out;
  });

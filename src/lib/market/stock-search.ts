import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type StockSearchHit = { symbol: string; name: string; exchange: string };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";

export const searchStocks = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ query: z.string().min(3).max(50) }).parse(data))
  .handler(async ({ data }): Promise<StockSearchHit[]> => {
    const q = data.query.trim().toUpperCase();
    if (q.length < 3) return [];

    try {
      const res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`, {
        headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { quotes?: Array<Record<string, unknown>> };
      return (json.quotes ?? [])
        .filter((x) => {
          const symbol = String(x.symbol ?? "");
          const exchange = String(x.exchange ?? "");
          return symbol.endsWith(".NS") || exchange === "NSI" || exchange === "NSE";
        })
        .map((x) => ({
          symbol: String(x.symbol ?? "").replace(/\.NS$/i, "").toUpperCase() + ".NS",
          name: String(x.longname ?? x.shortname ?? x.symbol ?? ""),
          exchange: "NSE",
        }))
        .filter((x) => x.symbol !== ".NS" && x.name)
        .filter((x, i, a) => a.findIndex((y) => y.symbol === x.symbol) === i)
        .slice(0, 8);
    } catch {
      return [];
    }
  });

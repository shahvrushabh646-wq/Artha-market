import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { companyName } from "@/lib/market/config";

export type StockSearchHit = { symbol: string; name: string; exchange: string };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
type CacheEntry = { expires: number; value: StockSearchHit[] };
const cache = new Map<string, CacheEntry>();

export const searchStocks = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ query: z.string().min(2).max(50) }).parse(data))
  .handler(async ({ data }): Promise<StockSearchHit[]> => {
    const q = data.query.trim().toUpperCase();
    if (q.length < 2) return [];

    const cached = cache.get(q);
    if (cached && cached.expires > Date.now()) return cached.value;

    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&enableFuzzyQuery=false`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { quotes?: Array<Record<string, unknown>> };
      const result = (json.quotes ?? [])
        .filter((x) => {
          const symbol = String(x.symbol ?? "").toUpperCase();
          const exchange = String(x.exchange ?? "").toUpperCase();
          return symbol.endsWith(".NS") || symbol.endsWith(".BO") || exchange === "NSI" || exchange === "NSE" || exchange === "BSE" || exchange === "BOM";
        })
        .map((x) => {
          const rawSymbol = String(x.symbol ?? "").toUpperCase();
          const isBse = rawSymbol.endsWith(".BO") || ["BSE", "BOM"].includes(String(x.exchange ?? "").toUpperCase());
          const baseSymbol = rawSymbol.replace(/\.(NS|BO)$/i, "");
          return {
            symbol: baseSymbol + (isBse ? ".BO" : ".NS"),
            name: companyName(baseSymbol, String(x.longname ?? x.shortname ?? x.symbol ?? "")),
            exchange: isBse ? "BSE" : "NSE",
          };
        })
        .filter((x) => x.symbol !== ".NS" && x.symbol !== ".BO" && x.name)
        .filter((x, i, a) => a.findIndex((y) => y.symbol === x.symbol) === i)
        .slice(0, 10);

      cache.set(q, { expires: Date.now() + 5 * 60_000, value: result });
      return result;
    } catch {
      return [];
    }
  });

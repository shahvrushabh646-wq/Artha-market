import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchShareholding, type ShareholdingQuarter } from "@/lib/market/shareholding";
import { fetchSuggestions } from "@/lib/market/suggestions";

export type SuggestedHolding = {
  symbol: string;
  name: string;
  quarter: ShareholdingQuarter | null;
  note: string | null;
};
export type SuggestedHoldingsResult = {
  holdings: SuggestedHolding[];
  checked: number;
  unavailable: number;
  totalSuggested: number;
};

function istDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export const fetchSuggestedHoldings = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ refresh: z.boolean().optional() }).parse(data ?? {}))
  .handler(async () => {
    const suggestions = await fetchSuggestions({ data: { period: "current", sector: "All" } });
    const unique = new Map<string, (typeof suggestions)[number]>();
    for (const share of suggestions) {
      const symbol = String(share.symbol || "").trim().toUpperCase();
      if (symbol && !unique.has(symbol)) unique.set(symbol, share);
    }
    const holdings = [...unique.values()].map((share) => ({
      symbol: String(share.symbol).trim().toUpperCase(),
      name: share.name || share.symbol,
      quarter: null,
      note: "Checking latest exchange filing…",
    }));
    return { holdings, checked: 0, unavailable: 0, totalSuggested: holdings.length } satisfies SuggestedHoldingsResult;
  });

export const fetchSuggestedHoldingsBatch = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({
    symbols: z.array(z.string().min(1).max(40)).min(1).max(200),
    refresh: z.boolean().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const items: Array<{ symbol: string; quarter: ShareholdingQuarter | null; note: string | null }> = [];
    for (let start = 0; start < data.symbols.length; start += 8) {
      const batch = data.symbols.slice(start, start + 8);
      const results = await Promise.all(batch.map(async (symbol) => {
        try {
          const result = await fetchShareholding({ data: { symbol, refresh: Boolean(data.refresh) } });
          const latest = result.quarters[0] ?? null;
          if (!latest || (latest.fii === null && latest.dii === null && latest.public === null && latest.promoter === null)) {
            return { symbol, quarter: null, note: result.note || "No verified latest-quarter shareholding values returned." };
          }
          return { symbol, quarter: latest, note: result.note };
        } catch (error) {
          return { symbol, quarter: null, note: error instanceof Error ? error.message : "Shareholding provider request failed." };
        }
      }));
      items.push(...results);
    }
    return items;
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchLatestShareholdingForHoldings, fetchShareholding, type ShareholdingQuarter } from "@/lib/market/shareholding";
import { fetchSuggestions } from "@/lib/market/suggestions";

export type SuggestedHolding = {
  symbol: string;
  name: string;
  price: number | null;
  high5y: number | null;
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
  .validator((data: unknown) => z.object({
    refresh: z.boolean().optional(),
    fallback: z.array(z.object({ symbol: z.string().min(1).max(40), name: z.string().max(200).optional(), price: z.number().nullable().optional(), high5y: z.number().nullable().optional() })).max(500).optional(),
  }).parse(data ?? {}))
  .handler(async ({ data }) => {
    // The live NSE universe/provider can fail at the server boundary. Keep Holdings
    // usable from the exact current Suggestions list cached by the client, rather
    // than turning a temporary market-data outage into a page-level error.
    let suggestions: Awaited<ReturnType<typeof fetchSuggestions>> = [];
    try {
      suggestions = await fetchSuggestions({ data: { period: "current", sector: "All" } });
    } catch {
      suggestions = [];
    }
    // The Suggestions screen persists its last successful current list in browser storage.
    // Use that exact list if the server-side NSE universe request temporarily returns empty.
    if (!suggestions.length && data.fallback?.length) {
      suggestions = data.fallback.map((item) => ({
        symbol: item.symbol.trim().toUpperCase(),
        name: item.name?.trim() || item.symbol.trim().toUpperCase(),
        price: item.price ?? null,
        high5y: item.high5y ?? null,
      })) as typeof suggestions;
    }
    const unique = new Map<string, (typeof suggestions)[number]>();
    for (const share of suggestions) {
      const symbol = String(share.symbol || "").trim().toUpperCase();
      if (symbol && !unique.has(symbol)) unique.set(symbol, share);
    }
    const holdings = [...unique.values()].map((share) => ({
      symbol: String(share.symbol).trim().toUpperCase(),
      name: share.name || share.symbol,
      price: typeof share.price === "number" && Number.isFinite(share.price) ? share.price : null,
      high5y: typeof share.high5y === "number" && Number.isFinite(share.high5y) ? share.high5y : null,
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
    for (let start = 0; start < data.symbols.length; start += 3) {
      const batch = data.symbols.slice(start, start + 3);
      const results = await Promise.all(batch.map(async (symbol) => {
        const check = async (refresh: boolean) => {
          // Overview uses the fast, dated exchange snapshot/history first.
          // Fall back to the full provider drill-down only when no verified quarter
          // exists in those datasets.
          const fastLatest = await fetchLatestShareholdingForHoldings(symbol);
          if (fastLatest) return { symbol, quarter: fastLatest, note: "Latest dated exchange snapshot / parsed quarterly filing." };
          const result = await fetchShareholding({ data: { symbol, refresh } });
          const latest = result.quarters[0] ?? null;
          if (!latest || (latest.fii === null && latest.dii === null && latest.public === null && latest.promoter === null)) {
            return { symbol, quarter: null, note: result.note || "No verified latest-quarter shareholding values returned." };
          }
          return { symbol, quarter: latest, note: result.note };
        };
        try {
          const first = await check(Boolean(data.refresh));
          // Retry a missing/temporarily blocked filing once through the warm cache
          // and alternate source path before marking this symbol unavailable.
          if (first.quarter) return first;
          try {
            const retry = await check(false);
            if (retry.quarter) return retry;
            return { ...retry, note: retry.note || first.note || "Latest filing could not be verified after retry." };
          } catch {
            return first;
          }
        } catch (error) {
          try {
            const retry = await check(false);
            if (retry.quarter) return retry;
            return { ...retry, note: retry.note || (error instanceof Error ? error.message : "Shareholding provider request failed.") };
          } catch (retryError) {
            return { symbol, quarter: null, note: retryError instanceof Error ? retryError.message : error instanceof Error ? error.message : "Shareholding provider request failed after retry." };
          }
        }
      }));
      items.push(...results);
    }
    return items;
  });

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
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
let cached: { date: string; fingerprint: string; expires: number; data: SuggestedHoldingsResult } | null = null;

async function loadSuggestedHoldings(refresh = false): Promise<SuggestedHoldingsResult> {
  const today = istDateKey();
  const suggestions = await fetchSuggestions({ data: { period: "current", sector: "All" } });
  const unique = new Map<string, (typeof suggestions)[number]>();
  for (const share of suggestions) {
    const symbol = String(share.symbol || "").trim().toUpperCase();
    if (symbol && !unique.has(symbol)) unique.set(symbol, share);
  }
  const shares = [...unique.values()];
  const fingerprint = shares.map((share) => String(share.symbol).trim().toUpperCase()).join("|");
  // Keep the universe synchronized with Suggestions by fingerprint; refresh filing data periodically as well.
  if (!refresh && cached?.date === today && cached.fingerprint === fingerprint && cached.expires > Date.now()) return cached.data;

  const holdings: SuggestedHolding[] = [];
  let unavailable = 0;
  // Include every current Suggestions stock; unavailable filings remain visible without fabricated percentages.
  // Fetch several symbols concurrently so the page does not wait through dozens of tiny batches.
  // Each symbol already runs its fallback providers concurrently when needed.
  const batchSize = 8;
  for (let i = 0; i < shares.length; i += batchSize) {
    const batch = await Promise.all(shares.slice(i, i + batchSize).map(async (share) => {
      try {
        // Do not immediately repeat a full multi-provider request for an empty result:
        // that doubles the slowest upstream calls for this symbol. Manual Refresh retries it.
        const result = await fetchShareholding({ data: { symbol: share.symbol, refresh: false } });
        const latest = result.quarters[0] ?? null;
        if (!latest || (latest.fii === null && latest.dii === null && latest.public === null && latest.promoter === null)) {
          return { symbol: share.symbol, name: share.name || share.symbol, quarter: null, note: result.note || "No supported latest-quarter shareholding values were returned by NSE or the fallback source." };
        }
        return { symbol: share.symbol, name: share.name || share.symbol, quarter: latest, note: result.note };
      } catch (error) {
        const note = error instanceof Error ? error.message : "Shareholding source request failed.";
        return { symbol: share.symbol, name: share.name || share.symbol, quarter: null, note };
      }
    }));
    for (const item of batch) {
      if (!item.quarter) unavailable++;
      holdings.push(item);
    }
  }
  holdings.sort((a, b) => {
    const aScore = (a.quarter?.fii ?? 0) + (a.quarter?.dii ?? 0);
    const bScore = (b.quarter?.fii ?? 0) + (b.quarter?.dii ?? 0);
    return bScore - aScore || a.name.localeCompare(b.name);
  });
  const data = { holdings, checked: shares.length, unavailable, totalSuggested: shares.length };
  cached = { date: today, fingerprint, expires: Date.now() + 25 * 60_000, data };
  return data;
}

export const fetchSuggestedHoldings = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ refresh: z.boolean().optional() }).parse(data ?? {}))
  .handler(async ({ data }) => {
    if (data.refresh) cached = null;
    return loadSuggestedHoldings(Boolean(data.refresh));
  });

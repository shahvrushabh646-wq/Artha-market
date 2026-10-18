import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchShareholding, type ShareholdingQuarter } from "@/lib/market/shareholding";
import { fetchSuggestions } from "@/lib/market/suggestions";

export type QualifyingSuggestedHolding = {
  symbol: string;
  name: string;
  fii: number | null;
  dii: number | null;
  quarter: ShareholdingQuarter;
  reason: "FII ≥ 15%" | "DII ≥ 15%" | "FII and DII ≥ 15%";
};
export type SuggestedHoldingsResult = {
  qualifying: QualifyingSuggestedHolding[];
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
let cached: { date: string; fingerprint: string; data: SuggestedHoldingsResult } | null = null;

async function loadSuggestedHoldings(): Promise<SuggestedHoldingsResult> {
  const today = istDateKey();
  const suggestions = await fetchSuggestions({ data: { period: "current", sector: "All" } });
  const unique = new Map<string, (typeof suggestions)[number]>();
  for (const share of suggestions) {
    const symbol = String(share.symbol || "").trim().toUpperCase();
    if (symbol && !unique.has(symbol)) unique.set(symbol, share);
  }
  const allShares = [...unique.values()];
  const fingerprint = allShares.map((share) => String(share.symbol).trim().toUpperCase()).join("|");
  if (cached?.date === today && cached.fingerprint === fingerprint) return cached.data;
  const shares = allShares;
  const qualifying: QualifyingSuggestedHolding[] = [];
  let unavailable = 0;

  // Screen every unique share in the current Suggestions source, using bounded concurrent batches.
  for (let i = 0; i < shares.length; i += 8) {
    const batch = await Promise.all(shares.slice(i, i + 8).map(async (share) => {
      try {
        const result = await fetchShareholding({ data: { symbol: share.symbol } });
        const latest = result.quarters[0];
        if (!latest || (latest.fii === null && latest.dii === null)) return { status: "unavailable" as const };
        const fiiPass = latest.fii !== null && Number.isFinite(latest.fii) && latest.fii >= 15;
        const diiPass = latest.dii !== null && Number.isFinite(latest.dii) && latest.dii >= 15;
        if (!fiiPass && !diiPass) {
          return latest.fii === null || latest.dii === null
            ? { status: "unavailable" as const }
            : { status: "checked" as const };
        }
        const reason = fiiPass && diiPass ? "FII and DII ≥ 15%" : fiiPass ? "FII ≥ 15%" : "DII ≥ 15%";
        return {
          status: "qualifies" as const,
          share: {
            symbol: share.symbol,
            name: share.name || share.symbol,
            fii: latest.fii,
            dii: latest.dii,
            quarter: latest,
            reason,
          } satisfies QualifyingSuggestedHolding,
        };
      } catch {
        return { status: "unavailable" as const };
      }
    }));
    for (const item of batch) {
      if (item.status === "unavailable") unavailable++;
      else if (item.status === "qualifies") qualifying.push(item.share);
    }
  }
  qualifying.sort((a, b) => a.name.localeCompare(b.name));
  const data = { qualifying, checked: shares.length, unavailable, totalSuggested: allShares.length };
  cached = { date: today, fingerprint, data };
  return data;
}

export const fetchSuggestedHoldings = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ refresh: z.boolean().optional() }).parse(data ?? {}))
  .handler(async ({ data }) => {
    if (data.refresh) cached = null;
    return loadSuggestedHoldings();
  });

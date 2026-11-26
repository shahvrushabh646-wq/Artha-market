import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { NSE_SHAREHOLDING_DATA } from "./nse-shareholding-data";

export type ShareholdingQuarter = {
  quarter: string;
  asOnDate: string;
  promoter: number | null;
  fii: number | null;
  dii: number | null;
  public: number | null;
  promoterPledge: number | null;
  sourceUrl: string;
  sourceName: string;
};
export type ShareholdingResult = {
  symbol: string;
  source: string;
  sourceName: string;
  quarters: ShareholdingQuarter[];
  note: string | null;
};

/** Temporary minimal restore so build passes. Full historical loader must be restored from commit 204258f3. */
export async function fetchLatestShareholdingForHoldings(symbolInput: string): Promise<ShareholdingQuarter | null> {
  return null;
}

export const fetchShareholding = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ symbol: z.string().min(1).max(40), refresh: z.boolean().optional() }).parse(data))
  .handler(async ({ data }) => {
    const symbol = data.symbol.trim().toUpperCase().replace(/\.NS$|\.BO$/i, "");
    return {
      symbol,
      source: "https://raw.githubusercontent.com/aditya-jha/nse-historical-membership/main/shareholding_history/data/parsed/_flat.csv",
      sourceName: "NSE historical XBRL dataset",
      quarters: [],
      note: "Parser file was truncated during a large push; restore full shareholding.ts from commit 204258f3 and re-apply 2018/pledge patches. Build unblocked with empty quarters.",
    } satisfies ShareholdingResult;
  });

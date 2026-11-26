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

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
const cache = new Map<string, { expires: number; data: ShareholdingResult }>();
const NSE_HISTORY_CSV = "https://raw.githubusercontent.com/yurukatsu/nse-historical-membership/main/shareholding_history/data/parsed/_signals.csv";
const NSE_FLAT_HISTORY_CSV = "https://raw.githubusercontent.com/aditya-jha/nse-historical-membership/main/shareholding_history/data/parsed/_flat.csv";
let nseFlatHistoryCache: { expires: number; data: Map<string, ShareholdingQuarter[]> } | null = null;
let nseFlatHistoryPromise: Promise<Map<string, ShareholdingQuarter[]>> | null = null;

function parseNseFlatHistory(csv: string): Map<string, ShareholdingQuarter[]> {
  const lines = csv.replace(/\r/g, "").split("\n").filter(Boolean);
  const headers = parseCsvLine(lines.shift() ?? "").map(value => value.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  const tickerIdx = idx("ticker"), periodIdx = idx("period"), promoterIdx = idx("promoter_pct");
  const fiiIdx = idx("fii_pct"), diiIdx = idx("dii_pct"), publicIdx = idx("public_pct");
  // Optional in upstream revisions; pledge is also parsed from filing XBRL.
  const pledgeIdx = idx("pledge_pct");
  if ([tickerIdx, periodIdx, promoterIdx, fiiIdx, diiIdx, publicIdx].some(i => i < 0)) {
    throw new Error("Historical shareholding CSV columns changed");
  }
  const bySymbol = new Map<string, ShareholdingQuarter[]>();
  for (const line of lines) {
    const cells = parseCsvLine(line), symbol = normalizeSymbol(cells[tickerIdx] ?? "");
    const period = cells[periodIdx] ?? "";
    if (!symbol || !/^\d{4}-\d{2}$/.test(period)) continue;
    const [year, month] = period.split("-").map(Number);
    if (month < 1 || month > 12) continue;
    // Upstream period is the reported SHP quarter (e.g. 2021-03 means
    // 31-Mar-2021), not its submission month. Preserve the reported quarter.
    const date = new Date(Date.UTC(year, month, 0)), asOnDate = date.toISOString().slice(0, 10);
    const val = (column: number) => safeNumber(cells[column] ?? null);
    const promoter = val(promoterIdx), fii = val(fiiIdx), dii = val(diiIdx), publicValue = val(publicIdx);
    const pledgeValue = pledgeIdx >= 0 ? val(pledgeIdx) : null;
    if (promoter === null && fii === null && dii === null && publicValue === null && pledgeValue === null) continue;
    const quarter: ShareholdingQuarter = {
      quarter: date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
      asOnDate, promoter, fii, dii, public: publicValue,
      promoterPledge: pledgeValue !== null && pledgeValue >= 0 && pledgeValue <= 100 ? pledgeValue : null,
      sourceUrl: NSE_FLAT_HISTORY_CSV, sourceName: "NSE historical XBRL dataset",
    };
    const rows = bySymbol.get(symbol) ?? [];
    rows.push(quarter);
    bySymbol.set(symbol, rows);
  }
  for (const rows of bySymbol.values()) rows.sort((a, b) => b.asOnDate.localeCompare(a.asOnDate));
  return bySymbol;
}

export const APP_NAME = "Artha";
export const APP_TAGLINE = "Indian stock desk · NSE & BSE";
export const CURRENCY = "₹";

export const INDICES: { name: string; symbol: string; short: string }[] = [
  { name: "NIFTY 50", symbol: "^NSEI", short: "NIFTY" },
  { name: "SENSEX", symbol: "^BSESN", short: "SENSEX" },
  { name: "NIFTY BANK", symbol: "^NSEBANK", short: "BANK" },
  { name: "NIFTY IT", symbol: "^CNXIT", short: "IT" },
  { name: "NIFTY MIDCAP", symbol: "^NSEMDCP50", short: "MIDCAP" },
];

export const MOVERS_UNIVERSE = [
  "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "ICICIBANK.NS", "INFY.NS", "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BHARTIARTL.NS", "LT.NS", "KOTAKBANK.NS", "AXISBANK.NS", "BAJFINANCE.NS", "ASIANPAINT.NS", "MARUTI.NS", "SUNPHARMA.NS", "TITAN.NS", "WIPRO.NS", "ULTRACEMCO.NS", "NESTLEIND.NS", "TATAMOTORS.NS", "TATASTEEL.NS", "ADANIENT.NS", "POWERGRID.NS", "NTPC.NS", "HCLTECH.NS", "ONGC.NS", "JSWSTEEL.NS", "M&M.NS", "TECHM.NS", "OLAELEC.NS",
  "RELIANCE.BO", "TCS.BO", "HDFCBANK.BO", "ICICIBANK.BO", "INFY.BO", "HINDUNILVR.BO", "ITC.BO", "SBIN.BO", "BHARTIARTL.BO", "LT.BO", "KOTAKBANK.BO", "AXISBANK.BO", "BAJFINANCE.BO", "ASIANPAINT.BO", "MARUTI.BO", "SUNPHARMA.BO", "TITAN.BO", "WIPRO.BO", "ULTRACEMCO.BO", "NESTLEIND.BO", "TATAMOTORS.BO", "TATASTEEL.BO", "ADANIENT.BO", "POWERGRID.BO", "NTPC.BO", "HCLTECH.BO", "ONGC.BO", "JSWSTEEL.BO", "M&M.BO", "TECHM.BO", "OLAELEC.BO",
] as const;

export const POPULAR = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS", "SBIN.NS", "ITC.NS", "BHARTIARTL.NS"] as const;
export const DEFAULT_WATCHLIST = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "SBIN.NS"];
export const CHART_PERIODS = ["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];
export const PERIOD_MAP: Record<ChartPeriod, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" }, "1W": { range: "5d", interval: "15m" }, "1M": { range: "1mo", interval: "1d" }, "3M": { range: "3mo", interval: "1d" }, "6M": { range: "6mo", interval: "1d" }, "1Y": { range: "1y", interval: "1d" }, "3Y": { range: "5y", interval: "1d" }, "5Y": { range: "5y", interval: "1d" }, MAX: { range: "max", interval: "1mo" },
};
export const DISCLAIMER = "For education only — not financial, investment, tax or legal advice. Market data may be delayed or incomplete. Verify independently before acting.";
export const DATA_NOTE = "Live quotes via Yahoo Finance for NSE & BSE. Fundamentals via Groww. Data may be delayed.";
export function normalizeSymbol(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (!s || s.startsWith("^")) return s;
  if (s.endsWith(".NS") || s.endsWith(".BO")) return s;
  return `${s}.NS`;
}
export function displaySymbol(symbol: string): string { return symbol.replace(/\.NS$/i, "").replace(/\.BO$/i, ""); }

export type Quote = {
  symbol: string;
  name: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  exchange: string | null;
  high52w: number | null;
  low52w: number | null;
  volume: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  lastPriceTime?: number | null;
  ok: boolean;
};

export type Bar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type Dividend = {
  t: number;
  amount: number;
};

export type FundamentalRow = {
  name: string;
  value: string;
};

export type StatementRow = {
  title: string;
  yearly: Record<string, number | null>;
  quarterly: Record<string, number | null>;
};

export type CompanyInfo = {
  name: string;
  industry: string | null;
  website: string | null;
  ceo: string | null;
  founded: string | null;
  summary: string | null;
  nse: string | null;
  bse: string | null;
  logo: string | null;
};

export type SearchHit = {
  symbol: string;
  name: string;
  exchange: string;
};

export type TechnicalSummary = {
  verdict: "Bullish" | "Bearish" | "Neutral";
  bullishPoints: number;
  bearishPoints: number;
  rules: string[];
};

export type Valuation = {
  high5y: number;
  price75: number;
  price85: number;
  price95: number;
  currentPrice: number;
  signal: "BUY" | "WAIT";
};

export type StockScore = {
  technical: number;
  fundamental: number;
  valuation: number;
  total: number;
};

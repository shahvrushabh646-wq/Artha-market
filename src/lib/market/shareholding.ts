import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ShareholdingQuarter = {
  quarter: string;
  asOnDate: string;
  promoter: number | null;
  fii: number | null;
  dii: number | null;
  public: number | null;
  promoterPledge: number | null;
  sourceUrl: string;
};
export type ShareholdingResult = {
  symbol: string;
  source: string;
  quarters: ShareholdingQuarter[];
  note: string | null;
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
const cache = new Map<string, { expires: number; data: ShareholdingResult }>();

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\.NS$|\.BO$/i, "").replace(/[^A-Z0-9&_-]/g, "");
}
function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function localName(name: string) { return name.split(":").pop() ?? name; }
function parseDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}
function sourceDate(value: string): string {
  const match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return value;
  const month = new Date(`${match[2]} 1, 2000`).getMonth();
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1]))).toISOString().slice(0, 10);
}

async function nseJson(url: string, referer: string): Promise<unknown> {
  const home = await fetch(referer, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*", "Accept-Language": "en-US,en;q=0.9" },
    cache: "no-store",
  });
  const headers = new Headers({ "User-Agent": UA, Accept: "application/json,text/plain,*/*", "Accept-Language": "en-US,en;q=0.9", Referer: referer, Origin: "https://www.nseindia.com", "X-Requested-With": "XMLHttpRequest" });
  const cookie = home.headers.get("set-cookie");
  if (cookie) headers.set("Cookie", cookie.split(/,(?=[^;]+=)/).map(v => v.split(";", 1)[0]).join("; "));
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`NSE shareholding endpoint returned HTTP ${response.status}`);
  return response.json();
}

function parseXbrl(xml: string): Omit<ShareholdingQuarter, "quarter" | "asOnDate" | "sourceUrl"> | null {
  if (!xml.trim().startsWith("<") || !/ShareholdingAsAPercentageOfTotalNumberOfShares/.test(xml)) return null;
  const contexts = new Map<string, string[]>();
  const contextPattern = /<(?:[\w.-]+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?context>/g;
  for (const match of xml.matchAll(contextPattern)) {
    const members: string[] = [];
    const memberPattern = /<(?:[\w.-]+:)?explicitMember\b[^>]*>([^<]+)<\/(?:[\w.-]+:)?explicitMember>/g;
    for (const member of match[2].matchAll(memberPattern)) members.push(localName(member[1].trim()));
    contexts.set(match[1], members);
  }

  const categories: Record<string, string[]> = {
    promoter: ["ShareholdingOfPromoterAndPromoterGroupMember"],
    public: ["PublicShareholdingMember"],
    fii: ["InstitutionsForeignMember"],
    dii: ["InstitutionsDomesticMember"],
  };
  const values: Record<string, number | null> = { promoter: null, public: null, fii: null, dii: null };
  const factPattern = /<(?:[\w.-]+:)?ShareholdingAsAPercentageOfTotalNumberOfShares\b[^>]*\bcontextRef="([^"]+)"[^>]*>([-\d.]+)<\/(?:[\w.-]+:)?ShareholdingAsAPercentageOfTotalNumberOfShares>/g;
  for (const fact of xml.matchAll(factPattern)) {
    const members = contexts.get(fact[1]) ?? [];
    if (members.length > 2) continue;
    const raw = Number(fact[2]);
    if (!Number.isFinite(raw)) continue;
    for (const [category, names] of Object.entries(categories)) {
      if (values[category] === null && members.some(member => names.includes(member))) values[category] = raw;
    }
  }

  // Promoter pledge is shown only when the filing exposes both pledged shares and promoter shares.
  const shareCounts: Record<string, number | null> = { promoter: null, pledged: null };
  const countPattern = /<(?:[\w.-]+:)?(NumberOfShares|NumberOfSharesPledgedOrOtherwiseEncumbered)\b[^>]*\bcontextRef="([^"]+)"[^>]*>(\d+)<\/(?:[\w.-]+:)?\1>/g;
  for (const fact of xml.matchAll(countPattern)) {
    const tag = fact[1], members = contexts.get(fact[2]) ?? [], raw = Number(fact[3]);
    if (members.length > 2 || !Number.isFinite(raw)) continue;
    if (tag === "NumberOfShares" && members.includes("ShareholdingOfPromoterAndPromoterGroupMember") && shareCounts.promoter === null) shareCounts.promoter = raw;
    if (tag === "NumberOfSharesPledgedOrOtherwiseEncumbered" && members.includes("ShareholdingOfPromoterAndPromoterGroupMember") && shareCounts.pledged === null) shareCounts.pledged = raw;
  }

  const sum = (values.promoter ?? 0) + (values.public ?? 0);
  const scale = sum > 1000 ? 0.01 : sum > 0 && sum < 2 ? 100 : 1;
  for (const key of Object.keys(values)) if (values[key] !== null) values[key] = Math.round((values[key] as number) * scale * 10000) / 10000;
  const promoterPledge = shareCounts.promoter && shareCounts.pledged !== null
    ? Math.round((shareCounts.pledged / shareCounts.promoter) * 10000) / 100
    : null;
  if (Object.values(values).every(v => v === null)) return null;
  return { promoter: values.promoter, fii: values.fii, dii: values.dii, public: values.public, promoterPledge };
}

async function loadShareholding(symbolInput: string): Promise<ShareholdingResult> {
  const symbol = normalizeSymbol(symbolInput);
  if (!symbol) throw new Error("A valid NSE symbol is required.");
  const cached = cache.get(symbol);
  if (cached && cached.expires > Date.now()) return cached.data;
  const page = `https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern?symbol=${encodeURIComponent(symbol)}&tabIndex=equity`;
  const base: ShareholdingResult = { symbol, source: page, quarters: [], note: null };
  try {
    const raw = await nseJson(`https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(symbol)}`, page);
    if (!Array.isArray(raw)) throw new Error("Unexpected response from NSE.");
    const filings = raw as Array<Record<string, unknown>>;
    const selected = filings.filter(row => typeof row.xbrl === "string" && /^https?:\/\//i.test(row.xbrl as string)).slice(0, 4);
    for (const filing of selected) {
      const url = String(filing.xbrl);
      try {
        const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/xml,text/xml,*/*", Referer: page }, cache: "no-store" });
        if (!response.ok) continue;
        const parsed = parseXbrl(await response.text());
        if (!parsed) continue;
        const rawDate = String(filing.date ?? "");
        const date = sourceDate(rawDate);
        base.quarters.push({
          ...parsed,
          quarter: parseDate(date || rawDate),
          asOnDate: date || rawDate,
          sourceUrl: url,
        });
      } catch { /* one unavailable filing should not hide the other quarters */ }
    }
    base.quarters.sort((a, b) => b.asOnDate.localeCompare(a.asOnDate));
    base.quarters = base.quarters.slice(0, 4);
    if (!base.quarters.length) base.note = "NSE filings were reachable, but no supported shareholding values could be parsed. Figures are not estimated.";
    else if (base.quarters.some(q => q.fii === null || q.dii === null)) base.note = "Some filings do not expose separate FII/DII values in a format this screen can verify. Missing figures remain unavailable.";
  } catch {
    base.note = "NSE shareholding data could not be retrieved right now. Try again later; no sample figures are shown.";
  }
  cache.set(symbol, { expires: Date.now() + 30 * 60_000, data: base });
  return base;
}

export const fetchShareholding = createServerFn({ method: "GET" })
  .inputValidator(z.object({ symbol: z.string().min(1).max(40) }))
  .handler(async ({ data }) => loadShareholding(data.symbol));

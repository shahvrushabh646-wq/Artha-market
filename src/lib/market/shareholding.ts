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
    const date = new Date(Date.UTC(year, month, 0)), asOnDate = date.toISOString().slice(0, 10);
    const val = (column: number) => safeNumber(cells[column] ?? null);
    const promoter = val(promoterIdx), fii = val(fiiIdx), dii = val(dii), publicValue = val(publicIdx);
    if (promoter === null && fii === null && dii === null && publicValue === null) continue;
    const quarter: ShareholdingQuarter = {
      quarter: date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
      asOnDate, promoter, fii, dii, public: publicValue, promoterPledge: null,
      sourceUrl: NSE_FLAT_HISTORY_CSV, sourceName: "NSE historical XBRL dataset",
    };
    const rows = bySymbol.get(symbol) ?? [];
    rows.push(quarter);
    bySymbol.set(symbol, rows);
  }
  for (const rows of bySymbol.values()) rows.sort((a, b) => b.asOnDate.localeCompare(a.asOnDate));
  return bySymbol;
}

async function loadNseFlatHistory(symbol: string): Promise<ShareholdingQuarter[]> {
  if (nseFlatHistoryCache && nseFlatHistoryCache.expires > Date.now()) return nseFlatHistoryCache.data.get(symbol) ?? [];
  if (nseFlatHistoryPromise) return (await nseFlatHistoryPromise).get(symbol) ?? [];
  const load = (async () => {
    const response = await fetch(NSE_FLAT_HISTORY_CSV, {
      headers: { "User-Agent": UA, Accept: "text/csv,text/plain,*/*" }, cache: "no-store",
    });
    if (!response.ok) throw new Error("NSE parsed historical shareholding CSV unavailable");
    const parsed = parseNseFlatHistory(await response.text());
    nseFlatHistoryCache = { expires: Date.now() + 6 * 60 * 60_000, data: parsed };
    return parsed;
  })();
  nseFlatHistoryPromise = load;
  try { return (await load).get(symbol) ?? []; }
  finally { if (nseFlatHistoryPromise === load) nseFlatHistoryPromise = null; }
}

let nseHistoryCache: { expires: number; data: Map<string, ShareholdingQuarter> } | null = null;
let nseHistoryLoadPromise: Promise<Map<string, ShareholdingQuarter>> | null = null;

function parseNseHistoryCsv(csv: string): Map<string, ShareholdingQuarter> {
  const lines = csv.replace(/\r/g, "").split("\n").filter(Boolean);
  const headers = (lines.shift() ?? "").split(",").map(value => value.trim().toLowerCase());
  const index = (name: string) => headers.indexOf(name);
  const tickerIndex = index("ticker"), periodIndex = index("latest_period");
  const promoterIndex = index("latest_promoter"), fiiIndex = index("latest_fii");
  const diiIndex = index("latest_dii"), publicIndex = index("latest_public");
  const pledgeIndex = index("latest_pledge");
  if ([tickerIndex, periodIndex, promoterIndex, fiiIndex, diiIndex, publicIndex].some(i => i < 0)) throw new Error("Historical CSV columns changed");
  const parsed = new Map<string, ShareholdingQuarter>();
  for (const line of lines) {
    const cells = line.split(",");
    const symbol = normalizeSymbol(cells[tickerIndex] ?? ""), period = cells[periodIndex] ?? "";
    if (!symbol || !/^[0-9]{4}-[0-9]{2}$/.test(period)) continue;
    const [year, month] = period.split("-").map(Number);
    if (month < 1 || month > 12) continue;
    const date = new Date(Date.UTC(year, month, 0)), asOnDate = date.toISOString().slice(0, 10);
    const quarter = date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
    const value = (column: number) => safeNumber(cells[column] ?? null);
    const fii = value(fiiIndex), dii = value(diiIndex);
    if (fii === null && dii === null) continue;
    parsed.set(symbol, { quarter, asOnDate, promoter: value(promoterIndex), fii, dii, public: value(publicIndex),
      promoterPledge: pledgeIndex >= 0 ? value(pledgeIndex) : null, sourceUrl: NSE_HISTORY_CSV, sourceName: "NSE XBRL historical dataset" });
  }
  return parsed;
}

async function loadNseHistorySnapshot(refresh = false): Promise<Map<string, ShareholdingQuarter>> {
  if (!refresh && nseHistoryCache && nseHistoryCache.expires > Date.now()) return nseHistoryCache.data;
  if (nseHistoryLoadPromise) return nseHistoryLoadPromise;
  const load = (async () => {
    try {
      const response = await fetch(NSE_HISTORY_CSV, { headers: { "User-Agent": UA, Accept: "text/csv,text/plain,*/*" }, cache: "no-store" });
      if (!response.ok) throw new Error("Historical CSV unavailable");
      const parsed = parseNseHistoryCsv(await response.text());
      if (!parsed.size) throw new Error("Historical CSV had no valid rows");
      nseHistoryCache = { expires: Date.now() + 6 * 60 * 60_000, data: parsed };
      return parsed;
    } catch {
      // Bundled snapshot is only a resilience fallback; normal operation refreshes from upstream.
      const parsed = new Map<string, ShareholdingQuarter>();
      for (const [rawSymbol, row] of Object.entries(NSE_SHAREHOLDING_DATA)) {
        const symbol = normalizeSymbol(rawSymbol), period = row[0] ?? "";
        if (!symbol || !/^[0-9]{4}-[0-9]{2}$/.test(period)) continue;
        const [year, month] = period.split("-").map(Number);
        const date = new Date(Date.UTC(year, month, 0)), asOnDate = date.toISOString().slice(0, 10);
        const quarter = date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
        const value = (raw: string | null) => safeNumber(raw), fii = value(row[2]), dii = value(row[3]);
        if (fii === null && dii === null) continue;
        parsed.set(symbol, { quarter, asOnDate, promoter: value(row[1]), fii, dii, public: value(row[4]), promoterPledge: value(row[5]),
          sourceUrl: NSE_HISTORY_CSV, sourceName: "NSE XBRL historical dataset (bundled fallback)" });
      }
      nseHistoryCache = { expires: Date.now() + 30 * 60_000, data: parsed };
      return parsed;
    }
  })();
  nseHistoryLoadPromise = load;
  try { return await load; } finally { if (nseHistoryLoadPromise === load) nseHistoryLoadPromise = null; }
}

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

function parseXbrl(xml: string): (Omit<ShareholdingQuarter, "quarter" | "asOnDate" | "sourceUrl"> & { periodEnd?: string }) | null {
  if (!xml.trim().startsWith("<") || !/ShareholdingAsAPercentageOfTotalNumberOfShares/.test(xml)) return null;
  const contexts = new Map<string, string[]>();
  const contextDates = new Map<string, string>();
  const contextPattern = /<(?:[\w.-]+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?context>/g;
  for (const match of xml.matchAll(contextPattern)) {
    const members: string[] = [];
    const memberPattern = /<(?:[\w.-]+:)?explicitMember\b[^>]*>([^<]+)<\/(?:[\w.-]+:)?explicitMember>/g;
    for (const member of match[2].matchAll(memberPattern)) members.push(localName(member[1].trim()));
    contexts.set(match[1], members);
    const period = match[2].match(/<(?:[\w.-]+:)?(?:instant|endDate)\b[^>]*>(\d{4}-\d{2}-\d{2})<\/(?:[\w.-]+:)?(?:instant|endDate)>/i)?.[1];
    if (period) contextDates.set(match[1], period);
  }

  const categories: Record<string, string[]> = {
    promoter: ["ShareholdingOfPromoterAndPromoterGroupMember"],
    public: ["PublicShareholdingMember"],
    fii: ["InstitutionsForeignMember"],
    dii: ["InstitutionsDomesticMember"],
  };
  const values: Record<string, number | null> = { promoter: null, public: null, fii: null, dii: null };
  let periodEnd: string | undefined;
  const factPattern = /<(?:[\w.-]+:)?ShareholdingAsAPercentageOfTotalNumberOfShares\b[^>]*\bcontextRef="([^"]+)"[^>]*>([-\d.]+)<\/(?:[\w.-]+:)?ShareholdingAsAPercentageOfTotalNumberOfShares>/g;
  for (const fact of xml.matchAll(factPattern)) {
    const members = contexts.get(fact[1]) ?? [];
    if (members.length > 2) continue;
    const raw = Number(fact[2]);
    if (!Number.isFinite(raw)) continue;
    for (const [category, names] of Object.entries(categories)) {
      if (values[category] === null && members.some(member => names.includes(member))) {
        values[category] = raw;
        if (category === "promoter") periodEnd = contextDates.get(fact[1]) ?? periodEnd;
      }
    }
  }

  // Read pledge facts across standard XBRL and inline-XBRL filings. NSE uses
  // multiple concept names and may encode facts as ix:nonFraction elements.
  let pledgePctOfCompany: number | null = null;
  const pledgeFacts = /<(?:[\w.-]+:)?([\w.-]+)\b([^>]*)>([\d.,-]+)<\/(?:[\w.-]+:)?\1\s*>/gi;
  for (const fact of xml.matchAll(pledgeFacts)) {
    const concept = (fact[2].match(/\bname=["']([^"']+)["']/i)?.[1] ?? fact[1]).split(":").pop() ?? fact[1];
    if (!/(?:pledged|encumbered)/i.test(concept) || !/(?:percentage|percent|totalnumberofshares)/i.test(concept)) continue;
    const attrs = fact[2];
    const contextRef = attrs.match(/\bcontextRef=["']([^"']+)["']/i)?.[1];
    const members = contexts.get(contextRef ?? "") ?? [];
    if (!members.includes("ShareholdingOfPromoterAndPromoterGroupMember") || members.length > 6) continue;
    let value = Number(fact[3].replace(/,/g, ""));
    const scale = Number(attrs.match(/\bscale=["'](-?\d+)["']/i)?.[1] ?? "0");
    if (!Number.isFinite(value)) continue;
    if (Number.isFinite(scale) && scale !== 0) value *= 10 ** scale;
    if (value >= 0 && value <= 100) { pledgePctOfCompany = value; break; }
  }

  // If the filing reports pledged and total promoter share counts, calculate
  // pledge % of promoter holding directly. This is the requested denominator.
  let promoterShares: number | null = null;
  let pledgedShares: number | null = null;
  const shareFacts = /<(?:[\w.-]+:)?([\w.-]+)\b([^>]*)>([\d.,-]+)<\/(?:[\w.-]+:)?\1\s*>/gi;
  for (const fact of xml.matchAll(shareFacts)) {
    const concept = (fact[2].match(/\bname=["']([^"']+)["']/i)?.[1] ?? fact[1]).split(":").pop() ?? fact[1];
    const attrs = fact[2];
    const contextRef = attrs.match(/\bcontextRef=["']([^"']+)["']/i)?.[1];
    const members = contexts.get(contextRef ?? "") ?? [];
    if (!members.includes("ShareholdingOfPromoterAndPromoterGroupMember") || members.length > 6) continue;
    const raw = Number(fact[3].replace(/,/g, ""));
    if (!Number.isFinite(raw) || raw < 0) continue;
    if (/^NumberOfShares$/i.test(concept) && promoterShares === null) promoterShares = raw;
    if (/NumberOfSharesPledgedOrOtherwiseEncumbered|PledgedShares/i.test(concept) && pledgedShares === null) pledgedShares = raw;
  }

  const sum = (values.promoter ?? 0) + (values.public ?? 0);
  const scale = sum > 1000 ? 0.01 : sum > 0 && sum < 2 ? 100 : 1;
  for (const key of ["promoter", "public", "fii", "dii"] as const) if (values[key] !== null) values[key] = Math.round((values[key] as number) * scale * 10000) / 10000;
  const promoterPledge = promoterShares !== null && promoterShares > 0 && pledgedShares !== null
    ? Math.round((pledgedShares / promoterShares) * 10000) / 100
    : pledgePctOfCompany !== null && values.promoter !== null && values.promoter > 0
      ? Math.round((pledgePctOfCompany * scale / values.promoter) * 10000) / 100
      : null;
  if (Object.values(values).every(v => v === null)) return null;
  return { promoter: values.promoter, fii: values.fii, dii: values.dii, public: values.public, promoterPledge, periodEnd };
}

async function loadNsePledgeSnapshot(symbol: string): Promise<ShareholdingQuarter[]> {
  const page = "https://www.nseindia.com/companies-listing/corporate-filings-pledged-data?symbol=" + encodeURIComponent(symbol) + "&tabIndex=equity";
  const raw = await nseJson("https://www.nseindia.com/api/corporate-pledgedata?index=equities", page);
  const records: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    const keys = Object.keys(row).map(key => key.toLowerCase());
    if (keys.some(key => key.includes("symbol") || key === "sym") &&
        keys.some(key => key.includes("promotershares") || key.includes("pledged") || key.includes("encumber"))) records.push(row);
    Object.values(row).forEach(visit);
  };
  visit(raw);
  const normalized = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), value]));
  const number = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/,/g, "").replace(/%/g, "").trim();
    if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "na") return null;
    const parsed = Number(cleaned); return Number.isFinite(parsed) ? parsed : null;
  };
  const parseNsePeriod = (value: unknown): string | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    const rawDate = value.trim();
    const parsed = sourceDate(rawDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
    const d = new Date(rawDate);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };
  const quarters: ShareholdingQuarter[] = [];
  for (const sourceRow of records) {
    const row = normalized(sourceRow);
    const rowSymbol = normalizeSymbol(String(row.symbol ?? row.sym ?? ""));
    if (rowSymbol !== symbol) continue;
    const pledge = number(
      row.percpromotershares ?? row.percpledgedpromotershares ??
      row.pledgedpercentageofpromoterholding ?? row.promoterpledgepct ??
      row.promoterpledgepercentage ?? row.promotersharespledgedpercentage ??
      row.pledgedsharespercentofpromoterholding ?? row.promoterpledgedpct
    );
    const promoter = number(row.percpromoterholding ?? row.promoterholdingpct);
    const period = parseNsePeriod(row.shpquarter ?? row.shp ?? row.periodend ?? row.asondt ?? row.asondatetime ?? row.disclosuredate);
    if (pledge === null || pledge < 0 || pledge > 100 || !period) continue;
    const date = new Date(period + "T00:00:00Z");
    quarters.push({
      quarter: date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
      asOnDate: period, promoter, fii: null, dii: null, public: null,
      promoterPledge: pledge, sourceUrl: page, sourceName: "NSE Pledged Data",
    });
  }
  // The NSE pledged-data response can contain several dated rows. Keep the full
  // history instead of returning from the first (often oldest) matching record.
  const byDate = new Map<string, ShareholdingQuarter>();
  for (const quarter of quarters.sort((a, b) => b.asOnDate.localeCompare(a.asOnDate))) {
    const existing = byDate.get(quarter.asOnDate);
    if (!existing || (existing.promoterPledge == null && quarter.promoterPledge != null)) byDate.set(quarter.asOnDate, quarter);
  }
  return [...byDate.values()];
}

async function loadNseFilingHistory(symbol: string): Promise<ShareholdingQuarter[]> {
  const page = `https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern?symbol=${encodeURIComponent(symbol)}&tabIndex=equity`;
  const raw = await nseJson(`https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(symbol)}`, page);
  if (!Array.isArray(raw)) return [];
  const filings = (raw as Array<Record<string, unknown>>)
    .filter(row => typeof row.xbrl === "string" && /^https?:\/\//i.test(row.xbrl as string))
    .sort((a,b) => sourceDate(String(b.date ?? "")).localeCompare(sourceDate(String(a.date ?? ""))));
  const parsed = await Promise.all(filings.map(async filing => {
    const url = String(filing.xbrl);
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/xml,text/xml,*/*", Referer: page }, cache: "no-store" });
      if (!response.ok) return null;
      const values = parseXbrl(await response.text());
      if (!values) return null;
      const rawDate = String(filing.date ?? ""), asOnDate = values.periodEnd ?? (sourceDate(rawDate) || rawDate);
      const { periodEnd: _periodEnd, ...quarterValues } = values;
      return { ...quarterValues, quarter: parseDate(asOnDate), asOnDate, sourceUrl: url, sourceName: "NSE" } satisfies ShareholdingQuarter;
    } catch { return null; }
  }));
  return parsed.filter((q): q is ShareholdingQuarter => q !== null);
}

function htmlText(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function screenerNumber(value: string): number | null {
  const text = htmlText(value).replace(/,/g, "").replace(/%/g, "").trim();
  if (!text || text === "-" || text === "—" || text === "NA" || text === "N/A") return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}
function parseScreener(html: string, symbol: string, url: string): ShareholdingQuarter[] {
  // Parse the actual quarterly Shareholding Pattern table. Screener labels rows
  // with a trailing "+" (e.g. "FIIs +"), which must be normalized before matching.
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  const parseRows = (table: string) => [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => {
    const cells = [...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(x => htmlText(x[1]));
    return cells;
  }).filter(row => row.length > 1);
  const normalizeLabel = (value: string) => htmlText(value).replace(/\s*\+\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  const periodPattern = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+['’]?\d{4}$/i;
  const candidates = tables.map(match => parseRows(match[0])).filter(rows => {
    const labels = rows.map(row => normalizeLabel(row[0] || ""));
    const hasPeriods = rows.some(row => row.slice(1).some(cell => periodPattern.test(normalizeLabel(cell))));
    return hasPeriods && labels.some(label => /^promoters?$/.test(label)) &&
      labels.some(label => /^fiis?$/.test(label)) &&
      labels.some(label => /^diis?$/.test(label)) &&
      labels.some(label => /^public$/.test(label));
  });
  const rows = candidates[0];
  if (!rows || rows.length < 2) return [];
  const header = rows.find(row => row.slice(1).some(cell => periodPattern.test(normalizeLabel(cell))));
  if (!header) return [];
  const dates = header.slice(1).map(value => {
    const cleaned = htmlText(value).replace(/[’']/g, " ").trim();
    const date = new Date(cleaned);
    return Number.isNaN(date.getTime()) ? null : {
      quarter: date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
      asOnDate: date.toISOString().slice(0, 10),
    };
  });
  const findRow = (patterns: RegExp[]) => rows.find(row => patterns.some(pattern => pattern.test(normalizeLabel(row[0] || ""))));
  const promoters = findRow([/^promoters?$/, /^promoter & promoter group$/]);
  const fii = findRow([/^fiis?$/, /^foreign institutional investors?$/, /^foreign institutions?$/]);
  const dii = findRow([/^diis?$/, /^domestic institutional investors?$/, /^domestic institutions?$/]);
  const publicRow = findRow([/^public$/, /^public shareholding$/]);
  const pledgeRow = rows.find(row => /pledge|pledged|encumbered/i.test(normalizeLabel(row[0] || "")) && /promoter|shareholding|stake|%|percent/i.test(normalizeLabel(row[0] || "")));
  const quarters: ShareholdingQuarter[] = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (!date) continue;
    const get = (row: string[] | undefined) => row ? screenerNumber(row[i + 1] || "") : null;
    const promoter = get(promoters), fiiValue = get(fii), diiValue = get(dii), publicValue = get(publicRow);
    const rawPledge = get(pledgeRow);
    const pledgeLabel = normalizeLabel(pledgeRow?.[0] || "");
    const promoterPledge = rawPledge !== null && /(?:% of total|of total shares|company shares|share capital)/i.test(pledgeLabel)
      ? (promoter !== null && promoter > 0 ? Math.round(rawPledge / promoter * 10000) / 100 : null)
      : rawPledge;
    if (promoter === null && fiiValue === null && diiValue === null && publicValue === null && promoterPledge === null) continue;
    quarters.push({
      ...date, promoter, fii: fiiValue, dii: diiValue, public: publicValue,
      promoterPledge: promoterPledge !== null && promoterPledge >= 0 && promoterPledge <= 100 ? promoterPledge : null,
      sourceUrl: url, sourceName: "Screener.in",
    });
  }
  return quarters.sort((a, b) => b.asOnDate.localeCompare(a.asOnDate));
}

async function loadScreenerFallback(symbol: string): Promise<{ url: string; quarters: ShareholdingQuarter[] }> {
  const url = `https://www.screener.in/company/${encodeURIComponent(symbol)}/`;
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*", "Accept-Language": "en-US,en;q=0.9" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Screener.in returned HTTP ${response.status}`);
  return { url, quarters: parseScreener(await response.text(), symbol, url) };
}


// Parse provider tables with quarter/month headers without assuming Screener's exact markup.
function parseProviderQuarter(value:string):{quarter:string;asOnDate:string}|null{
  const text=htmlText(value).replace(/[’']/g," ").replace(/\s+/g," ").trim();
  let date=new Date(text);
  if(Number.isNaN(date.getTime())){
    const m=text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,.-]+(?:FY\s*)?[' ]?(\d{2,4})\b/i);
    if(!m)return null;
    let year=Number(m[2]);if(year<100)year+=2000;
    const month=new Date(m[1]+" 1 2000").getMonth();
    date=new Date(Date.UTC(year,month+1,0));
  }else date=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0));
  if(Number.isNaN(date.getTime()))return null;
  return {quarter:date.toLocaleDateString("en-IN",{month:"short",year:"numeric",timeZone:"UTC"}),asOnDate:date.toISOString().slice(0,10)};
}
function parseProviderTable(html:string,url:string,sourceName:string):ShareholdingQuarter[]{
  const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  const rowsFor=(table:string)=>[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(x=>htmlText(x[1]))).filter(r=>r.length>1);
  const label=(s:string)=>htmlText(s).replace(/\s*\+\s*$/,"").replace(/\s+/g," ").trim().toLowerCase();
  for(const table of tables){
    const rows=rowsFor(table[0]);if(!rows.length)continue;
    const header=rows.find(r=>r.slice(1).some(x=>!!parseProviderQuarter(x)));
    if(!header)continue;
    const dates=header.slice(1).map(parseProviderQuarter);
    const find=(patterns:RegExp[])=>rows.find(r=>patterns.some(p=>p.test(label(r[0]??""))));
    const promoter=find([/^promoters?$/, /^promoter\s*&\s*promoter group$/, /^promoter and promoter group$/]);
    const fii=find([/^fiis?$/, /^foreign institutional investors?$/, /^foreign institutions?$/, /^fpi(?:s)?$/]);
    const dii=find([/^diis?$/, /^domestic institutional investors?$/, /^domestic institutions?$/]);
    const pub=find([/^public$/, /^public shareholding$/]);
    const pledge=rows.find(r=>/pledge|pledged|encumbered/i.test(label(r[0]??"")));
    if(!fii&&!dii&&!pledge)continue;
    const out:ShareholdingQuarter[]=[];
    for(let i=0;i<dates.length;i++){
      const d=dates[i];if(!d)continue;
      const get=(r:string[]|undefined)=>r?screenerNumber(r[i+1]??""):null;
      const p=get(promoter),fv=get(fii),dv=get(dii),pv=get(pub),rawPledge=get(pledge);
      const pledgeLabel=label(pledge?.[0]??"");
      const pp=rawPledge!==null&&/(?:% of total|of total shares|company shares|share capital)/i.test(pledgeLabel)
        ?(p!==null&&p>0?Math.round(rawPledge/p*10000)/100:null):rawPledge;
      if(fv===null&&dv===null&&pp===null)continue;
      out.push({...d,promoter:p,fii:fv,dii:dv,public:pv,promoterPledge:pp!==null&&pp>=0&&pp<=100?pp:null,sourceUrl:url,sourceName});
    }
    if(out.length)return out.sort((a,b)=>b.asOnDate.localeCompare(a.asOnDate));
  }
  return [];
}
function parseTickertapeHoldings(html:string,url:string):ShareholdingQuarter[]{
  const script=html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if(!script)return [];
  try{
    const root=JSON.parse(htmlText(script)) as Record<string,unknown>;
    const props=(root.props??{}) as Record<string,unknown>,page=(props.pageProps??{}) as Record<string,unknown>;
    const summary=(page.securitySummary??{}) as Record<string,unknown>,holdings=(summary.holdings??{}) as Record<string,unknown>;
    const source=holdings.holdings;
    const rawDate=String(holdings.asOnDate??holdings.asOfDate??holdings.period??holdings.quarter??summary.asOnDate??summary.asOfDate??"");
    const date=parseProviderQuarter(rawDate);if(!date||!Array.isArray(source))return [];
    const vals:Record<string,number|null>={promoter:null,fii:null,dii:null,public:null};
    for(const item of source){
      if(!item||typeof item!=="object")continue;
      const row=item as Record<string,unknown>,name=String(row.name??row.category??row.label??row.title??"").toLowerCase();
      const raw=row.percentage??row.percent??row.shareholdingPercentage??row.holdingPercentage??row.value;
      const n=safeNumber(raw);if(n===null||n<0||n>100)continue;
      if(/promoter/.test(name))vals.promoter=n;
      else if(/foreign|fii|fpi/.test(name))vals.fii=n;
      else if(/domestic|dii/.test(name))vals.dii=n;
      else if(/public|retail|other/.test(name))vals.public=n;
    }
    if(vals.fii===null||vals.dii===null)return [];
    return [{...date,promoter:vals.promoter,fii:vals.fii,dii:vals.dii,public:vals.public,promoterPledge:null,sourceUrl:url,sourceName:"Tickertape"}];
  }catch{return [];}
}
async function loadTickertapeFallback(symbol:string):Promise<{url:string;quarters:ShareholdingQuarter[]}>{
  const headers={"User-Agent":UA,Accept:"application/json,text/plain,*/*","Accept-Language":"en-IN,en;q=0.9"};
  const searchUrl="https://api.tickertape.in/search/suggest?text="+encodeURIComponent(symbol);
  const search=await fetch(searchUrl,{headers,cache:"no-store"});if(!search.ok)throw new Error("Tickertape search unavailable");
  const data=await search.json() as unknown,candidates:Record<string,unknown>[]=[];
  const visit=(v:unknown)=>{if(Array.isArray(v)){v.forEach(visit);return;}if(v&&typeof v==="object"){const o=v as Record<string,unknown>;if(o.slug||o.url)candidates.push(o);Object.values(o).forEach(visit);}};
  visit(data);
  const item=candidates.find(o=>String(o.symbol??o.ticker??o.code??"").toUpperCase()===symbol&&typeof(o.slug??o.url)==="string");
  if(!item)throw new Error("Tickertape stock slug not resolved");
  let slug=String(item.slug??item.url).replace(/^https?:\/\/(?:www\.)?tickertape\.in\//,"").replace(/^\/+/,"");
  if(!slug.startsWith("stocks/"))slug="stocks/"+slug;
  const url="https://www.tickertape.in/"+slug;
  const response=await fetch(url,{headers:{...headers,Accept:"text/html,application/xhtml+xml,*/*"},cache:"no-store"});
  if(!response.ok)throw new Error("Tickertape stock page unavailable");
  return {url,quarters:parseTickertapeHoldings(await response.text(),url)};
}
async function loadMoneycontrolFallback(symbol:string):Promise<{url:string;quarters:ShareholdingQuarter[]}>{
  const searchUrl="https://www.moneycontrol.com/mccode/common/autosuggestion.aspx?query="+encodeURIComponent(symbol)+"&type=1&format=json";
  const headers={"User-Agent":UA,Accept:"application/json,text/plain,*/*","Accept-Language":"en-IN,en;q=0.9"};
  const search=await fetch(searchUrl,{headers,cache:"no-store"});
  if(!search.ok)throw new Error("Moneycontrol stock search unavailable");
  const payload=await search.json() as unknown;
  const candidates:Record<string,unknown>[]=[];
  const visit=(value:unknown)=>{
    if(Array.isArray(value)){value.forEach(visit);return;}
    if(!value||typeof value!=="object")return;
    const row=value as Record<string,unknown>;
    const text=Object.values(row).map(v=>String(v??"")).join(" ");
    if(/moneycontrol\.com/i.test(text)&&/(?:stockpricequote|stocks|shareholding)/i.test(text))candidates.push(row);
    Object.values(row).forEach(visit);
  };
  visit(payload);
  const item=candidates.find(row=>{
    const values=Object.values(row).map(v=>String(v??"").toUpperCase());
    return values.some(v=>v===symbol||v.includes("("+symbol+")")||v.endsWith("/"+symbol));
  });
  if(!item)throw new Error("Moneycontrol company page not resolved");
  const rawUrl=Object.values(item).map(v=>String(v??"")).find(v=>/^https?:\/\/(?:www\.)?moneycontrol\.com\//i.test(v)&&/(?:stockpricequote|stocks|shareholding)/i.test(v));
  if(!rawUrl)throw new Error("Moneycontrol URL not found in search result");
  const stockUrl=rawUrl.split("?")[0].replace(/\/+$/,"")+"/";
  const response=await fetch(stockUrl,{headers:{...headers,Accept:"text/html,application/xhtml+xml,*/*"},cache:"no-store"});
  if(!response.ok)throw new Error("Moneycontrol stock page unavailable");
  const html=await response.text();
  const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  const rowsFor=(table:string)=>[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(x=>htmlText(x[1]))).filter(r=>r.length>1);
  const norm=(v:string)=>htmlText(v).replace(/\s+/g," ").trim().toLowerCase();
  const datesFor=(header:string[])=>header.map(parseProviderQuarter);
  const quarters:ShareholdingQuarter[]=[];
  for(const table of tables){
    const rows=rowsFor(table[0]);if(!rows.length)continue;
    const header=rows.find(row=>row.slice(1).some(cell=>!!parseProviderQuarter(cell)));
    if(!header)continue;
    const dates=datesFor(header.slice(1));
    const pledgeRow=rows.find(row=>/pledge|pledged|encumbered/i.test(norm(row[0]??""))&&/(?:promoter|shareholding|stake|%|percent|pledge)/i.test(norm(row[0]??"")));
    if(!pledgeRow)continue;
    const promoterRow=rows.find(row=>/^(?:promoters?|promoter & promoter group|promoter and promoter group)$/.test(norm(row[0]??"")));
    for(let i=0;i<dates.length;i++){
      const date=dates[i];if(!date)continue;
      const raw=screenerNumber(pledgeRow[i+1]??"");
      if(raw===null)continue;
      const label=norm(pledgeRow[0]??"");
      let promoterPledge:number|null=raw;
      if(/(?:% of total|of total shares|company shares|share capital)/i.test(label)){
        const promoter=promoterRow?screenerNumber(promoterRow[i+1]??""):null;
        promoterPledge=promoter&&promoter>0?Math.round(raw/promoter*10000)/100:null;
      }
      if(promoterPledge===null||promoterPledge<0||promoterPledge>100)continue;
      quarters.push({...date,promoter:null,fii:null,dii:null,public:null,promoterPledge,sourceUrl:stockUrl,sourceName:"Moneycontrol"});
    }
  }
  return {url:stockUrl,quarters:quarters.sort((a,b)=>b.asOnDate.localeCompare(a.asOnDate))};
}

async function loadTrendlyneFallback(symbol:string):Promise<{url:string;quarters:ShareholdingQuarter[]}>{
  const url="https://trendlyne.com/equity/shareholding/"+encodeURIComponent(symbol)+"/";
  const response=await fetch(url,{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml,*/*","Accept-Language":"en-IN,en;q=0.9"},cache:"no-store"});
  if(!response.ok)throw new Error("Trendlyne shareholding page unavailable");
  return {url,quarters:parseProviderTable(await response.text(),url,"Trendlyne")};
}
async function loadPublicSiteFallback(symbol:string):Promise<{url:string;name:string;quarters:ShareholdingQuarter[]}>{
  try{
    const mc=await loadMoneycontrolFallback(symbol);
    if(mc.quarters.length)return {url:mc.url,name:"Moneycontrol",quarters:mc.quarters};
  }catch{/* continue */}
  try{
    const trendlyne=await loadTrendlyneFallback(symbol);
    if(trendlyne.quarters.length)return {url:trendlyne.url,name:"Trendlyne",quarters:trendlyne.quarters};
  }catch{/* continue */}
  try{
    const tt=await loadTickertapeFallback(symbol);
    if(tt.quarters.length)return {url:tt.url,name:"Tickertape",quarters:tt.quarters};
  }catch{/* continue */}
  return {url:"",name:"",quarters:[]};
}

type BseMaster = { symbolToIsin: Map<string,string>; isinToCode: Map<string,string> };
let bseMasterCache: { expires:number; data:BseMaster } | null = null;
function parseCsvLine(line:string):string[] {
  const cells:string[]=[]; let value="",quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"' && quoted && line[i+1]==='"'){value+='"';i++;}
    else if(ch==='"')quoted=!quoted;
    else if(ch===","&&!quoted){cells.push(value.trim());value="";}
    else value+=ch;
  }
  cells.push(value.trim()); return cells;
}
async function loadBseMaster():Promise<BseMaster>{
  if(bseMasterCache&&bseMasterCache.expires>Date.now())return bseMasterCache.data;
  const headers={"User-Agent":UA,Accept:"text/csv,text/plain,*/*","Accept-Language":"en-IN,en;q=0.9"};
  const [nseRes,bseRes]=await Promise.all([
    fetch("https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",{headers,cache:"no-store"}),
    fetch("https://www.bseindia.com/downloads1/Equity.csv",{headers,cache:"no-store"})
  ]);
  if(!nseRes.ok||!bseRes.ok)throw new Error("Exchange security master unavailable");
  const nseLines=(await nseRes.text()).split(/\r?\n/).filter(Boolean),bseLines=(await bseRes.text()).split(/\r?\n/).filter(Boolean);
  const nseHeader=parseCsvLine(nseLines.shift()??"").map(x=>x.toUpperCase());
  const bseHeader=parseCsvLine(bseLines.shift()??"").map(x=>x.toUpperCase());
  const ni=nseHeader.indexOf("SYMBOL"),nis=nseHeader.findIndex(x=>x.includes("ISIN"));
  const bc=bseHeader.findIndex(x=>x.includes("SECURITY CODE")||x==="SC_CODE"||x==="SCRIP CODE");
  const bi=bseHeader.findIndex(x=>x.includes("ISIN"));
  if(ni<0||nis<0||bc<0||bi<0)throw new Error("Exchange master columns changed");
  const symbolToIsin=new Map<string,string>();
  for(const line of nseLines){const row=parseCsvLine(line);const sym=(row[ni]??"").toUpperCase(),isin=(row[nis]??"").toUpperCase();if(sym&&/^[A-Z0-9]{12}$/.test(isin))symbolToIsin.set(sym,isin);}
  const isinToCode=new Map<string,string>();
  for(const line of bseLines){const row=parseCsvLine(line),code=(row[bc]??"").replace(/\D/g,""),isin=(row[bi]??"").toUpperCase();if(code&&isin)isinToCode.set(isin,code);}
  const data={symbolToIsin,isinToCode};bseMasterCache={expires:Date.now()+24*60*60_000,data};return data;
}
async function loadBseFallback(symbol:string):Promise<{url:string;quarters:ShareholdingQuarter[]}>{
  const master=await loadBseMaster(),isin=master.symbolToIsin.get(symbol),code=isin?master.isinToCode.get(isin):undefined;
  if(!code)throw new Error("BSE code/ISIN mapping unavailable for "+symbol);
  // BSE's endpoint requires Referer and User-Agent; do not send Origin.
  const headers={"User-Agent":UA,Accept:"application/json,text/plain,*/*",Referer:"https://www.bseindia.com/"};
  const indexUrl="https://api.bseindia.com/BseIndiaAPI/api/Corp_Shareholding_ng/w?scripcode="+code+"&flag=0&indtype=";
  const indexRes=await fetch(indexUrl,{headers,cache:"no-store"});
  if(!indexRes.ok)throw new Error("BSE filing index HTTP "+indexRes.status);
  const index=await indexRes.json() as {Table?:Array<Record<string,unknown>>};
  const filings=(index.Table??[]).filter(x=>Number(x.IsXBRL)===1&&typeof x.XBRLAttachment==="string"&&/^\d{4}-\d{2}-\d{2}/.test(String(x.EndDate??""))).sort((a,b)=>String(b.EndDate).localeCompare(String(a.EndDate)));
  const quarters:ShareholdingQuarter[]=[];
  for(const filing of filings){
    const attachment=String(filing.XBRLAttachment),url=attachment.startsWith("http")?attachment:"https://www.bseindia.com"+(attachment.startsWith("/")?attachment:"/"+attachment);
    try{
      const response=await fetch(url,{headers:{...headers,Accept:"text/html,application/xhtml+xml,*/*"},cache:"no-store"});
      if(!response.ok)continue;
      const html=await response.text(),contexts=new Map<string,string[]>();
      for(const ctx of html.matchAll(/<(?:[\w.-]+:)?context\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?context>/gi)){
        const members=[...ctx[2].matchAll(/<(?:[\w.-]+:)?(?:explicitMember|typedMember)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?(?:explicitMember|typedMember)>/gi)].map(m=>localName(htmlText(m[1])).toLowerCase());
        contexts.set(ctx[1],members);
      }
      const values:Record<string,number[]>={promoter:[],fii:[],dii:[],public:[]};
      for(const fact of html.matchAll(/<(?:ix:)?nonFraction\b([^>]*?)>([\s\S]*?)<\/(?:ix:)?nonFraction>/gi)){
        const attrs=fact[1],concept=(attrs.match(/\bname=["']([^"']+)["']/i)?.[1]??"").split(":").pop()?.toLowerCase()??"";
        if(!concept.includes("shareholdingasapercentageoftotalnumberofshares"))continue;
        const context=attrs.match(/\bcontextref=["']([^"']+)["']/i)?.[1],members=contexts.get(context??"")??[];
        if(!members.length||members.length>3)continue;
        let value=Number(htmlText(fact[2]).replace(/,/g,"").trim());
        const scale=Number(attrs.match(/\bscale=["'](-?\d+)["']/i)?.[1]??"0");if(Number.isFinite(scale)&&scale!==0)value*=10**scale;
        if(!Number.isFinite(value)||value<0||value>100)continue;
        const joined=members.join(" ");
        if(/promoterandpromotergroup/.test(joined))values.promoter.push(value);
        else if(/foreigninstitutions|foreignportfolio|fpi|fii/.test(joined))values.fii.push(value);
        else if(/domesticinstitutions|domesticinstitutional|dii/.test(joined))values.dii.push(value);
        else if(/publicshareholding|publicshareholder/.test(joined))values.public.push(value);
      }
      const sum=(a:number[])=>a.length?Math.round(a.reduce((x,y)=>x+y,0)*10000)/10000:null;
      const promoter=sum(values.promoter),fii=sum(values.fii),dii=sum(values.dii),publicValue=sum(values.public);
      if(fii===null||dii===null)continue;
      // Extract promoter pledge from the same dated BSE XBRL filing.
      // Pledge may be reported as pledged shares, % of company shares, or
      // directly as % of promoter holding. Keep null when the denominator is absent.
      let promoterShares:number|null=null,pledgedShares:number|null=null,pledgeCompanyPct:number|null=null,pledgePromoterPct:number|null=null;
      for(const fact of html.matchAll(/<(?:ix:)?nonFraction\b([^>]*?)>([\s\S]*?)<\/(?:ix:)?nonFraction>/gi)){
        const attrs=fact[1],concept=(attrs.match(/\bname=["']([^"']+)["']/i)?.[1]??"").split(":").pop()?.toLowerCase()??"";
        const context=attrs.match(/\bcontextref=["']([^"']+)["']/i)?.[1],members=contexts.get(context??"")??[];
        const joined=members.join(" ");
        if(!/promoterandpromotergroup/.test(joined)||members.length>6)continue;
        let value=Number(htmlText(fact[2]).replace(/,/g,"").trim());
        const scale=Number(attrs.match(/\bscale=["'](-?\d+)["']/i)?.[1]??"0");
        if(!Number.isFinite(value))continue;if(Number.isFinite(scale)&&scale!==0)value*=10**scale;
        if(value<0)continue;
        if(/pledged|encumbered/.test(concept)){
          if(/percentage|percent|pct/.test(concept)){
            if(/promoterholding|promoterandpromotergroup/.test(concept))pledgePromoterPct=value;
            else if(value<=100)pledgeCompanyPct=value;
          }else if(/numberofshares|shares/.test(concept)&&pledgedShares===null)pledgedShares=value;
        }
        if(/numberofshares/.test(concept)&&!/pledged|encumbered/.test(concept)&&promoterShares===null)promoterShares=value;
      }
      let promoterPledge:number|null=null;
      if(pledgedShares!==null&&promoterShares!==null&&promoterShares>0)promoterPledge=pledgedShares/promoterShares*100;
      else if(pledgePromoterPct!==null&&pledgePromoterPct<=100)promoterPledge=pledgePromoterPct;
      else if(pledgeCompanyPct!==null&&promoter!==null&&promoter>0)promoterPledge=pledgeCompanyPct/promoter*100;
      if(promoterPledge!==null)promoterPledge=Math.round(promoterPledge*100)/100;
      if(promoterPledge!==null&&(promoterPledge<0||promoterPledge>100))promoterPledge=null;
      const asOnDate=String(filing.EndDate).slice(0,10),date=new Date(asOnDate+"T00:00:00Z");
      quarters.push({quarter:date.toLocaleDateString("en-IN",{month:"short",year:"numeric",timeZone:"UTC"}),asOnDate,promoter,fii,dii,public:publicValue,promoterPledge,sourceUrl:url,sourceName:"BSE"});
    }catch{continue;}
  }
  quarters.sort((a,b)=>b.asOnDate.localeCompare(a.asOnDate));
  return {url:"https://www.bseindia.com/corporates/Sharehold_Searchnew.aspx",quarters};
}


function mergeSameQuarterSources(symbol:string, sources:ShareholdingQuarter[]):ShareholdingQuarter[] {
  const priority=(name:string)=>({NSE:0,BSE:1,Moneycontrol:2,Trendlyne:3,"Screener.in":4,Tickertape:5}[name]??9);
  const grouped=new Map<string,ShareholdingQuarter[]>();
  for(const q of sources){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(q.asOnDate))continue;
    const rows=grouped.get(q.asOnDate)??[];rows.push(q);grouped.set(q.asOnDate,rows);
  }
  const merged:ShareholdingQuarter[]=[];
  for(const [asOnDate,rows] of grouped){
    rows.sort((a,b)=>priority(a.sourceName)-priority(b.sourceName));
    const take=(key:"promoter"|"fii"|"dii"|"public"|"promoterPledge")=>rows.find(q=>q[key]!==null&&q[key]!==undefined)?.[key]??null;
    const used=new Set<string>();
    for(const key of ["promoter","fii","dii","public","promoterPledge"] as const){
      const chosen=rows.find(q=>q[key]!==null&&q[key]!==undefined);
      if(chosen)used.add(chosen.sourceName);
    }
    const source=rows.find(q=>q.fii!==null||q.dii!==null)||rows[0];
    const date=new Date(asOnDate+"T00:00:00Z");
    merged.push({
      quarter:source.quarter||date.toLocaleDateString("en-IN",{month:"short",year:"numeric",timeZone:"UTC"}),
      asOnDate,promoter:take("promoter"),fii:take("fii"),dii:take("dii"),public:take("public"),
      promoterPledge:take("promoterPledge"),sourceUrl:source.sourceUrl,
      sourceName:[...used].sort((a,b)=>priority(a)-priority(b)).join(" + ")||source.sourceName,
    });
  }
  return merged.sort((a,b)=>b.asOnDate.localeCompare(a.asOnDate));
}
async function loadSupplementalShareholding(symbol:string):Promise<ShareholdingQuarter[]> {
  const results=await Promise.allSettled([
    loadNseFilingHistory(symbol),
    loadNsePledgeSnapshot(symbol),
    loadScreenerFallback(symbol),
    loadBseFallback(symbol),
    loadMoneycontrolFallback(symbol).then(value=>({...value,name:"Moneycontrol"})),
    loadTrendlyneFallback(symbol).then(value=>({...value,name:"Trendlyne"})),
    loadPublicSiteFallback(symbol),
  ]);
  const quarters:ShareholdingQuarter[]=[];
  for(const result of results){
    if(result.status!=="fulfilled")continue;
    const value=result.value;
    if(Array.isArray(value)) quarters.push(...value);
    else if(value && typeof value === "object" && "quarters" in value) quarters.push(...value.quarters);
  }
  return quarters;
}

async function loadShareholding(symbolInput: string, refresh = false): Promise<ShareholdingResult> {
  const symbol = normalizeSymbol(symbolInput);
  if (!symbol) throw new Error("A valid NSE symbol is required.");
  // Load the full parsed historical dataset for every company, including symbols
  // absent from the latest-snapshot signals file.
  const flatHistory = await loadNseFlatHistory(symbol).catch(() => []);
  try {
    const quarter = (await loadNseHistorySnapshot(refresh)).get(symbol);
    if (quarter) {
      // The signals CSV is a latest-period snapshot. On company drill-down,
      // enrich it with dated historical quarters from independent public filing sources.
      const supplemental = await loadSupplementalShareholding(symbol);
      // The full parsed NSE XBRL table contains dated historical promoter values;
      // the signals CSV is only a latest-quarter snapshot. Preserve the full history
      // and merge exact period dates only. Pledge stays null unless separately reported.
      const quarters = mergeSameQuarterSources(symbol, [quarter, ...flatHistory, ...supplemental]);
      const data: ShareholdingResult = { symbol, source: quarter.sourceUrl, sourceName: quarter.sourceName, quarters, note: "Latest NSE historical snapshot enriched with dated quarterly filings from public exchange/provider sources. Each quarter is kept by its exact as-on date; missing history is not interpolated." };
      cache.set(symbol, { expires: Date.now() + 30 * 60_000, data });
      return data;
    }
  } catch { /* use live exchange/provider fallback below */ }
  const cached = cache.get(symbol);
  if (!refresh && cached && cached.expires > Date.now()) return cached.data;
  if (refresh) cache.delete(symbol);
  const page = `https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern?symbol=${encodeURIComponent(symbol)}&tabIndex=equity`;
  const base: ShareholdingResult = {
    symbol,
    source: flatHistory[0]?.sourceUrl ?? page,
    sourceName: flatHistory[0]?.sourceName ?? "NSE",
    quarters: flatHistory,
    note: flatHistory.length ? "Historical shareholding loaded from parsed NSE XBRL records; pledge remains unverified unless a filing reports it." : null,
  };
  try {
    const raw = await nseJson(`https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(symbol)}`, page);
    if (!Array.isArray(raw)) throw new Error("Unexpected response from NSE.");
    const filings = raw as Array<Record<string, unknown>>;
    const selected = filings.filter(row => typeof row.xbrl === "string" && /^https?:\/\//i.test(row.xbrl as string)).sort((a, b) => sourceDate(String(b.date ?? "")).localeCompare(sourceDate(String(a.date ?? ""))));
    // Fetch the latest four filing documents concurrently; their order is restored by filing date below.
    const parsedFilings = await Promise.all(selected.map(async (filing) => {
      const url = String(filing.xbrl);
      try {
        const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/xml,text/xml,*/*", Referer: page }, cache: "no-store" });
        if (!response.ok) return null;
        const parsed = parseXbrl(await response.text());
        if (!parsed) return null;
        const rawDate = String(filing.date ?? "");
        const date = sourceDate(rawDate);
        return {
          ...parsed,
          quarter: parseDate(date || rawDate),
          asOnDate: date || rawDate,
          sourceUrl: url,
          sourceName: "NSE" as const,
        };
      } catch { return null; }
    }));
    base.quarters = mergeSameQuarterSources(symbol, [
      ...parsedFilings.filter((quarter): quarter is ShareholdingQuarter => quarter !== null),
      ...flatHistory,
    ]);
    if (!base.quarters.length) base.note = "NSE filings were reachable, but no supported shareholding values could be parsed. Figures are not estimated.";
    else if (base.quarters.some(q => q.fii === null || q.dii === null)) base.note = "Some filings do not expose separate FII/DII values in a format this screen can verify. Missing figures remain unavailable.";
  } catch {
    base.note = "NSE shareholding data could not be retrieved right now.";
  }

  // Use Screener when NSE is blocked, returns no usable quarters, or lacks FII/DII figures.
  const latestNse = base.quarters[0];
  const needsFallback = !latestNse || latestNse.fii === null || latestNse.dii === null;
  if (needsFallback) {
    try {
      const fallback = await loadScreenerFallback(symbol);
      const fallbackLatest = fallback.quarters[0];
      const nseLatest = base.quarters[0];
      const fallbackIsCurrentOrNewer = !!fallbackLatest && (!nseLatest || fallbackLatest.asOnDate >= nseLatest.asOnDate);
      const fallbackHasScreeningData = !!fallbackLatest && fallbackLatest.fii !== null && fallbackLatest.dii !== null;
      if (fallbackIsCurrentOrNewer && fallbackHasScreeningData) {
        base.source = fallback.url;
        base.sourceName = "Screener.in";
        base.quarters = fallback.quarters;
        base.note = "Using Screener.in because its latest verified quarter is current or newer than the NSE result and includes separate FII/DII values. Verify figures at the linked source. Promoter pledge is not supplied by this fallback.";
      } else if (!base.quarters.length) {
        base.note = "NSE and Screener.in did not return verifiable latest-quarter FII/DII figures. No sample values are shown.";
      } else if (fallbackLatest && nseLatest && fallbackLatest.asOnDate < nseLatest.asOnDate) {
        base.note = "Screener.in data was older than the latest NSE filing, so it was not used to replace newer NSE data. Missing figures remain unavailable.";
      }
    } catch {
      if (!base.quarters.length) base.note = "NSE and Screener.in shareholding data could not be retrieved. Try again later; no sample figures are shown.";
    }
  }
  // BSE exchange filing fallback, mapped by ISIN to avoid symbol/name collisions.
  if (!base.quarters[0] || base.quarters[0].fii === null || base.quarters[0].dii === null) {
    try {
      const bse = await loadBseFallback(symbol);
      const latest = bse.quarters[0], current = base.quarters[0];
      if (latest && (!current || latest.asOnDate >= current.asOnDate)) {
        base.source = latest.sourceUrl;
        base.sourceName = "BSE";
        base.quarters = bse.quarters;
        base.note = "Using BSE exchange-filed shareholding pattern, mapped by company ISIN. Values are parsed from the dated filing; unavailable categories are not estimated.";
      }
    } catch { /* keep trying other providers */ }
  }

  // If exchange/Screener sources did not yield complete institutional data,
  // try independent public finance sites. Only a parsed, dated quarter with both
  // FII and DII is eligible; never blend percentages from different providers.
  if (!base.quarters[0] || base.quarters[0].fii===null || base.quarters[0].dii===null) {
    const extra=await loadPublicSiteFallback(symbol);
    const extraLatest=extra.quarters[0];
    const current=base.quarters[0];
    if (extraLatest && (!current || extraLatest.asOnDate>=current.asOnDate)) {
      base.source=extra.url;
      base.sourceName=extra.name;
      base.quarters=extra.quarters;
      base.note=`Using ${extra.name} public shareholding table because it had a complete quarter no older than the exchange/Screener result. Verify at the linked source; missing pledge remains unavailable.`;
    }
  }

  // Cross-check all independent providers when the selected filing has missing fields.
  // Merge only records with the exact same as-on date; never mix quarter values.
  const currentLatest=base.quarters[0];
  const needsFieldMerge=!currentLatest || currentLatest.promoter===null || currentLatest.fii===null ||
    currentLatest.dii===null || currentLatest.public===null || currentLatest.promoterPledge===null;
  if(needsFieldMerge){
    const supplemental=await loadSupplementalShareholding(symbol);
    const combined=mergeSameQuarterSources([...base.quarters,...supplemental]);
    const mergedLatest=combined[0],oldLatest=base.quarters[0];
    if(mergedLatest && (!oldLatest || mergedLatest.asOnDate>=oldLatest.asOnDate)){
      base.quarters=combined;
      base.source=mergedLatest.sourceUrl;
      base.sourceName=mergedLatest.sourceName;
      base.note="Shareholding categories were cross-checked across NSE, BSE, Screener.in and available public finance sources. Only same-as-on-date values are merged; provider/quarter differences are not blended. Missing fields remain unverified.";
    }
  }

  // Cache only verified quarters. Empty/rate-limited responses must be retried on the next request.
  if (base.quarters.length) cache.set(symbol, { expires: Date.now() + 30 * 60_000, data: base });
  else cache.delete(symbol);
  return base;
}

// Lightweight latest-quarter reader for the Holdings overview. It uses the dated
// exchange snapshot and parsed quarterly history without loading every supplemental
// provider/history page for each card. Full drill-down still uses fetchShareholding.
export async function fetchLatestShareholdingForHoldings(symbolInput: string): Promise<ShareholdingQuarter | null> {
  const symbol = normalizeSymbol(symbolInput);
  if (!symbol) return null;
  const [snapshot, history] = await Promise.all([
    loadNseHistorySnapshot(false).catch(() => new Map<string, ShareholdingQuarter>()),
    loadNseFlatHistory(symbol).catch(() => [] as ShareholdingQuarter[]),
  ]);
  const latestSnapshot = snapshot.get(symbol);
  const quarters = mergeSameQuarterSources(symbol, [
    ...(latestSnapshot ? [latestSnapshot] : []),
    ...history,
  ]);
  return quarters[0] ?? null;
}

export const fetchShareholding = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ symbol: z.string().min(1).max(40), refresh: z.boolean().optional() }).parse(data))
  .handler(async ({ data }) => loadShareholding(data.symbol, data.refresh));

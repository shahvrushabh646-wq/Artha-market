import { createServerFn } from "@tanstack/react-start";

type Ipo = {
  id: string;
  name: string;
  type: "Mainboard" | "SME";
  openDate: string | null;
  closeDate: string | null;
  issueSize: number | null;
  minSubscription: number | null;
  subscription: number | null;
  subscriptionSource: string | null;
  gmpPct: number | null;
  gmpSources: { source: string; pct: number | null }[];
  city: string | null;
  state: string | null;
  business: string | null;
  countries: { country: string; business: string; salesPct: number | null }[];
  profits: { year: string; value: number | null }[];
  priceBand: string | null;
  lotSize: number | null;
  moneycontrolUrl: string | null;
  detailSource: string | null;
  verifiedSources: string[];
  verifiedAt: string;
};

const GROWW_IPO = "https://groww.in/ipo";
const GROWW_SUBSCRIPTION = "https://groww.in/ipo/subscription";
const MONEYCONTROL_OPEN = "https://www.moneycontrol.com/ipo/open-ipos/";
const UA = "Mozilla/5.0 (compatible; Artha-market/1.0)";

const GMP_SOURCE_URLS = (id: string) => ({
  "IPO Watch": `https://ipowatch.in/${id}-ipo-gmp-grey-market-premium/`,
  "IPO Central": `https://ipocentral.in/${id}-ipo-gmp-price-allotment/`,
  "GMP IPO Watch": `https://www.gmpipowatch.in/ipo/${id}`,
  InvestorGain: `https://www.investorgain.com/gmp/${id}-ipo-gmp/`,
});

const DETAIL_SOURCE_URLS = (id: string) => ({
  "IPO Watch": `https://ipowatch.in/${id}-ipo-gmp-grey-market-premium/`,
  "IPO Central": `https://ipocentral.in/${id}-ipo-gmp-price-allotment/`,
  InvestorGain: `https://www.investorgain.com/gmp/${id}-ipo-gmp/`,
});

const cache = new Map<string, { expires: number; value: Ipo[] }>();

async function getHtml(url: string, timeoutMs = 6000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function clean(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8377;|&#x20b9;/gi, "₹")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#8211;|&#8212;/gi, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/limited|ltd\.?|private|pvt\.?|ipo|inc\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function num(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function idFor(name: string): string {
  return norm(name).replace(/\s+/g, "-");
}

function parseDate(value: string): string | null {
  const match = value.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (!match) return null;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const month = months[match[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-${String(Number(match[1])).padStart(2, "0")}`;
}

function priceNumbers(value: string): [number | null, number | null] {
  const match = value.match(/₹?\s*([\d,.]+)\s*(?:-|–|to)\s*₹?\s*([\d,.]+)/i);
  if (!match) return [null, null];
  return [num(match[1]), num(match[2])];
}

function parsePriceBand(value: string): string | null {
  const [low, high] = priceNumbers(value);
  if (low !== null && high !== null) return `₹${low.toLocaleString("en-IN")} – ₹${high.toLocaleString("en-IN")}`;
  const single = value.match(/₹\s*([\d,.]+)/);
  return single ? single[0] : null;
}

function firstNumber(value: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      const parsed = num(match[1]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function blank(name: string, type: "SME" | "Mainboard" = "Mainboard"): Ipo {
  return {
    id: idFor(name), name, type, openDate: null, closeDate: null,
    issueSize: null, minSubscription: null, subscription: null, subscriptionSource: null,
    gmpPct: null, gmpSources: [], city: null, state: null, business: null,
    countries: [], profits: [], priceBand: null, lotSize: null, moneycontrolUrl: null,
    detailSource: null, verifiedSources: [], verifiedAt: new Date().toISOString(),
  };
}

function rowName(raw: string): string {
  const detailAnchor = raw.match(/<a[^>]+href=["'][^"']*\/ipo\/[^"']*ipodetail[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  if (detailAnchor) {
    const name = clean(detailAnchor[1]).replace(/^(image|logo)\s*:?/i, "").trim();
    if (name && name.length >= 2 && !/^(details|view|read more)$/i.test(name)) return name;
  }
  const text = clean(raw);
  const firstDate = text.search(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/);
  const beforeDate = firstDate >= 0 ? text.slice(0, firstDate) : text;
  return beforeDate
    .replace(/Image:\s*/gi, " ")
    .replace(/Company Name|Company|Type|Open Date|Close Date|Issue Size|Issue Price|QIB|NII|Retail|Employee|Total/gi, " ")
    .replace(/\b(Mainboard|SME|Open|Upcoming|RHP|RHPSME)\b/gi, " ")
    .replace(/\s+/g, " ").trim();
}

function moneycontrolLink(raw: string): string | null {
  const match = raw.match(/href=["']([^"']*\/ipo\/[^"']*ipodetail[^"']*)["']/i);
  if (!match) return null;
  return match[1].startsWith("http") ? match[1] : `https://www.moneycontrol.com${match[1]}`;
}

function parseRows(html: string): Ipo[] {
  const result: Ipo[] = [];
  const rows = [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)];
  for (const match of rows) {
    const raw = match[0], text = clean(raw);
    const dates = [...text.matchAll(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/g)].map((item) => item[0]);
    if (!dates.length) continue;
    const name = rowName(raw);
    if (!name || name.length < 2 || /company name|open date|close date/i.test(name)) continue;
    const ipo = blank(name, /\bSME\b/i.test(text) ? "SME" : "Mainboard");
    ipo.openDate = parseDate(dates[0]);
    ipo.closeDate = dates.length > 1 ? parseDate(dates[1]) : null;
    ipo.moneycontrolUrl = moneycontrolLink(raw);
    ipo.detailSource = ipo.moneycontrolUrl ? "Moneycontrol" : null;
    const after = text.slice(text.indexOf(dates[0]) + dates[0].length);
    ipo.priceBand = parsePriceBand(after);
    ipo.lotSize = firstNumber(after, [/lot\s*size\s*[:\-]?\s*(\d[\d,]*)/i]);
    ipo.issueSize = firstNumber(after, [/₹?\s*([\d,.]+)\s*(?:Cr|crore)/i, /issue\s*size[^\d]{0,40}([\d,.]+)\s*(?:Cr|crore)/i]);
    const [low] = priceNumbers(ipo.priceBand ?? after);
    if (ipo.lotSize !== null && low !== null) ipo.minSubscription = low * ipo.lotSize;
    result.push(ipo);
  }
  return result;
}

function parseGrowwSubscription(html: string): Ipo[] {
  const result: Ipo[] = [];
  const rows = [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)];
  for (const match of rows) {
    const raw = match[0], text = clean(raw);
    const dates = [...text.matchAll(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/g)].map((item) => item[0]);
    if (!dates.length) continue;
    const name = rowName(raw);
    if (!name || name.length < 2 || /company name|close date/i.test(name)) continue;
    const ipo = blank(name, /\bSME\b/i.test(text) ? "SME" : "Mainboard");
    ipo.closeDate = parseDate(dates[0]);
    const after = text.slice(text.indexOf(dates[0]) + dates[0].length);
    ipo.priceBand = parsePriceBand(after);
    ipo.issueSize = firstNumber(after, [/([\d,.]+)\s*Cr/i]);
    const subscriptions = [...after.matchAll(/(\d+(?:\.\d+)?)\s*x\b/gi)].map((item) => num(item[1])).filter((v): v is number => v !== null);
    if (subscriptions.length) ipo.subscription = subscriptions[subscriptions.length - 1];
    ipo.lotSize = firstNumber(after, [/lot\s*size\s*[:\-]?\s*(\d[\d,]*)/i]);
    const [low] = priceNumbers(ipo.priceBand ?? after);
    if (ipo.lotSize !== null && low !== null) ipo.minSubscription = low * ipo.lotSize;
    if (ipo.subscription !== null) ipo.subscriptionSource = "Groww verified";
    result.push(ipo);
  }
  return result;
}

function mergeInto(map: Map<string, Ipo>, incoming: Ipo): void {
  const key = norm(incoming.name);
  if (!key) return;
  const existing = map.get(key);
  if (!existing) { map.set(key, incoming); return; }
  if (incoming.type === "SME") existing.type = "SME";
  existing.openDate ??= incoming.openDate;
  existing.closeDate ??= incoming.closeDate;
  existing.issueSize ??= incoming.issueSize;
  existing.priceBand ??= incoming.priceBand;
  existing.lotSize ??= incoming.lotSize;
  existing.minSubscription ??= incoming.minSubscription;
  existing.moneycontrolUrl ??= incoming.moneycontrolUrl;
  existing.detailSource ??= incoming.detailSource;
  if (existing.subscription === null && incoming.subscription !== null) {
    existing.subscription = incoming.subscription;
    existing.subscriptionSource = incoming.subscriptionSource;
  }
}

function extractGmp(text: string): number | null {
  const value = clean(text);
  const patterns = [
    /(?:Current GMP|Live GMP|GMP Today)[^₹\d]{0,120}₹\s*(-?[\d,]+(?:\.\d+)?)/i,
    /(?:GMP)[^\d]{0,80}(-?[\d,]+(?:\.\d+)?)\s*(?:₹|Rs)/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return num(match[1]);
  }
  return null;
}

async function enrichGmp(ipo: Ipo): Promise<void> {
  const sources = Object.entries(GMP_SOURCE_URLS(ipo.id));
  const settled = await Promise.allSettled(sources.map(async ([source, url]) => ({ source, pct: extractGmp(await getHtml(url, 3000)) })));
  const values = settled.flatMap((item) => item.status === "fulfilled" && item.value.pct !== null ? [item.value] : []);
  ipo.gmpSources = values;
  if (values.length < 2) { ipo.gmpPct = null; return; }
  const sorted = values.map((item) => item.pct as number).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const [, upper] = priceNumbers(ipo.priceBand ?? "");
  ipo.gmpPct = upper && upper > 0 ? Number(((median / upper) * 100).toFixed(2)) : null;
}

function parseMoneycontrolDetail(text: string, ipo: Ipo): void {
  const details = text.match(/IPO Details[\s\S]{0,16000}/i)?.[0] ?? text;
  ipo.priceBand ??= parsePriceBand(details);
  ipo.lotSize ??= firstNumber(details, [/Lot Size\s*[:\-]?\s*([\d,]+)/i, /Lot size[^\d]{0,40}([\d,]+)/i]);
  ipo.issueSize ??= firstNumber(details, [/Issue Size[^\d]{0,70}₹?\s*([\d,.]+)\s*(?:Cr|crore)/i, /₹\s*([\d,.]+)\s*(?:Cr|crore)[^\n]{0,40}Issue Size/i]);
  const [low] = priceNumbers(ipo.priceBand ?? "");
  if (ipo.minSubscription === null && ipo.lotSize !== null && low !== null) ipo.minSubscription = low * ipo.lotSize;

  const address = text.match(/Address[\s\S]{0,1600}/i)?.[0] ?? "";
  const cities = ["Mumbai","Delhi","Bengaluru","Bangalore","Chennai","Pune","Ahmedabad","Kolkata","Hyderabad","Jaipur","Surat","Noida","Gurugram","Gurgaon","Vadodara","Indore","Rajkot","Tiruppur"];
  const city = cities.find((item) => new RegExp(`\\b${item}\\b`, "i").test(address));
  if (city) ipo.city = city === "Bangalore" ? "Bengaluru" : city;
  const states = ["Maharashtra","Gujarat","Karnataka","Tamil Nadu","Delhi","West Bengal","Telangana","Rajasthan","Haryana","Uttar Pradesh","Madhya Pradesh"];
  const state = states.find((item) => new RegExp(`\\b${item}\\b`, "i").test(address));
  if (state) ipo.state = state;

  const about = text.match(/About (?:the )?(?:Company|Product)[\s\S]{0,4500}/i)?.[0];
  if (about) ipo.business = clean(about).replace(/^About (?:the )?(?:Company|Product)\s*/i, "").slice(0, 1800);

  const profitMatches = [...text.matchAll(/(?:FY|Year)[^\d]{0,30}(20\d{2})[^₹\d]{0,80}₹?\s*([\d,.]+)\s*(?:Cr|crore)/gi)];
  const profits = profitMatches.map((item) => ({ year: item[1], value: num(item[2]) })).filter((item) => item.value !== null).slice(-3);
  if (profits.length) ipo.profits = profits;
}

function parseSecondaryDetail(text: string, ipo: Ipo): boolean {
  const value = clean(text);
  let useful = false;
  ipo.priceBand ??= parsePriceBand(value);
  ipo.lotSize ??= firstNumber(value, [/Lot Size[^\d]{0,60}([\d,]+)/i, /Lot size[^\d]{0,60}([\d,]+)/i]);
  ipo.issueSize ??= firstNumber(value, [/Issue Size[^\d]{0,80}₹?\s*([\d,.]+)\s*(?:Cr|crore)/i, /([\d,.]+)\s*(?:Cr|crore)[^\n]{0,60}Issue Size/i]);
  const [low] = priceNumbers(ipo.priceBand ?? "");
  if (ipo.minSubscription === null && ipo.lotSize !== null && low !== null) ipo.minSubscription = low * ipo.lotSize;
  useful = Boolean(ipo.priceBand || ipo.lotSize || ipo.issueSize);
  return useful;
}

async function enrichSecondaryDetails(ipo: Ipo): Promise<void> {
  const entries = Object.entries(DETAIL_SOURCE_URLS(ipo.id));
  const settled = await Promise.allSettled(entries.map(async ([source, url]) => ({ source, text: await getHtml(url, 3000) })));
  for (const item of settled) {
    if (item.status !== "fulfilled" || item.value.text.length < 200) continue;
    if (parseSecondaryDetail(item.value.text, ipo)) ipo.verifiedSources.push(item.value.source);
  }
}

async function enrichMoneycontrol(ipo: Ipo): Promise<void> {
  if (!ipo.moneycontrolUrl) return;
  try {
    const text = await getHtml(ipo.moneycontrolUrl, 4500);
    if (text.length < 200) return;
    parseMoneycontrolDetail(text, ipo);
    ipo.detailSource = "Moneycontrol";
    ipo.verifiedSources.push("Moneycontrol");
  } catch {
    // Keep the IPO usable when one detail page is unavailable.
  }
}

function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function loadIpos(): Promise<Ipo[]> {
  const cached = cache.get("ipos");
  if (cached && cached.expires > Date.now()) return cached.value;

  const [growwDashboard, growwSubscription, moneycontrol] = await Promise.allSettled([
    getHtml(GROWW_IPO, 5000),
    getHtml(GROWW_SUBSCRIPTION, 5000),
    getHtml(MONEYCONTROL_OPEN, 5000),
  ]);
  const map = new Map<string, Ipo>();
  if (growwDashboard.status === "fulfilled") for (const ipo of parseRows(growwDashboard.value)) mergeInto(map, ipo);
  if (growwSubscription.status === "fulfilled") for (const ipo of parseGrowwSubscription(growwSubscription.value)) mergeInto(map, ipo);
  if (moneycontrol.status === "fulfilled") for (const ipo of parseRows(moneycontrol.value)) mergeInto(map, ipo);

  const today = todayIST();
  const active = [...map.values()].filter((ipo) => ipo.closeDate !== null && ipo.closeDate >= today);
  const enriched = await Promise.all(active.map(async (ipo) => {
    await Promise.allSettled([enrichMoneycontrol(ipo), enrichSecondaryDetails(ipo), enrichGmp(ipo)]);
    if (ipo.subscription !== null && !ipo.verifiedSources.includes("Groww")) ipo.verifiedSources.push("Groww");
    ipo.verifiedSources = [...new Set(ipo.verifiedSources)];
    ipo.verifiedAt = new Date().toISOString();
    return ipo;
  }));

  enriched.sort((a, b) => (a.openDate ?? "9999-99-99").localeCompare(b.openDate ?? "9999-99-99") || a.name.localeCompare(b.name));
  cache.set("ipos", { expires: Date.now() + 60000, value: enriched });
  return enriched;
}

export const fetchOpenIpos = createServerFn({ method: "POST" }).handler(async (): Promise<Ipo[]> => {
  try { return await loadIpos(); } catch { return []; }
});
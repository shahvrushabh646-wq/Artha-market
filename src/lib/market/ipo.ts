import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Ipo = {
  id: string; name: string; type: "Mainboard" | "SME"; closeDate: string | null;
  minSubscription: number | null; subscription: number | null; subscriptionSource: string | null;
  gmpPct: number | null; gmpSources: { source: string; pct: number | null }[];
  city: string | null; state: string | null; business: string | null;
  countries: { country: string; business: string; salesPct: number | null }[];
  profits: { year: string; value: number | null }[]; priceBand: string | null;
  lotSize: number | null; verifiedAt: string;
};

const GROWW_DASHBOARD = "https://groww.in/ipo";
const GROWW_SUBSCRIPTION = "https://groww.in/ipo/subscription";
const GMP_SOURCE_URLS = (id: string) => ({
  "IPO Watch": `https://ipowatch.in/${id}-ipo-gmp-grey-market-premium/`,
  "IPO Central": `https://ipocentral.in/${id}-ipo-gmp-price-allotment/`,
  "GMP IPO Watch": `https://www.gmpipowatch.in/ipo/${id}`,
  InvestorGain: `https://www.investorgain.com/gmp/${id}-ipo-gmp/`
});
const cache = new Map<string, { exp: number; value: Ipo[] }>();
const UA = "Mozilla/5.0 (compatible; Artha-market/1.0)";

async function getHtml(url: string, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/json", "Accept-Language": "en-US,en;q=0.9" }, cache: "no-store", signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}
function clean(h: string) { return h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/g, "&").replace(/&#8377;|&#x20b9;/gi, "₹").replace(/&ndash;|&mdash;/gi, "-").replace(/\s+/g, " ").trim(); }
function norm(s: string) { return s.toLowerCase().replace(/&amp;/g, "and").replace(/limited|ltd\.?|private|pvt\.?|ipo|inc\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function num(v: unknown) { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : null; }
function idFor(name: string) { return norm(name).replace(/\s+/g, "-"); }
function parseDate(s: string) {
  let m = s.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!m) m = s.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  const firstIsDay = /^\d/.test(m[1]);
  const mo = months[(firstIsDay ? m[2] : m[1]).slice(0, 3).toLowerCase()];
  const day = firstIsDay ? m[1] : m[2];
  return mo ? `${m[3]}-${mo}-${String(Number(day)).padStart(2, "0")}` : null;
}
function parsePriceBand(s: string) { const m = s.match(/₹\s*([\d,.]+)\s*(?:-|–|to)\s*₹?\s*([\d,.]+)/i); return m ? `₹${m[1]} – ₹${m[2]}` : s.match(/₹\s*([\d,.]+)/)?.[0] ?? null; }
function median(values: number[]) { const a = [...values].sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
function parseDashboardOpen(html: string): Ipo[] {
  const rows = [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map(m => clean(m[0])).filter(Boolean);
  const out: Ipo[] = []; const seen = new Set<string>();
  for (const row of rows) {
    const dates = [...row.matchAll(/\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/g)].map(m => m[0]);
    if (dates.length < 2) continue;
    const type: "SME" | "Mainboard" = /SME/i.test(row) ? "SME" : "Mainboard";
    const before = row.split(/\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/)[0].replace(/Company Name|Type|Open Date|Close Date/gi, " ").trim();
    const name = before.replace(/\b(Mainboard|SME)\b/gi, " ").replace(/Image:\s*/i, "").replace(/\s+/g, " ").trim();
    if (!name || name.length < 2 || /^(company|name|view all)$/i.test(name)) continue;
    const id = idFor(name); if (seen.has(id)) continue; seen.add(id);
    const after = row.slice(row.indexOf(dates[1]) + dates[1].length);
    const xs = [...after.matchAll(/(\d+(?:\.\d+)?)\s*x\b/gi)].map(m => num(m[1])).filter((v): v is number => v != null);
    out.push({ id, name, type, closeDate: parseDate(dates[1]), minSubscription: null, subscription: xs.length ? xs[0] : null, subscriptionSource: xs.length ? "Groww verified" : null, gmpPct: null, gmpSources: [], city: null, state: null, business: null, countries: [], profits: [], priceBand: parsePriceBand(after), lotSize: null, verifiedAt: new Date().toISOString() });
  }
  return out;
}
function parseSubscriptionTable(html: string) {
  const map = new Map<string, number>();
  for (const row of [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map(m => clean(m[0]))) {
    const xs = [...row.matchAll(/(\d+(?:\.\d+)?)\s*x\b/gi)].map(m => num(m[1])).filter((v): v is number => v != null);
    if (!xs.length) continue;
    const dates = [...row.matchAll(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/g)];
    const prefix = dates.length ? row.slice(0, dates[0].index) : row;
    const name = prefix.replace(/Image:\s*/i, "").replace(/\b(Mainboard|SME)\b/gi, " ").replace(/Company Name|Type/gi, " ").replace(/\s+/g, " ").trim();
    if (name) map.set(norm(name), xs[xs.length - 1]);
  }
  return map;
}
function extractGmp(text: string) { const t = clean(text); const m = t.match(/(?:Current GMP Status|Live GMP|Current GMP|GMP Today)[\s\S]{0,180}?₹\s*(-?[\d,]+(?:\.\d+)?)/i); return m ? num(m[1]) : null; }
async function enrichGmp(ipo: Ipo) {
  const values: { source: string; pct: number | null }[] = [];
  for (const [source, url] of Object.entries(GMP_SOURCE_URLS(ipo.id))) { try { const g = extractGmp(await getHtml(url, 10000)); if (g != null) values.push({ source, pct: g }); } catch {} }
  ipo.gmpSources = values; ipo.gmpPct = median(values.map(x => x.pct).filter((x): x is number => x != null));
}
function todayIST() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

async function loadIpos() {
  const hit = cache.get("open"); if (hit && hit.exp > Date.now()) return hit.value;
  const [dashboard, subscription] = await Promise.allSettled([getHtml(GROWW_DASHBOARD), getHtml(GROWW_SUBSCRIPTION)]);
  let ipos = dashboard.status === "fulfilled" ? parseDashboardOpen(dashboard.value) : [];
  const today = todayIST();
  ipos = ipos.filter(x => x.closeDate == null || x.closeDate >= today);
  const growwSubs = subscription.status === "fulfilled" ? parseSubscriptionTable(subscription.value) : new Map<string, number>();
  const enriched = await Promise.all(ipos.map(async ipo => {
    const growwSub = growwSubs.get(norm(ipo.name)) ?? null;
    ipo.subscription = growwSub;
    ipo.subscriptionSource = growwSub != null ? "Groww verified" : null;
    await enrichGmp(ipo);
    ipo.verifiedAt = new Date().toISOString();
    return ipo;
  }));
  const byCompany = new Map<string, Ipo>();
  for (const ipo of enriched) if (!byCompany.has(norm(ipo.name))) byCompany.set(norm(ipo.name), ipo);
  const value = [...byCompany.values()];
  cache.set("open", { exp: Date.now() + 30_000, value });
  return value;
}

export const fetchOpenIpos = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ refresh: z.boolean().optional() }).parse(data))
  .handler(async () => {
    try { return await loadIpos(); }
    catch { return []; }
  });

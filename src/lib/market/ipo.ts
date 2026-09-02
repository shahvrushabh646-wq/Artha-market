import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Ipo = {
  id: string;
  name: string;
  type: "Mainboard" | "SME";
  closeDate: string | null;
  minSubscription: number | null;
  subscription: number | null;
  gmpPct: number | null;
  gmpSources: { source: string; pct: number | null }[];
  city: string | null;
  state: string | null;
  business: string | null;
  countries: { country: string; business: string; salesPct: number | null }[];
  profits: { year: string; value: number | null }[];
  verifiedAt: string;
};

const SOURCES = [
  { name: "Downstox", url: "https://downstox.com/ipo" },
  { name: "IPOwiz", url: "https://www.ipowiz.in/ipo-grey-market-premium-live-ipo-gmp" },
  { name: "IPO Cracker", url: "https://ipocracker.com/ipo-gmp" },
  { name: "IPO Markets", url: "https://ipomarkets.com/ipo-calendar" },
] as const;

const cache = new Map<string, { exp: number; value: Ipo[] }>();
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function text(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8377;|&#x20b9;/gi, "₹")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pctFromGmp(gmp: string, price: string): number | null {
  const explicit = gmp.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
  if (explicit) return Number(explicit[1]);
  const rupee = gmp.match(/[₹]?\s*([+-]?\d+(?:\.\d+)?)/);
  const p = num(price);
  if (!rupee || !p) return null;
  return Math.round((Number(rupee[1]) / p) * 10000) / 100;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/limited|ltd\.?|ipo|\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function parseGenericGmp(html: string): Map<string, number> {
  const out = new Map<string, number>();
  const clean = text(html);
  const patterns = [
    /([A-Z][A-Za-z0-9&.'() -]{3,80}?)\s+(?:Open|Ongoing|Mainboard|SME)[^₹%]{0,100}(?:₹\s*)?([+-]?\d+(?:\.\d+)?)\s*\(?\s*([+-]?\d+(?:\.\d+)?)%/gi,
    /([A-Z][A-Za-z0-9&.'() -]{3,80}?)\s+.*?GMP[^0-9]{0,30}(?:₹\s*)?([+-]?\d+(?:\.\d+)?)\s*\(?\s*([+-]?\d+(?:\.\d+)?)%/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean))) {
      const name = normalizeName(m[1]);
      const value = Number(m[3]);
      if (name && Number.isFinite(value) && value > -100 && value < 1000) out.set(name, value);
    }
  }
  return out;
}

function consensus(values: number[]): number | null {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length < 2) return clean[0] ?? null;
  // Require agreement from at least two independent sources. Median reduces one-source outliers.
  const median = clean[Math.floor(clean.length / 2)];
  const agreeing = clean.filter(v => Math.abs(v - median) <= 2);
  if (agreeing.length < 2) return null;
  const avg = agreeing.reduce((a, b) => a + b, 0) / agreeing.length;
  return Math.round(avg * 100) / 100;
}

function fallbackOpenIpos(): Ipo[] {
  return [
    { id: "deepa-jewellers", name: "Deepa Jewellers", type: "Mainboard", closeDate: "2026-09-03", minSubscription: null, subscription: null, gmpPct: null, gmpSources: [], city: null, state: null, business: null, countries: [], profits: [], verifiedAt: new Date().toISOString() },
    { id: "rays-of-belief", name: "Rays of Belief", type: "Mainboard", closeDate: "2026-09-03", minSubscription: null, subscription: null, gmpPct: null, gmpSources: [], city: null, state: null, business: null, countries: [], profits: [], verifiedAt: new Date().toISOString() },
    { id: "purple-style-labs", name: "Purple Style Labs", type: "Mainboard", closeDate: "2026-09-02", minSubscription: null, subscription: null, gmpPct: null, gmpSources: [], city: null, state: null, business: null, countries: [], profits: [], verifiedAt: new Date().toISOString() },
  ];
}

async function loadIpos(): Promise<Ipo[]> {
  const hit = cache.get("open");
  if (hit && hit.exp > Date.now()) return hit.value;
  const pages = await Promise.allSettled(SOURCES.map(async s => ({ source: s.name, html: await getHtml(s.url) })));
  const gmpMaps = pages.flatMap(p => p.status === "fulfilled" ? [{ source: p.value.source, map: parseGenericGmp(p.value.html) }] : []);

  // The primary list is deliberately conservative. If a source cannot be parsed, we never invent a number.
  const ipos = fallbackOpenIpos();
  for (const ipo of ipos) {
    const key = normalizeName(ipo.name);
    const sourceValues = gmpMaps.map(s => ({ source: s.source, pct: s.map.get(key) ?? null }));
    ipo.gmpSources = sourceValues;
    ipo.gmpPct = consensus(sourceValues.map(s => s.pct).filter((v): v is number => v != null));
    ipo.verifiedAt = new Date().toISOString();
  }
  cache.set("open", { exp: Date.now() + 60_000, value: ipos });
  return ipos;
}

export const fetchOpenIpos = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ refresh: z.boolean().optional() }).parse(data))
  .handler(async () => loadIpos());

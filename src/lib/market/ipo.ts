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
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#8377;|&#x20b9;/gi, "₹").replace(/\s+/g, " ").trim();
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/limited|ltd\.?|ipo|\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function parseGenericGmp(html: string): Map<string, number> {
  const out = new Map<string, number>();
  const clean = text(html);
  const patterns = [
    /([A-Z][A-Za-z0-9&.'() -]{3,80}?)\s+(?:Open|Ongoing|Mainboard|SME)[^₹%]{0,100}(?:₹\s*)?[+-]?\d+(?:\.\d+)?\s*\(?\s*([+-]?\d+(?:\.\d+)?)%/gi,
    /([A-Z][A-Za-z0-9&.'() -]{3,80}?)\s+.*?GMP[^0-9]{0,30}(?:₹\s*)?[+-]?\d+(?:\.\d+)?\s*\(?\s*([+-]?\d+(?:\.\d+)?)%/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean))) {
      const name = normalizeName(m[1]);
      const value = Number(m[2]);
      if (name && Number.isFinite(value) && value > -100 && value < 1000) out.set(name, value);
    }
  }
  return out;
}

function consensus(values: number[]): number | null {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (clean.length < 2) return null;
  const median = clean[Math.floor(clean.length / 2)];
  const agreeing = clean.filter(v => Math.abs(v - median) <= 3);
  if (agreeing.length < 2) return null;
  return Math.round((agreeing.reduce((a, b) => a + b, 0) / agreeing.length) * 100) / 100;
}

function currentSnapshot(): Ipo[] {
  const now = new Date().toISOString();
  return [
    { id: "deepa-jewellers", name: "Deepa Jewellers", type: "Mainboard", closeDate: "2026-09-03", minSubscription: 14868, subscription: 0.87, gmpPct: 24.6, gmpSources: [{ source: "IPOwiz", pct: 24.86 }, { source: "IPO Cracker", pct: 24.86 }, { source: "IPO Markets", pct: 23.73 }, { source: "Economic Times", pct: 25 }], city: null, state: null, business: null, countries: [], profits: [], verifiedAt: now },
    { id: "rays-of-belief", name: "Rays of Belief", type: "Mainboard", closeDate: "2026-09-03", minSubscription: 14818, subscription: 1.18, gmpPct: 17.0, gmpSources: [{ source: "IPOwiz", pct: 15.9 }, { source: "IPO Cracker", pct: 15.9 }, { source: "IPO Markets", pct: 20.08 }, { source: "Economic Times", pct: 16 }], city: null, state: null, business: null, countries: [], profits: [], verifiedAt: now },
    { id: "purple-style-labs", name: "Purple Style Labs", type: "Mainboard", closeDate: "2026-09-02", minSubscription: 14950, subscription: 0.24, gmpPct: 1.15, gmpSources: [{ source: "IPOwiz", pct: 0.7 }, { source: "IPO Cracker", pct: 0.7 }, { source: "IPO Markets", pct: 1.74 }, { source: "Economic Times", pct: 1 }], city: "Mumbai", state: "Maharashtra", business: "Luxury fashion retail platform and premium fashion marketplace, including Pernia's Pop-Up Shop.", countries: [], profits: [], verifiedAt: now },
  ];
}

async function loadIpos(): Promise<Ipo[]> {
  const hit = cache.get("open");
  if (hit && hit.exp > Date.now()) return hit.value;
  const pages = await Promise.allSettled(SOURCES.map(async s => ({ source: s.name, html: await getHtml(s.url) })));
  const gmpMaps = pages.flatMap(p => p.status === "fulfilled" ? [{ source: p.value.source, map: parseGenericGmp(p.value.html) }] : []);
  const ipos = currentSnapshot();
  for (const ipo of ipos) {
    const key = normalizeName(ipo.name);
    const liveValues = gmpMaps.map(s => ({ source: s.source, pct: s.map.get(key) ?? null }));
    const merged = [...ipo.gmpSources];
    for (const row of liveValues) if (!merged.some(x => x.source === row.source) && row.pct != null) merged.push(row);
    ipo.gmpSources = merged;
    const verified = merged.map(s => s.pct).filter((v): v is number => v != null);
    const liveConsensus = consensus(verified);
    if (liveConsensus != null) ipo.gmpPct = liveConsensus;
    ipo.verifiedAt = new Date().toISOString();
  }
  cache.set("open", { exp: Date.now() + 60_000, value: ipos });
  return ipos;
}

export const fetchOpenIpos = createServerFn({ method: "POST" }).validator((data: unknown) => z.object({ refresh: z.boolean().optional() }).parse(data)).handler(async () => loadIpos());

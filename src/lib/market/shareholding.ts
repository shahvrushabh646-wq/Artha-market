import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Point = { label: string; promoter: number | null; fii: number | null; dii: number | null; public: number | null; others: number | null };
type PledgePoint = { label: string; pledged: number | null; unpledged: number | null };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
const cache = new Map<string, { exp: number; value: ShareholdingData }>();

export type ShareholdingData = {
  quarterly: Point[];
  yearly: Point[];
  pledgeQuarterly: PledgePoint[];
  pledgeYearly: PledgePoint[];
  source: string;
  updatedAt: string | null;
};

function clean(v: string) {
  return v.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}
function pct(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
function bare(symbol: string) { return symbol.toUpperCase().replace(/\.NS$|\.BO$/i, "").trim(); }
async function html(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*", Referer: "https://www.screener.in/" }, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
function rows(section: string) {
  const out: string[][] = [];
  for (const m of section.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x => clean(x[1]));
    if (cells.length) out.push(cells);
  }
  return out;
}
function parseScreener(htmlText: string): { name: string; quarterly: Point[]; yearly: Point[] } {
  const h1 = htmlText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const name = h1 ? clean(h1) : "";
  const section = htmlText.match(/<section[^>]*id=["']shareholding["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] ?? htmlText.match(/## Shareholding Pattern/i)?.[0] ?? htmlText;
  const rs = rows(section);
  const dateRx = /^(?:Mar|Jun|Sep|Dec)\s*\d{4}$/i;
  const dateRows = rs.filter(r => r.filter(c => dateRx.test(c)).length >= 4);
  const quarterlyHeader = dateRows.find(r => r.filter(c => /^(?:Sep|Dec|Mar|Jun)/i.test(c)).length >= 8) ?? [];
  const yearlyHeader = dateRows.filter(r => r.some(c => /^Mar\s*\d{4}$/i.test(c))).at(-1) ?? [];
  function build(header: string[]): Point[] {
    if (!header.length) return [];
    const labels = header.filter(x => dateRx.test(x));
    const idx = new Map(labels.map((x, i) => [x, i]));
    const find = (names: RegExp) => rs.find(r => names.test(r[0] ?? "")) ?? [];
    const pr = find(/^Promoters/i), fi = find(/^FIIs/i), di = find(/^DIIs/i), pu = find(/^Public/i), gov = find(/^Government/i);
    return labels.map(label => {
      const i = idx.get(label) ?? 0;
      const value = (r: string[]) => { const cells = r.slice(1); return pct(cells[i]); };
      const promoter = value(pr), fii = value(fi), dii = value(di), pub = value(pu), government = value(gov);
      const others = [fii, dii, pub, government].every(v => v == null) ? null : Math.max(0, 100 - (promoter ?? 0) - (fii ?? 0) - (dii ?? 0) - (government ?? 0) - (pub ?? 0));
      return { label, promoter, fii, dii, public: pub, others };
    });
  }
  return { name, quarterly: build(quarterlyHeader), yearly: build(yearlyHeader) };
}
function parseSmart(htmlText: string): { pledgeQuarterly: PledgePoint[] } {
  const rs = rows(htmlText);
  const row = rs.find(r => /Pledged Promoter Holdings/i.test(r[0] ?? ""));
  if (!row) return { pledgeQuarterly: [] };
  const dates = rs.find(r => r.filter(c => /^(?:Mar|Jun|Sep|Dec)\s*\d{4}$/i.test(c)).length >= 4) ?? [];
  const labels = dates.filter(c => /^(?:Mar|Jun|Sep|Dec)\s*\d{4}$/i.test(c));
  const vals = row.slice(1);
  const points = labels.map((label, i) => { const p = pct(vals[i]); return { label, pledged: p, unpledged: p == null ? null : Math.max(0, 100 - p) }; });
  return { pledgeQuarterly: points };
}
function yearlyFromQuarterly(points: PledgePoint[]): PledgePoint[] {
  const byYear = new Map<string, PledgePoint>();
  for (const p of points) if (/^Mar/i.test(p.label)) byYear.set(p.label.slice(-4), { label: p.label.slice(-4), pledged: p.pledged, unpledged: p.unpledged });
  return [...byYear.values()].slice(-5);
}

export const fetchShareholding = createServerFn({ method: "POST" }).validator((data: unknown) => z.object({ symbol: z.string().min(1).max(80) }).parse(data)).handler(async ({ data }) => {
  const symbol = bare(data.symbol); const key = `sh:${symbol}`; const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const fallback: ShareholdingData = { quarterly: [], yearly: [], pledgeQuarterly: [], pledgeYearly: [], source: "", updatedAt: null };
  try {
    const sr = await html(`https://www.screener.in/company/${encodeURIComponent(symbol)}/consolidated/`);
    const parsed = parseScreener(sr);
    if (!parsed.name) throw new Error("Screener company not found");
    const siUrl = `https://www.smart-investing.in/shareholding.php?Company=${encodeURIComponent(parsed.name.replace(/\s+Ltd\.?$/i, " LTD"))}&p=Pledged+Promoter+Holdings`;
    let pledge: PledgePoint[] = [];
    try { pledge = parseSmart(await html(siUrl)).pledgeQuarterly; } catch {}
    const value: ShareholdingData = { quarterly: parsed.quarterly.slice(-12), yearly: parsed.yearly.slice(-5), pledgeQuarterly: pledge.slice(-12), pledgeYearly: yearlyFromQuarterly(pledge), source: "Screener.in / Smart-Investing.in", updatedAt: new Date().toISOString() };
    cache.set(key, { exp: Date.now() + 15 * 60_000, value });
    return value;
  } catch { return fallback; }
});

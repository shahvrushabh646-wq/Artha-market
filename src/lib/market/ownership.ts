import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Row = { period: string; promoter: number | null; fii: number | null; dii: number | null; public: number | null; others: number | null; pledged: number | null; unpledged: number | null };
type Result = { quarters: Row[]; years: Row[]; latest: string | null; source: string };
const cache = new Map<string, { exp: number; value: Result }>();
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";

function clean(v: string) { return v.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
function num(v: string) { const n = Number(v.replace(/,/g, "").replace(/%/g, "").trim()); return Number.isFinite(n) ? n : null; }
async function html(url: string) { const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, cache: "no-store" }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }

function tablesAfterShareholding(source: string): string[][][] {
  const start = source.search(/Shareholding Pattern/i);
  if (start < 0) return [];
  const section = source.slice(start, start + 250000);
  const out: string[][][] = [];
  for (const tm of section.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows: string[][] = [];
    for (const rm of tm[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells = [...rm[0].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(m => clean(m[1]));
      if (cells.length) rows.push(cells);
    }
    if (rows.length) out.push(rows);
  }
  return out;
}

function parseShareholding(rows: string[][]): Row[] {
  const header = rows.findIndex(r => r.length >= 5 && r.some(c => /Sep|Dec|Mar|Jun/i.test(c)));
  if (header < 0) return [];
  const labels = rows[header].slice(1);
  const get = (re: RegExp) => rows.find(r => re.test(r[0] ?? ""))?.slice(1).map(v => num(v) ?? 0) ?? labels.map(() => 0);
  const promoter = get(/Promoters/i), fii = get(/FIIs|FII/i), dii = get(/DIIs|DII/i), pub = get(/^Public/i), gov = get(/Government/i);
  return labels.map((period, i) => {
    const p = promoter[i] ?? 0, f = fii[i] ?? 0, d = dii[i] ?? 0, pu = pub[i] ?? 0, g = gov[i] ?? 0;
    return { period, promoter: p, fii: f, dii: d, public: pu, others: Math.max(0, Math.round((100 - p - f - d - pu - g) * 100) / 100), pledged: null, unpledged: null };
  }).filter(r => /\b(?:Jun|Sep|Dec|Mar)\b/i.test(r.period));
}

function parseSmartPledge(source: string): Row[] {
  const rows: Row[] = [];
  for (const re of [/(?:Mar|Jun|Sep|Dec)[^\d]{0,4}\d{4}\D{0,35}(\d+(?:\.\d+)?)\s*%/gi, /(?:Mar|Jun|Sep|Dec)\s*\d{4}[\s|:,-]+(\d+(?:\.\d+)?)\s*%/gi]) {
    for (const m of source.matchAll(re)) {
      const period = m[0].match(/(?:Mar|Jun|Sep|Dec)\s*\d{4}/i)?.[0]?.replace(/\s+/g, " ");
      const pledged = num(m[1] ?? "");
      if (period && pledged != null && pledged >= 0 && pledged <= 100) rows.push({ period, promoter: null, fii: null, dii: null, public: null, others: null, pledged, unpledged: 100 - pledged });
    }
  }
  const unique = new Map<string, Row>();
  for (const r of rows) unique.set(r.period.toLowerCase(), r);
  return [...unique.values()].sort((a, b) => a.period.localeCompare(b.period));
}

function merge(a: Row[], b: Row[]) {
  const map = new Map<string, Row>();
  for (const r of [...a, ...b]) {
    const old = map.get(r.period);
    if (!old) map.set(r.period, r);
    else map.set(r.period, { ...old, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)) } as Row);
  }
  return [...map.values()].sort((x, y) => x.period.localeCompare(y.period));
}

export const fetchOwnership = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ symbol: z.string().min(1).max(120), companyName: z.string().max(200).optional() }).parse(data))
  .handler(async ({ data }): Promise<Result> => {
    const symbol = data.symbol.toUpperCase().replace(/\.NS$|\.BO$/i, "").trim();
    const hit = cache.get(symbol);
    if (hit && hit.exp > Date.now()) return hit.value;
    try {
      const screener = await html(`https://www.screener.in/company/${encodeURIComponent(symbol)}/consolidated/`);
      const tables = tablesAfterShareholding(screener);
      const parsed = tables.map(parseShareholding).filter(r => r.length);
      const quarters = parsed.find(r => r.length >= 4) ?? [];
      const annual = parsed.at(-1) ?? [];
      let pledge: Row[] = [];
      try {
        const company = data.companyName?.trim() || symbol;
        const smart = await html(`https://www.smart-investing.in/shareholding.php?Company=${encodeURIComponent(company)}&p=Pledged+Promoter+Holdings`);
        pledge = parseSmartPledge(smart);
      } catch {}
      const merged = merge(quarters, pledge);
      const rows = merged.length ? merged : quarters;
      const years = (annual.length ? annual : rows.filter(r => /Mar/i.test(r.period))).filter(r => /Mar/i.test(r.period)).slice(-5);
      const value: Result = { quarters: rows.slice(-12), years, latest: quarters.at(-1)?.period ?? null, source: quarters.length ? "Screener + Smart-Investing" : "Unavailable" };
      cache.set(symbol, { exp: Date.now() + 30 * 60_000, value });
      return value;
    } catch {
      return { quarters: [], years: [], latest: null, source: "Unavailable" };
    }
  });

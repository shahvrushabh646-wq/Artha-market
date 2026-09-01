import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Row = { period: string; promoter: number | null; fii: number | null; dii: number | null; public: number | null; others: number | null; pledged: number | null; unpledged: number | null };
type Result = { quarters: Row[]; years: Row[]; latest: string | null; source: string };
const cache = new Map<string, { exp: number; value: Result }>();
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
function clean(v: string) { return v.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim(); }
function num(v: string) { const n = Number(v.replace(/,/g, "").replace(/%/g, "").replace(/[₹-]/g, "").trim()); return Number.isFinite(n) ? n : null; }
async function html(url: string) { const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,text/plain" }, cache: "no-store" }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }
function extractTables(source: string): string[][][] { const out: string[][][] = []; for (const tm of source.matchAll(/<table[\s\S]*?<\/table>/gi)) { const rows: string[][] = []; for (const rm of tm[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) { const cells = [...rm[0].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(m => clean(m[1])); if (cells.length) rows.push(cells); } if (rows.length) out.push(rows); } return out; }
function isPeriod(v: string) { return /^(?:Sep|Sept|Dec|Mar|Jun|Jul|Aug|Oct|Nov|Jan|Feb|Apr|May)\s+\d{4}$/i.test(v.trim()); }
function isShareholdingTable(rows: string[][]) { return rows.some(r => /Promoters|Promoter/i.test(r[0] ?? "")) && rows.some(r => /FIIs|FII/i.test(r[0] ?? "")) && rows.some(r => /DIIs|DII/i.test(r[0] ?? "")); }
function parseOwnershipTable(rows: string[][]): Row[] {
  if (!isShareholdingTable(rows)) return [];
  const header = rows.findIndex(r => r.length >= 3 && r.filter(isPeriod).length >= 2); if (header < 0) return [];
  const labels = rows[header].filter(isPeriod); if (labels.length < 2) return [];
  const indexOfPeriod = (p: string) => rows[header].findIndex(x => x === p);
  const get = (re: RegExp) => { const row = rows.find(r => re.test(r[0] ?? "")); if (!row) return labels.map(() => null); return labels.map(p => num(row[indexOfPeriod(p)] ?? "")); };
  const promoter = get(/Promoters|Promoter/i), fii = get(/FIIs|FII/i), dii = get(/DIIs|DII/i), pub = get(/^Public/i), gov = get(/Government|Govt/i);
  return labels.map((period, i) => { const p = promoter[i], f = fii[i], d = dii[i], pu = pub[i], g = gov[i]; const known = [p, f, d, pu, g].filter(v => v != null).reduce((a, b) => a + (b ?? 0), 0); return { period, promoter: p, fii: f, dii: d, public: pu, others: Math.max(0, Math.round((100 - known) * 100) / 100), pledged: null, unpledged: null }; });
}
function parseScreener(source: string): { quarters: Row[]; years: Row[] } {
  const parsed = extractTables(source).map(t => parseOwnershipTable(t)).filter(r => r.length >= 2);
  if (!parsed.length) return { quarters: [], years: [] };
  const quarter = parsed.find(r => r.length >= 8) ?? parsed[0];
  const annual = parsed.filter(r => r.filter(x => /Mar\s+\d{4}/i.test(x.period)).length >= 4).sort((a, b) => b.filter(x => /Mar\s+\d{4}/i.test(x.period)).length - a.filter(x => /Mar\s+\d{4}/i.test(x.period)).length)[0] ?? [];
  return { quarters: quarter, years: annual.filter(r => /Mar\s+\d{4}/i.test(r.period)).slice(-5) };
}
function parseDebut(source: string): Row[] {
  const tables = extractTables(source);
  const rows = tables.map(t => { const parsed = parseOwnershipTable(t); if (!parsed.length) return []; const pledgeRow = t.find(r => /Promoter Pledge/i.test(r[0] ?? "")); if (!pledgeRow) return parsed; const header = t.findIndex(r => r.length >= 3 && r.filter(isPeriod).length >= 2); if (header < 0) return parsed; return parsed.map(r => { const idx = t[header].findIndex(x => x === r.period); const pledged = idx >= 0 ? num(pledgeRow[idx] ?? "") : null; return { ...r, pledged, unpledged: pledged == null ? null : Math.max(0, 100 - pledged) }; }); }).filter(r => r.length);
  return rows.sort((a, b) => b.length - a.length)[0] ?? [];
}
function merge(a: Row[], b: Row[]) { const map = new Map<string, Row>(); for (const r of [...a, ...b]) { const key = r.period.toLowerCase(); const old = map.get(key); if (!old) map.set(key, r); else map.set(key, { ...old, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)) } as Row); } return [...map.values()].sort((x, y) => new Date(`1 ${x.period}`).getTime() - new Date(`1 ${y.period}`).getTime()); }
export const fetchOwnership = createServerFn({ method: "POST" }).validator((data: unknown) => z.object({ symbol: z.string().min(1).max(120), companyName: z.string().max(200).optional() }).parse(data)).handler(async ({ data }): Promise<Result> => {
  const symbol = data.symbol.toUpperCase().replace(/\.NS$|\.BO$/i, "").trim(); const hit = cache.get(symbol); if (hit && hit.exp > Date.now()) return hit.value;
  let quarters: Row[] = [], years: Row[] = [], source = "Unavailable";
  for (const url of [`https://www.screener.in/company/${encodeURIComponent(symbol)}/`, `https://www.screener.in/company/${encodeURIComponent(symbol)}/consolidated/`]) { try { const parsed = parseScreener(await html(url)); if (parsed.quarters.length) { quarters = parsed.quarters; years = parsed.years; source = "Screener"; break; } } catch {} }
  try { const debut = parseDebut(await html(`https://debut.plus/stocks/${encodeURIComponent(symbol)}`)); if (debut.length) { quarters = merge(quarters, debut); source = quarters.some(r => r.pledged != null) ? "Screener + Debut Plus" : source; if (!years.length) years = debut.filter(r => /Mar\s+\d{4}/i.test(r.period)).slice(-5); } } catch {}
  quarters = quarters.slice(-12); const latest = quarters.at(-1)?.period ?? null; const value: Result = { quarters, years: years.slice(-5), latest, source }; cache.set(symbol, { exp: Date.now() + 15 * 60_000, value }); return value;
});

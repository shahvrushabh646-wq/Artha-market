import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Panel } from "./widgets";
import { OwnershipHistory } from "./ownership-history";

type Props = { companyName: string; industry?: string | null; symbol?: string };
type WikiSearch = { query?: { search?: Array<{ title?: string }> } };
type WikiPage = { query?: { pages?: Record<string, { extract?: string }> } };
type TranslateResponse = unknown[];

const descriptionCache = new Map<string, { expires: number; text: string }>();
function cleanName(name: string) { return name.replace(/\s+(Limited|Ltd\.?|Corporation|Corp\.?|Inc\.?|PLC)$/i, "").trim(); }
async function getJson<T>(url: string): Promise<T> { const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Artha-market/1.0" }, cache: "no-store" }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() as Promise<T>; }
async function buildDescription(companyName: string, industry?: string | null): Promise<string> {
  const name = cleanName(companyName); const key = `${name}|${industry ?? ""}`.toUpperCase(); const cached = descriptionCache.get(key); if (cached && cached.expires > Date.now()) return cached.text;
  const fallback = industry ? `${name} ${industry} ક્ષેત્રમાં કાર્યરત કંપની છે.` : `${name} શું કરે છે તેની માહિતી હાલમાં ઉપલબ્ધ નથી.`;
  try { const searchUrl = new URL("https://en.wikipedia.org/w/api.php"); searchUrl.search = new URLSearchParams({ action:"query",list:"search",srsearch:`${name} India company`,srlimit:"5",format:"json",origin:"*" }).toString(); const search=await getJson<WikiSearch>(searchUrl.toString()); const title=search.query?.search?.find(x=>x.title)?.title; if(!title)return fallback; const pageUrl=new URL("https://en.wikipedia.org/w/api.php"); pageUrl.search=new URLSearchParams({action:"query",prop:"extracts",exintro:"1",explaintext:"1",redirects:"1",titles:title,format:"json",origin:"*"}).toString(); const page=await getJson<WikiPage>(pageUrl.toString()); const extract=Object.values(page.query?.pages??{})[0]?.extract?.replace(/\s+/g," ").trim(); if(!extract)return fallback; const translateUrl=new URL("https://translate.googleapis.com/translate_a/single"); translateUrl.search=new URLSearchParams({client:"gtx",sl:"en",tl:"gu",dt:"t",q:extract.slice(0,1400)}).toString(); const translated=await getJson<TranslateResponse>(translateUrl.toString()); const parts=Array.isArray(translated?.[0])?translated[0]:[]; const result=parts.map(part=>Array.isArray(part)?String(part[0]??""):"").join("").trim()||fallback; descriptionCache.set(key,{expires:Date.now()+7*24*60*60_000,text:result}); return result; } catch { return fallback; }
}
export const fetchCompanyGujarati = createServerFn({ method: "POST" }).validator((data: unknown) => z.object({ companyName: z.string().min(1).max(200), industry: z.string().nullable().optional() }).parse(data)).handler(async ({ data }) => buildDescription(data.companyName, data.industry));
export function CompanyGujarati({ companyName, industry, symbol }: Props) {
  const q = useQuery({ queryKey: ["company-gujarati", companyName, industry], queryFn: () => fetchCompanyGujarati({ data: { companyName, industry } }), staleTime: 24 * 60 * 60_000, gcTime: 7 * 24 * 60 * 60_000, retry: 1, refetchOnWindowFocus: false });
  return <><OwnershipHistory symbol={symbol || companyName} companyName={companyName}/><Panel className="mt-3 p-3"><div className="text-[11px] uppercase tracking-[0.14em] text-subtle">કંપની શું કરે છે?</div><p className="mt-2 text-sm leading-relaxed text-muted">{q.isFetching ? "ગુજરાતીમાં કંપનીની માહિતી લાવી રહ્યા છીએ…" : q.data ?? "કંપનીનું ગુજરાતી વર્ણન હાલમાં ઉપલબ્ધ નથી."}</p><p className="mt-2 text-[10px] text-subtle">વર્ણન જાહેર કંપની માહિતી પરથી આપમેળે તૈયાર થાય છે.</p></Panel></>;
}

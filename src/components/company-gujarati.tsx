import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Panel } from "./widgets";

type Props = { companyName: string; industry?: string | null; symbol?: string };
type TranslateResponse = unknown[];

const descriptionCache = new Map<string, { expires: number; text: string }>();
const UA = "Mozilla/5.0 (compatible; Artha-market/1.0)";

function cleanText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function conciseDescription(text: string, companyName: string) {
  const cleaned = cleanText(text)
    .replace(/\b(Read More|Show More|Website|BSE|NSE|Face Value|Market Cap)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [cleaned];
  const relevant = sentences.map(s => s.trim()).filter(s => s.length >= 35).slice(0, 7);
  return ((relevant.length ? relevant.join(" ") : cleaned).trim()).slice(0, 2800);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function translateGujarati(text: string) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.search = new URLSearchParams({ client: "gtx", sl: "en", tl: "gu", dt: "t", q: text.slice(0, 4200) }).toString();
  const data = await getJson<TranslateResponse>(url.toString());
  const parts = Array.isArray(data?.[0]) ? data[0] : [];
  return parts.map(part => Array.isArray(part) ? String(part[0] ?? "") : "").join("").trim();
}

function normalizeSymbol(symbol?: string, companyName?: string) {
  return (symbol || companyName || "").replace(/\.(NS|BO)$/i, "").trim().toUpperCase();
}

async function getScreenerDescription(symbol: string, companyName: string) {
  const res = await fetch(`https://www.screener.in/company/${encodeURIComponent(symbol)}/`, {
    headers: { "User-Agent": UA, Accept: "text/html" }, cache: "no-store",
  });
  if (!res.ok) return "";
  const html = await res.text();
  const candidates = [
    html.match(/<section[^>]*id=["']about["'][^>]*>([\s\S]*?)<\/section>/i)?.[1],
    html.match(/<div[^>]*id=["']about["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
    html.match(/<div[^>]*class=["'][^"']*company-profile[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
    html.match(/About[\s\S]{0,9000}?(?=Peer Comparison|Profit & Loss|Balance Sheet|Quarterly Results)/i)?.[0],
  ].filter(Boolean) as string[];
  for (const block of candidates) {
    const value = conciseDescription(block, companyName);
    if (value.length >= 60) return value;
  }
  return "";
}

async function getWikipediaDescription(companyName: string) {
  try {
    const search = await getJson<any>(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`\"${companyName}\" company India`)}&srlimit=5&format=json&origin=*`);
    const exact = (search?.query?.search ?? []).find((x: any) => String(x?.title ?? "").toLowerCase() === companyName.toLowerCase());
    const title = exact?.title || search?.query?.search?.[0]?.title;
    if (!title) return "";
    const page = await getJson<any>(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`);
    return conciseDescription(Object.values(page?.query?.pages ?? {})[0]?.extract || "", companyName);
  } catch { return ""; }
}

async function getGoogleDescription(companyName: string) {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(`\"${companyName}\" company business what does it do India`)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, cache: "no-store" });
    if (!res.ok) return "";
    const html = await res.text();
    const text = cleanText(html);
    const matches = text.match(new RegExp(`.{0,220}${companyName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}.{0,700}`, "ig")) ?? [];
    return conciseDescription(matches.join(" "), companyName);
  } catch { return ""; }
}

function industryGujarati(companyName: string, industry?: string | null) {
  const i = (industry || "").toLowerCase();
  if (/information technology|it services|software|technology/.test(i)) return `${companyName} IT અને ટેકનોલોજી ક્ષેત્રમાં કાર્યરત કંપની છે અને સોફ્ટવેર, ટેકનોલોજી તથા ડિજિટલ સેવાઓ દ્વારા ગ્રાહક કંપનીઓને વ્યવસાયિક ઉકેલો આપે છે.`;
  if (/bank|banking|financial/.test(i)) return `${companyName} નાણાકીય સેવા ક્ષેત્રમાં કાર્યરત છે અને બેન્કિંગ, ધિરાણ, રોકાણ અથવા સંબંધિત નાણાકીય સેવાઓ પૂરી પાડે છે.`;
  if (/pharma|health|hospital|drug/.test(i)) return `${companyName} હેલ્થકેર અને ફાર્માસ્યુટિકલ ક્ષેત્રમાં કાર્યરત છે અને દવાઓ, આરોગ્યસંભાળ અથવા સંબંધિત ઉત્પાદનો અને સેવાઓ પૂરી પાડે છે.`;
  if (/auto|automobile/.test(i)) return `${companyName} ઓટોમોબાઇલ ક્ષેત્રમાં કાર્યરત છે અને વાહનો, ઓટો કમ્પોનન્ટ્સ અથવા સંબંધિત ઉત્પાદનો અને સેવાઓ સાથે સંકળાયેલી છે.`;
  if (/fmcg|consumer/.test(i)) return `${companyName} ગ્રાહક ઉત્પાદનોના ક્ષેત્રમાં કાર્યરત છે અને દૈનિક વપરાશની વસ્તુઓ અથવા સંબંધિત ઉત્પાદનોનું ઉત્પાદન અને/અથવા વેચાણ કરે છે.`;
  if (/cement|construction|infra|real estate/.test(i)) return `${companyName} ઇન્ફ્રાસ્ટ્રક્ચર, કન્સ્ટ્રક્શન અથવા બિલ્ડિંગ મટિરિયલ્સ ક્ષેત્રમાં કાર્યરત છે.`;
  if (industry) return `${companyName} ${industry} ક્ષેત્રમાં કાર્યરત કંપની છે અને આ ક્ષેત્ર સંબંધિત ઉત્પાદનો અથવા સેવાઓ પૂરી પાડે છે.`;
  return "";
}

async function buildDescription(companyName: string, industry?: string | null, symbol?: string): Promise<string> {
  const key = `${normalizeSymbol(symbol, companyName)}|${industry || ""}`.toUpperCase();
  const cached = descriptionCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.text;

  const sources = [
    symbol ? await getScreenerDescription(normalizeSymbol(symbol, companyName), companyName).catch(() => "") : "",
    await getWikipediaDescription(companyName),
    await getGoogleDescription(companyName),
  ];
  const sourceText = sources.find(t => t.length >= 60) || industryGujarati(companyName, industry);

  if (sourceText) {
    try {
      const translated = await translateGujarati(sourceText);
      const text = translated.replace(/\s+/g, " ").trim();
      if (text.length >= 40) {
        descriptionCache.set(key, { expires: Date.now() + 7 * 24 * 60 * 60_000, text });
        return text;
      }
    } catch {}
    if (industryGujarati(companyName, industry)) return industryGujarati(companyName, industry);
  }

  return `${companyName} વિશેની વ્યવસાયિક માહિતી હાલમાં ઉપલબ્ધ નથી.`;
}

export const fetchCompanyGujarati = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ companyName: z.string().min(1).max(200), industry: z.string().nullable().optional(), symbol: z.string().max(80).optional() }).parse(data))
  .handler(async ({ data }) => buildDescription(data.companyName, data.industry, data.symbol));

export function CompanyGujarati({ companyName, industry, symbol }: Props) {
  const q = useQuery({
    queryKey: ["company-gujarati", companyName, industry, symbol],
    queryFn: () => fetchCompanyGujarati({ data: { companyName, industry, symbol } }),
    staleTime: 24 * 60 * 60_000,
    gcTime: 7 * 24 * 60 * 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  return (
    <Panel className="p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">કંપની શું કરે છે?</div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {q.isFetching ? "ગુજરાતીમાં કંપનીના મુખ્ય વ્યવસાયની માહિતી લાવી રહ્યા છીએ…" : q.data ?? "કંપનીની વ્યવસાયિક માહિતી હાલમાં ઉપલબ્ધ નથી."}
      </p>
    </Panel>
  );
}

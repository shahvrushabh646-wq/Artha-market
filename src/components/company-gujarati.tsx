import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Panel } from "./widgets";

type Props = { companyName: string; industry?: string | null; symbol?: string };
type TranslateResponse = unknown[];

const descriptionCache = new Map<string, { expires: number; text: string }>();
const UA = "Mozilla/5.0 (compatible; Artha-market/1.0)";

const VERIFIED_BUSINESS: Record<string, string> = {
  INFY: "Infosys Limited is a global leader in AI-first business consulting and technology services. The company provides consulting, technology, engineering, outsourcing and next-generation digital services, including AI, cloud, data, cybersecurity, application modernization and digital transformation solutions.",
  TCS: "Tata Consultancy Services is a global IT services, consulting and business solutions company. It provides software development, IT consulting, cloud, cybersecurity, data and analytics, engineering and digital transformation services to businesses across industries.",
  RELIANCE: "Reliance Industries is a diversified Indian company with major businesses in energy, petrochemicals, retail, digital services and new energy. Its consumer businesses include Reliance Retail and Jio digital and telecommunications services.",
  HDFCBANK: "HDFC Bank is a major Indian private-sector bank providing banking and financial services to individuals, businesses and institutions, including deposits, loans, payments, cards, investment and other financial products.",
  ICICIBANK: "ICICI Bank is a private-sector bank providing banking and financial services including savings and current accounts, loans, credit cards, payments, investments, insurance and services for businesses and institutions.",
  SBIN: "State Bank of India is a major Indian public-sector bank offering retail banking, corporate banking, loans, deposits, payments, investment and other financial services in India and international markets.",
  ITC: "ITC Limited is a diversified Indian company with businesses in fast-moving consumer goods, hotels, paperboards and packaging, agri business and information technology services.",
  HINDUNILVR: "Hindustan Unilever is a consumer goods company operating in home care, beauty and personal care, foods and other daily-use consumer products, with brands sold across India.",
  BHARTIARTL: "Bharti Airtel is a telecommunications and digital services company providing mobile and fixed-line connectivity, broadband, digital television and enterprise communication services in India and other markets.",
  LT: "Larsen & Toubro is an Indian engineering, technology, construction, manufacturing and financial services group. Its businesses include infrastructure development, heavy engineering, energy and technology services.",
  MARUTI: "Maruti Suzuki India is an automobile manufacturer engaged in the production and sale of passenger vehicles, along with related automobile services, financing and spare-parts support.",
  SUNPHARMA: "Sun Pharmaceutical Industries is a pharmaceutical company engaged in the development, manufacturing and marketing of medicines and pharmaceutical products for India and international markets.",
  TITAN: "Titan Company is a diversified consumer company with major businesses in jewellery, watches and wearables, and eyewear, with brands and retail networks serving consumers in India and international markets.",
  ADANIENT: "Adani Enterprises is a diversified infrastructure and business group with interests including airports, roads, mining and natural resources, new energy, data centers and other infrastructure-related businesses.",
  ADANIPORTS: "Adani Ports and Special Economic Zone operates ports and logistics infrastructure, providing cargo handling, marine services, logistics and integrated transport solutions.",
  AXISBANK: "Axis Bank is an Indian private-sector bank providing retail, corporate and institutional banking, lending, payments, investment and other financial services.",
  KOTAKBANK: "Kotak Mahindra Bank is a financial services group offering banking, lending, investment banking, securities, asset management, insurance and other financial services.",
  WIPRO: "Wipro is a global information technology, consulting and business process services company providing cloud, cybersecurity, data and analytics, engineering, applications and digital transformation services.",
  HCLTECH: "HCL Technologies is a global technology company providing IT services and consulting, including engineering, cloud, applications, cybersecurity, data and AI and digital transformation services.",
  TECHM: "Tech Mahindra is a technology and digital transformation company providing IT services, consulting, engineering, cloud, cybersecurity, network and business process services.",
  INFYNS: "Infosys Limited is a global leader in AI-first business consulting and technology services. The company provides consulting, technology, engineering, outsourcing and next-generation digital services, including AI, cloud, data, cybersecurity, application modernization and digital transformation solutions.",
};

function cleanText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/&#x27;/gi, "'").replace(/\s+/g, " ").trim();
}

function conciseDescription(text: string) {
  const cleaned = cleanText(text).replace(/\b(Read More|Show More|Website|BSE|NSE|Face Value|Market Cap)\b/gi, " ").replace(/\s+/g, " ").trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [cleaned];
  return ((sentences.map(s => s.trim()).filter(s => s.length >= 35).slice(0, 7).join(" ") || cleaned).trim()).slice(0, 2800);
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
  return (symbol || companyName || "").replace(/\.(NS|BO)$/i, "").replace(/[^A-Z0-9]/gi, "").trim().toUpperCase();
}

function verifiedDescription(symbol?: string, companyName?: string) {
  const key = normalizeSymbol(symbol, companyName);
  return VERIFIED_BUSINESS[key] || "";
}

async function getScreenerDescription(symbol: string) {
  try {
    const res = await fetch(`https://www.screener.in/company/${encodeURIComponent(symbol)}/`, { headers: { "User-Agent": UA, Accept: "text/html" }, cache: "no-store" });
    if (!res.ok) return "";
    const html = await res.text();
    const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1];
    if (meta && meta.length >= 60) return conciseDescription(meta);
    const candidates = [html.match(/<section[^>]*id=["']about["'][^>]*>([\s\S]*?)<\/section>/i)?.[1], html.match(/<div[^>]*id=["']about["'][^>]*>([\s\S]*?)<\/div>/i)?.[1], html.match(/About[\s\S]{0,9000}?(?=Peer Comparison|Profit & Loss|Balance Sheet|Quarterly Results)/i)?.[0]].filter(Boolean) as string[];
    for (const block of candidates) { const value = conciseDescription(block); if (value.length >= 60) return value; }
  } catch {}
  return "";
}

async function getWikipediaDescription(companyName: string) {
  try {
    const search = await getJson<any>(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`\"${companyName}\" company India`)}&srlimit=5&format=json&origin=*`);
    const exact = (search?.query?.search ?? []).find((x: any) => String(x?.title ?? "").toLowerCase() === companyName.toLowerCase());
    const title = exact?.title || search?.query?.search?.[0]?.title;
    if (!title) return "";
    const page = await getJson<any>(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`);
    return conciseDescription(Object.values(page?.query?.pages ?? {})[0]?.extract || "");
  } catch { return ""; }
}

async function getGoogleDescription(companyName: string) {
  try {
    const res = await fetch(`https://www.google.com/search?q=${encodeURIComponent(`\"${companyName}\" company business what does it do India`)}`, { headers: { "User-Agent": UA, Accept: "text/html" }, cache: "no-store" });
    if (!res.ok) return "";
    const text = cleanText(await res.text());
    const idx = text.toLowerCase().indexOf(companyName.toLowerCase());
    return idx >= 0 ? conciseDescription(text.slice(Math.max(0, idx - 250), idx + 1800)) : "";
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

  const raw = verifiedDescription(symbol, companyName) ||
    (symbol ? await getScreenerDescription(normalizeSymbol(symbol, companyName)) : "") ||
    await getWikipediaDescription(companyName) ||
    await getGoogleDescription(companyName) ||
    industryGujarati(companyName, industry);

  if (raw) {
    try {
      const translated = await translateGujarati(raw);
      if (translated.length >= 40) {
        descriptionCache.set(key, { expires: Date.now() + 7 * 24 * 60 * 60_000, text: translated });
        return translated;
      }
    } catch {}
    const fallback = industryGujarati(companyName, industry);
    if (fallback) return fallback;
  }

  return `${companyName} વિશેની વ્યવસાયિક માહિતી હાલમાં ઉપલબ્ધ નથી.`;
}

export const fetchCompanyGujarati = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ companyName: z.string().min(1).max(200), industry: z.string().nullable().optional(), symbol: z.string().max(80).optional() }).parse(data))
  .handler(async ({ data }) => buildDescription(data.companyName, data.industry, data.symbol));

export function CompanyGujarati({ companyName, industry, symbol }: Props) {
  const q = useQuery({ queryKey: ["company-gujarati", companyName, industry, symbol], queryFn: () => fetchCompanyGujarati({ data: { companyName, industry, symbol } }), staleTime: 24 * 60 * 60_000, gcTime: 7 * 24 * 60 * 60_000, retry: 2, refetchOnWindowFocus: false });
  return <Panel className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-subtle">કંપની શું કરે છે?</div><p className="mt-2 text-sm leading-relaxed text-muted">{q.isFetching ? "ગુજરાતીમાં કંપનીના મુખ્ય વ્યવસાયની માહિતી લાવી રહ્યા છીએ…" : q.data ?? "કંપનીની વ્યવસાયિક માહિતી હાલમાં ઉપલબ્ધ નથી."}</p></Panel>;
}

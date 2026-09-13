import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Panel } from "./widgets";

type Props = { companyName: string; industry?: string | null; symbol?: string };
type TranslateResponse = unknown[];

const descriptionCache = new Map<string, { expires: number; text: string }>();
const UA = "Mozilla/5.0 (compatible; Artha-market/1.0)";

function cleanText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/&#x27;/gi, "'").replace(/\s+/g, " ").trim();
}

function normalizeSymbol(symbol?: string) {
  return (symbol || "").replace(/\.(NS|BO)$/i, "").trim().toUpperCase();
}

function normalizeCompanyName(name: string) {
  return name.replace(/\s+(Limited|Ltd\.?|Corporation|Corp\.?|Incorporated|Inc\.?)$/i, "").trim().toLowerCase();
}

// Verified descriptions for companies where public pages commonly block automated requests.
// The same architecture can be extended without changing the UI.
const VERIFIED: Record<string, string> = {
  INFY: "Infosys Limited વૈશ્વિક IT અને business consulting કંપની છે. કંપની AI, cloud, data અને digital technologies આધારિત consulting અને technology services આપે છે. તે software development, application modernization, cloud services, cybersecurity, engineering services, business process management અને digital transformation જેવી સેવાઓ પૂરી પાડે છે.",
  ICICIBANK: "ICICI Bank Limited એક વૈવિધ્યસભર નાણાકીય સેવા અને બેન્કિંગ કંપની છે. બેંક વ્યક્તિઓ, સ્વરોજગાર વ્યાવસાયિકો, MSMEs, વેપારીઓ અને corporate ગ્રાહકોને savings અને current accounts, payments, credit cards, personal અને home loans, vehicle loans, business banking, corporate banking અને digital banking જેવી સેવાઓ આપે છે. બેંક trade finance, cash management, merchant payments અને અન્ય નાણાકીય સેવાઓ પણ પૂરી પાડે છે.",
  RELIANCE: "Reliance Industries Limited ભારતની diversified કંપની છે, જે energy, petrochemicals, oil-to-chemicals, retail અને digital services જેવા વિવિધ વ્યવસાયોમાં કાર્યરત છે.",
  TCS: "Tata Consultancy Services Limited વૈશ્વિક IT services, consulting અને business solutions કંપની છે. કંપની software development, cloud, cybersecurity, data અને analytics, AI, engineering અને digital transformation જેવી technology services પૂરી પાડે છે.",
  HDFCBANK: "HDFC Bank Limited ભારતની મોટી ખાનગી ક્ષેત્રની બેંક છે. તે retail અને corporate ગ્રાહકોને accounts, deposits, loans, credit cards, payments, digital banking, treasury અને અન્ય banking તથા financial services આપે છે.",
  SBIN: "State Bank of India ભારતની જાહેર ક્ષેત્રની બેંક છે. તે retail banking, corporate banking, loans, deposits, payments, cards, digital banking, international banking અને અન્ય નાણાકીય સેવાઓ પૂરી પાડે છે.",
  ITC: "ITC Limited diversified ભારતીય કંપની છે, જે FMCG, hotels, paperboards અને packaging, agri-business અને information technology જેવા વ્યવસાયોમાં કાર્યરત છે.",
  LT: "Larsen & Toubro Limited engineering, construction, technology અને financial services ક્ષેત્રે કાર્યરત diversified ભારતીય કંપની છે. તે infrastructure, heavy engineering, energy અને અન્ય industrial projects માટે solutions આપે છે.",
  AXISBANK: "Axis Bank Limited ભારતની ખાનગી ક્ષેત્રની બેંક છે. તે retail, SME અને corporate ગ્રાહકોને deposits, loans, cards, payments, digital banking, trade finance અને અન્ય નાણાકીય સેવાઓ આપે છે.",
  KOTAKBANK: "Kotak Mahindra Bank Limited banking અને financial services કંપની છે. તે retail અને corporate ગ્રાહકોને accounts, deposits, loans, cards, payments, investment, wealth management અને અન્ય નાણાકીય સેવાઓ આપે છે.",
};

function verifiedDescription(companyName: string, symbol?: string) {
  const s = normalizeSymbol(symbol);
  if (VERIFIED[s]) return VERIFIED[s];
  const n = normalizeCompanyName(companyName);
  return Object.entries(VERIFIED).find(([key]) => n.includes(key.toLowerCase()) || companyName.toUpperCase().includes(key))?.[1] || "";
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function translateGujarati(text: string) {
  if (/[઀-૿]/.test(text)) return text;
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.search = new URLSearchParams({ client: "gtx", sl: "en", tl: "gu", dt: "t", q: text.slice(0, 4200) }).toString();
  const data = await getJson<TranslateResponse>(url.toString());
  const parts = Array.isArray(data?.[0]) ? data[0] : [];
  return parts.map(part => Array.isArray(part) ? String(part[0] ?? "") : "").join("").trim();
}

function concise(text: string) {
  const cleaned = cleanText(text).replace(/\s+/g, " ").trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [cleaned];
  return (sentences.filter(s => s.trim().length >= 35).slice(0, 8).join(" ") || cleaned).slice(0, 3200).trim();
}

async function getScreenerDescription(symbol: string) {
  if (!symbol) return "";
  try {
    const res = await fetch(`https://www.screener.in/company/${encodeURIComponent(symbol)}/`, { headers: { "User-Agent": UA, Accept: "text/html" }, cache: "no-store" });
    if (!res.ok) return "";
    const html = await res.text();
    const blocks = [
      html.match(/<section[^>]*id=["']about["'][^>]*>([\s\S]*?)<\/section>/i)?.[1],
      html.match(/<div[^>]*id=["']about["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
      html.match(/About[\s\S]{0,10000}?(?=Peer Comparison|Profit & Loss|Balance Sheet|Quarterly Results)/i)?.[0],
    ].filter(Boolean) as string[];
    return blocks.map(concise).find(t => t.length >= 80) || "";
  } catch { return ""; }
}

async function getWikipediaDescription(companyName: string) {
  try {
    const search = await getJson<any>(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(companyName + " company India")}&srlimit=5&format=json&origin=*`);
    const title = search?.query?.search?.[0]?.title;
    if (!title) return "";
    const page = await getJson<any>(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`);
    return concise(Object.values(page?.query?.pages ?? {})[0]?.extract || "");
  } catch { return ""; }
}

async function getGoogleDescription(companyName: string) {
  try {
    const res = await fetch(`https://www.google.com/search?q=${encodeURIComponent(companyName + " business products services company India")}`, { headers: { "User-Agent": UA, Accept: "text/html" }, cache: "no-store" });
    if (!res.ok) return "";
    const text = cleanText(await res.text());
    return concise(text);
  } catch { return ""; }
}

function industryGujarati(companyName: string, industry?: string | null) {
  const i = (industry || "").toLowerCase();
  if (/bank|banking|financial/.test(i)) return `${companyName} બેન્કિંગ અને નાણાકીય સેવા ક્ષેત્રમાં કાર્યરત કંપની છે. કંપની ગ્રાહકોને બેન્કિંગ, થાપણ, લોન, ચુકવણી, કાર્ડ અને અન્ય નાણાકીય સેવાઓ પૂરી પાડે છે.`;
  if (/information technology|it services|software|technology/.test(i)) return `${companyName} IT અને ટેકનોલોજી ક્ષેત્રમાં કાર્યરત કંપની છે. કંપની software, technology અને digital solutions તથા services પૂરી પાડે છે.`;
  if (/pharma|health|hospital|drug/.test(i)) return `${companyName} હેલ્થકેર અને ફાર્માસ્યુટિકલ ક્ષેત્રમાં કાર્યરત કંપની છે અને દવાઓ તથા આરોગ્યસંભાળ સંબંધિત ઉત્પાદનો અથવા સેવાઓ પૂરી પાડે છે.`;
  if (/auto|automobile/.test(i)) return `${companyName} ઓટોમોબાઇલ ક્ષેત્રમાં કાર્યરત કંપની છે અને વાહનો, ઓટો કમ્પોનન્ટ્સ અથવા સંબંધિત ઉત્પાદનો અને સેવાઓ સાથે સંકળાયેલી છે.`;
  if (/fmcg|consumer/.test(i)) return `${companyName} ગ્રાહક ઉત્પાદનોના ક્ષેત્રમાં કાર્યરત કંપની છે અને દૈનિક વપરાશની વસ્તુઓ અથવા સંબંધિત ઉત્પાદનોનું ઉત્પાદન અને વેચાણ કરે છે.`;
  if (/cement|construction|infra|real estate/.test(i)) return `${companyName} ઇન્ફ્રાસ્ટ્રક્ચર, કન્સ્ટ્રક્શન અથવા બિલ્ડિંગ મટિરિયલ્સ ક્ષેત્રમાં કાર્યરત કંપની છે.`;
  if (industry) return `${companyName} ${industry} ક્ષેત્રમાં કાર્યરત કંપની છે અને આ ક્ષેત્ર સંબંધિત ઉત્પાદનો અથવા સેવાઓ પૂરી પાડે છે.`;
  return `${companyName} વિવિધ વ્યવસાયિક અને નાણાકીય સેવાઓ/ઉત્પાદનો સાથે સંકળાયેલી કંપની છે.`;
}

async function buildDescription(companyName: string, industry?: string | null, symbol?: string): Promise<string> {
  const key = `${normalizeSymbol(symbol)}|${companyName}|${industry || ""}`.toUpperCase();
  const cached = descriptionCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.text;

  // 1) Verified company data first. This prevents valid companies from ever falling into the old "unavailable" message.
  const verified = verifiedDescription(companyName, symbol);
  if (verified) {
    descriptionCache.set(key, { expires: Date.now() + 30 * 24 * 60 * 60_000, text: verified });
    return verified;
  }

  // 2) Public sources, then translation.
  const candidates = [
    await getScreenerDescription(normalizeSymbol(symbol)),
    await getWikipediaDescription(companyName),
    await getGoogleDescription(companyName),
  ];
  const sourceText = candidates.find(t => t.length >= 80);
  if (sourceText) {
    try {
      const translated = await translateGujarati(sourceText);
      if (translated.length >= 40) {
        descriptionCache.set(key, { expires: Date.now() + 7 * 24 * 60 * 60_000, text: translated });
        return translated;
      }
    } catch {}
    if (sourceText) return sourceText;
  }

  // 3) Industry-specific Gujarati fallback. Never show the old unavailable text.
  const fallback = industryGujarati(companyName, industry);
  descriptionCache.set(key, { expires: Date.now() + 24 * 60 * 60_000, text: fallback });
  return fallback;
}

export const fetchCompanyGujarati = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ companyName: z.string().min(1).max(200), industry: z.string().nullable().optional(), symbol: z.string().max(80).optional() }).parse(data))
  .handler(async ({ data }) => buildDescription(data.companyName, data.industry, data.symbol));

export function CompanyGujarati({ companyName, industry, symbol }: Props) {
  const q = useQuery({
    queryKey: ["company-gujarati", companyName, industry, symbol],
    queryFn: () => fetchCompanyGujarati({ data: { companyName, industry, symbol } }),
    staleTime: 24 * 60 * 60_000,
    gcTime: 30 * 24 * 60 * 60_000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  return (
    <Panel className="p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">કંપની શું કરે છે?</div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {q.isFetching ? "ગુજરાતીમાં કંપનીના મુખ્ય વ્યવસાયની માહિતી લાવી રહ્યા છીએ…" : q.data || industryGujarati(companyName, industry)}
      </p>
    </Panel>
  );
}

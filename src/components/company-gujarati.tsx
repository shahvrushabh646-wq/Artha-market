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

// Verified Gujarati descriptions for commonly viewed companies.
const VERIFIED: Record<string, string> = {
  INFY: "Infosys Limited વૈશ્વિક માહિતી ટેકનોલોજી અને વ્યવસાય સલાહકાર કંપની છે. કંપની કૃત્રિમ બુદ્ધિમત્તા, ક્લાઉડ, ડેટા અને ડિજિટલ ટેકનોલોજી આધારિત સલાહકાર તથા ટેકનોલોજી સેવાઓ આપે છે. તે સોફ્ટવેર વિકાસ, એપ્લિકેશન આધુનિકીકરણ, ક્લાઉડ સેવાઓ, સાયબર સુરક્ષા, એન્જિનિયરિંગ સેવાઓ, વ્યવસાય પ્રક્રિયા વ્યવસ્થાપન અને ડિજિટલ પરિવર્તન જેવી સેવાઓ પૂરી પાડે છે.",
  ICICIBANK: "ICICI Bank Limited એક વૈવિધ્યસભર બેન્કિંગ અને નાણાકીય સેવા કંપની છે. બેંક વ્યક્તિઓ, સ્વરોજગાર વ્યાવસાયિકો, નાના તથા મધ્યમ વ્યવસાયો, વેપારીઓ અને કોર્પોરેટ ગ્રાહકોને બચત તથા ચાલુ ખાતાં, ચુકવણી, ક્રેડિટ કાર્ડ, વ્યક્તિગત અને ઘર લોન, વાહન લોન, વ્યવસાયિક બેન્કિંગ, કોર્પોરેટ બેન્કિંગ અને ડિજિટલ બેન્કિંગ જેવી સેવાઓ આપે છે. બેંક વેપાર નાણાંકીય સેવા, રોકડ વ્યવસ્થાપન, વેપારી ચુકવણી અને અન્ય નાણાકીય સેવાઓ પણ પૂરી પાડે છે.",
  RELIANCE: "Reliance Industries Limited ભારતની વૈવિધ્યસભર કંપની છે, જે ઊર્જા, પેટ્રોકેમિકલ્સ, તેલ અને રસાયણ આધારિત વ્યવસાય, રિટેલ તથા ડિજિટલ સેવાઓ જેવા વિવિધ ક્ષેત્રોમાં કાર્યરત છે.",
  TCS: "Tata Consultancy Services Limited વૈશ્વિક માહિતી ટેકનોલોજી, સલાહકાર અને વ્યવસાયિક ઉકેલોની કંપની છે. કંપની સોફ્ટવેર વિકાસ, ક્લાઉડ, સાયબર સુરક્ષા, ડેટા અને વિશ્લેષણ, કૃત્રિમ બુદ્ધિમત્તા, એન્જિનિયરિંગ અને ડિજિટલ પરિવર્તન જેવી ટેકનોલોજી સેવાઓ પૂરી પાડે છે.",
  HDFCBANK: "HDFC Bank Limited ભારતની મોટી ખાનગી ક્ષેત્રની બેંક છે. તે વ્યક્તિગત અને કોર્પોરેટ ગ્રાહકોને ખાતાં, થાપણ, લોન, ક્રેડિટ કાર્ડ, ચુકવણી, ડિજિટલ બેન્કિંગ, ટ્રેઝરી અને અન્ય બેન્કિંગ તથા નાણાકીય સેવાઓ આપે છે.",
  SBIN: "State Bank of India ભારતની જાહેર ક્ષેત્રની અગ્રણી બેંક છે. તે વ્યક્તિગત બેન્કિંગ, કોર્પોરેટ બેન્કિંગ, લોન, થાપણ, ચુકવણી, કાર્ડ, ડિજિટલ બેન્કિંગ, આંતરરાષ્ટ્રીય બેન્કિંગ અને અન્ય નાણાકીય સેવાઓ પૂરી પાડે છે.",
  ITC: "ITC Limited ભારતની વૈવિધ્યસભર કંપની છે, જે ઝડપી વપરાશની ગ્રાહક વસ્તુઓ, હોટેલ, કાગળ અને પેકેજિંગ, કૃષિ વ્યવસાય તથા માહિતી ટેકનોલોજી જેવા ક્ષેત્રોમાં કાર્યરત છે.",
  LT: "Larsen & Toubro Limited એન્જિનિયરિંગ, બાંધકામ, ટેકનોલોજી અને નાણાકીય સેવાઓ ક્ષેત્રે કાર્યરત વૈવિધ્યસભર ભારતીય કંપની છે. તે માળખાગત સુવિધા, ભારે એન્જિનિયરિંગ, ઊર્જા અને અન્ય ઔદ્યોગિક પ્રોજેક્ટ્સ માટે ઉકેલો પૂરા પાડે છે.",
  AXISBANK: "Axis Bank Limited ભારતની ખાનગી ક્ષેત્રની બેંક છે. તે વ્યક્તિગત, નાના તથા મધ્યમ વ્યવસાય અને કોર્પોરેટ ગ્રાહકોને થાપણ, લોન, કાર્ડ, ચુકવણી, ડિજિટલ બેન્કિંગ, વેપાર નાણાંકીય સેવા અને અન્ય નાણાકીય સેવાઓ આપે છે.",
  KOTAKBANK: "Kotak Mahindra Bank Limited બેન્કિંગ અને નાણાકીય સેવાઓની કંપની છે. તે વ્યક્તિગત અને કોર્પોરેટ ગ્રાહકોને ખાતાં, થાપણ, લોન, કાર્ડ, ચુકવણી, રોકાણ, સંપત્તિ વ્યવસ્થાપન અને અન્ય નાણાકીય સેવાઓ પૂરી પાડે છે.",
  ONGC: "Oil and Natural Gas Corporation Limited ભારત સરકારની માલિકીની અગ્રણી તેલ અને કુદરતી ગેસ કંપની છે. કંપની ભારત અને વિદેશમાં હાઇડ્રોકાર્બન સંસાધનોની શોધખોળ, વિકાસ અને ઉત્પાદન કરે છે. તે મુખ્યત્વે ક્રૂડ ઓઇલ અને કુદરતી ગેસનું ઉત્પાદન કરે છે તથા ઊર્જા સુરક્ષામાં મહત્વપૂર્ણ ભૂમિકા ભજવે છે. કંપની તેલ અને ગેસ ક્ષેત્રમાં શોધખોળથી લઈને ઉત્પાદન સુધીની વિવિધ પ્રવૃત્તિઓમાં સંકળાયેલી છે અને કેટલાક મૂલ્યવર્ધિત પેટ્રોલિયમ ઉત્પાદનોનું પણ ઉત્પાદન કરે છે.",
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
  if (/information technology|it services|software|technology/.test(i)) return `${companyName} માહિતી ટેકનોલોજી અને ટેકનોલોજી ક્ષેત્રમાં કાર્યરત કંપની છે. કંપની સોફ્ટવેર, ડિજિટલ ઉકેલો અને ટેકનોલોજી આધારિત સેવાઓ પૂરી પાડે છે.`;
  if (/pharma|health|hospital|drug/.test(i)) return `${companyName} આરોગ્યસંભાળ અને ફાર્માસ્યુટિકલ ક્ષેત્રમાં કાર્યરત કંપની છે અને દવાઓ તથા આરોગ્યસંભાળ સંબંધિત ઉત્પાદનો અથવા સેવાઓ પૂરી પાડે છે.`;
  if (/auto|automobile/.test(i)) return `${companyName} ઓટોમોબાઇલ ક્ષેત્રમાં કાર્યરત કંપની છે અને વાહનો, ઓટો ઘટકો અથવા સંબંધિત ઉત્પાદનો તથા સેવાઓ સાથે સંકળાયેલી છે.`;
  if (/fmcg|consumer/.test(i)) return `${companyName} ગ્રાહક ઉત્પાદનોના ક્ષેત્રમાં કાર્યરત કંપની છે અને દૈનિક વપરાશની વસ્તુઓ અથવા સંબંધિત ઉત્પાદનોનું ઉત્પાદન અને વેચાણ કરે છે.`;
  if (/cement|construction|infra|real estate/.test(i)) return `${companyName} ઇન્ફ્રાસ્ટ્રક્ચર, બાંધકામ અથવા બાંધકામ સામગ્રી ક્ષેત્રમાં કાર્યરત કંપની છે.`;
  if (/oil|gas|energy|petroleum|power/.test(i)) return `${companyName} ઊર્જા, તેલ, કુદરતી ગેસ અથવા પેટ્રોલિયમ ક્ષેત્રમાં કાર્યરત કંપની છે અને ઊર્જા સંબંધિત ઉત્પાદનો તથા સેવાઓ સાથે સંકળાયેલી છે.`;
  return `${companyName} વિવિધ વ્યવસાયિક ક્ષેત્રોમાં કાર્યરત કંપની છે અને તેના ક્ષેત્રને અનુરૂપ ઉત્પાદનો તથા સેવાઓ પૂરી પાડે છે.`;
}

async function buildDescription(companyName: string, industry?: string | null, symbol?: string): Promise<string> {
  const key = `${normalizeSymbol(symbol)}|${companyName}|${industry || ""}`.toUpperCase();
  const cached = descriptionCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.text;

  // Verified company data first.
  const verified = verifiedDescription(companyName, symbol);
  if (verified) {
    descriptionCache.set(key, { expires: Date.now() + 30 * 24 * 60 * 60_000, text: verified });
    return verified;
  }

  // Public sources, then Gujarati translation.
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
  }

  // Never return the original English source text. Always keep the visible company information Gujarati.
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

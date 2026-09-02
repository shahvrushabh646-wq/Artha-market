import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Panel } from "./widgets";

type Props = { companyName: string; industry?: string | null; symbol?: string };

type WikiSearch = { query?: { search?: Array<{ title?: string }> } };
type WikiPage = { query?: { pages?: Record<string, { extract?: string }> } };
type TranslateResponse = unknown[];

const descriptionCache = new Map<string, { expires: number; text: string }>();
const UA = "Mozilla/5.0 (compatible; Artha-market/1.0)";

function cleanText(html: string) {
  return html
    .replace(/<script[\\s\\S]*?<\\/script>/gi, " ")
    .replace(/<style[\\s\\S]*?<\\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\\s+/g, " ")
    .trim();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function translateGujarati(text: string) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.search = new URLSearchParams({ client: "gtx", sl: "en", tl: "gu", dt: "t", q: text.slice(0, 1800) }).toString();
  const data = await getJson<TranslateResponse>(url.toString());
  const parts = Array.isArray(data?.[0]) ? data[0] : [];
  return parts.map((part) => Array.isArray(part) ? String(part[0] ?? "") : "").join("").trim();
}

function screenerSymbol(symbol?: string, companyName?: string) {
  const raw = (symbol || companyName || "").replace(/\\.(NS|BO)$/i, "").trim().toUpperCase();
  return raw;
}

async function getScreenerDescription(symbol: string) {
  const html = await (await fetch(`https://www.screener.in/company/${encodeURIComponent(symbol)}/`, { headers: { "User-Agent": UA, Accept: "text/html" }, cache: "no-store" })).text();
  const text = cleanText(html);
  return text.match(/About\\s+(.{60,2200}?)(?=\\s+Key Points|\\s+Website|\\s+Market Cap)/i)?.[1]?.trim() || "";
}

async function getWikipediaDescription(name: string) {
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.search = new URLSearchParams({ action: "query", list: "search", srsearch: `${name} India company`, srlimit: "5", format: "json", origin: "*" }).toString();
  const search = await getJson<WikiSearch>(searchUrl.toString());
  const title = search.query?.search?.find((x) => x.title)?.title;
  if (!title) return "";
  const pageUrl = new URL("https://en.wikipedia.org/w/api.php");
  pageUrl.search = new URLSearchParams({ action: "query", prop: "extracts", exintro: "1", explaintext: "1", redirects: "1", titles: title, format: "json", origin: "*" }).toString();
  const page = await getJson<WikiPage>(pageUrl.toString());
  return Object.values(page.query?.pages ?? {})[0]?.extract?.replace(/\\s+/g, " ").trim() || "";
}

async function buildDescription(companyName: string, industry?: string | null, symbol?: string): Promise<string> {
  const key = `${symbol || companyName}|${industry || ""}`.toUpperCase();
  const cached = descriptionCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.text;

  try {
    const exact = symbol ? await getScreenerDescription(screenerSymbol(symbol, companyName)) : "";
    const sourceText = exact || await getWikipediaDescription(companyName);
    if (sourceText) {
      const translated = await translateGujarati(sourceText);
      if (translated) {
        descriptionCache.set(key, { expires: Date.now() + 7 * 24 * 60 * 60_000, text: translated });
        return translated;
      }
    }
  } catch {
    // Use the industry fallback below if public company information is temporarily unavailable.
  }

  const fallback = industry
    ? `${companyName} ${industry} ક્ષેત્રમાં કાર્યરત કંપની છે. આ વિભાગમાં કંપનીની મુખ્ય કામગીરી સંબંધિત ઉત્પાદનો અને સેવાઓ સાથે જોડાયેલી છે.`
    : `${companyName} વિશેની ચોક્કસ વ્યવસાયિક માહિતી હાલમાં ઉપલબ્ધ નથી.`;
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
    gcTime: 7 * 24 * 60 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return (
    <Panel className="p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">કંપની શું કરે છે?</div>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {q.isFetching ? "ગુજરાતીમાં કંપનીની સાચી વ્યવસાયિક માહિતી લાવી રહ્યા છીએ…" : q.data ?? "કંપનીની વ્યવસાયિક માહિતી હાલમાં ઉપલબ્ધ નથી."}
      </p>
      <p className="mt-2 text-[10px] text-subtle">માહિતી જાહેર કંપની સ્રોત પરથી લેવામાં આવે છે અને ગુજરાતીમાં રજૂ કરવામાં આવે છે.</p>
    </Panel>
  );
}

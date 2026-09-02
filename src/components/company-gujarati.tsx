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
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function conciseDescription(text: string, companyName: string) {
  const cleaned = cleanText(text)
    .replace(/\b(Read More|read more|Show More|show more)\b[\s\S]*$/i, "")
    .replace(/\b(Website|BSE|NSE|Face Value|Market Cap)\b[\s\S]*$/i, "")
    .trim();

  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [cleaned];
  const relevant = sentences
    .map((s) => s.trim())
    .filter((s) => s.length >= 35)
    .slice(0, 5);

  const result = (relevant.length ? relevant.join(" ") : cleaned).trim();
  return result.slice(0, 1600) || `${companyName} વિશેની ચોક્કસ વ્યવસાયિક માહિતી જાહેર સ્રોતમાંથી ઉપલબ્ધ નથી.`;
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
  return (symbol || companyName || "").replace(/\.(NS|BO)$/i, "").trim().toUpperCase();
}

async function getScreenerDescription(symbol: string, companyName: string) {
  const res = await fetch(`https://www.screener.in/company/${encodeURIComponent(symbol)}/`, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Screener HTTP ${res.status}`);

  const html = await res.text();
  const aboutBlock = html.match(/<section[^>]*id=["']about["'][^>]*>([\s\S]*?)<\/section>/i)?.[1]
    ?? html.match(/About[\s\S]{0,5000}?(?=Key Points|Peer Comparison|Profit & Loss|Balance Sheet)/i)?.[0]
    ?? "";

  return aboutBlock ? conciseDescription(aboutBlock, companyName) : "";
}

async function getWikipediaDescription(name: string) {
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `\"${name}\" company India`,
    srlimit: "3",
    format: "json",
    origin: "*",
  }).toString();
  const search = await getJson<WikiSearch>(searchUrl.toString());
  const title = search.query?.search?.find((x) => x.title)?.title;
  if (!title) return "";

  const pageUrl = new URL("https://en.wikipedia.org/w/api.php");
  pageUrl.search = new URLSearchParams({
    action: "query",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    redirects: "1",
    titles: title,
    format: "json",
    origin: "*",
  }).toString();
  const page = await getJson<WikiPage>(pageUrl.toString());
  return conciseDescription(Object.values(page.query?.pages ?? {})[0]?.extract || "", name);
}

async function buildDescription(companyName: string, industry?: string | null, symbol?: string): Promise<string> {
  const key = `${symbol || companyName}|${industry || ""}`.toUpperCase();
  const cached = descriptionCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.text;

  try {
    // Prefer the exact listed-company profile from Screener because it is tied
    // to the searched stock symbol, rather than a generic industry description.
    const exact = symbol
      ? await getScreenerDescription(screenerSymbol(symbol, companyName), companyName)
      : "";
    const sourceText = exact || await getWikipediaDescription(companyName);

    if (sourceText) {
      const translated = await translateGujarati(sourceText);
      if (translated) {
        const text = translated.replace(/\s+/g, " ").trim();
        descriptionCache.set(key, { expires: Date.now() + 7 * 24 * 60 * 60_000, text });
        return text;
      }
    }
  } catch {
    // Do not invent company facts when a public source is unavailable.
  }

  return industry
    ? `${companyName} ${industry} ક્ષેત્રમાં કાર્યરત કંપની છે. કંપનીની ચોક્કસ વ્યવસાયિક પ્રવૃત્તિ અંગે જાહેર માહિતી હાલમાં ઉપલબ્ધ નથી.`
    : `${companyName} વિશેની ચોક્કસ વ્યવસાયિક માહિતી હાલમાં જાહેર સ્રોતમાંથી ઉપલબ્ધ નથી.`;
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
        {q.isFetching ? "ગુજરાતીમાં કંપનીની વ્યવસાયિક માહિતી લાવી રહ્યા છીએ…" : q.data ?? "કંપનીની વ્યવસાયિક માહિતી હાલમાં ઉપલબ્ધ નથી."}
      </p>
    </Panel>
  );
}

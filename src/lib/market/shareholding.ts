import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ShareholdingQuarter = {
  quarter: string;
  asOnDate: string;
  promoter: number | null;
  fii: number | null;
  dii: number | null;
  public: number | null;
  promoterPledge: number | null;
  sourceUrl: string;
  sourceName: string;
};
export type ShareholdingResult = {
  symbol: string;
  source: string;
  sourceName: string;
  quarters: ShareholdingQuarter[];
  note: string | null;
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
const cache = new Map<string, { expires: number; data: ShareholdingResult }>();

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/\.NS$|\.BO$/i, "").replace(/[^A-Z0-9&_-]/g, "");
}
function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function localName(name: string) { return name.split(":").pop() ?? name; }
function parseDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}
function sourceDate(value: string): string {
  const match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return value;
  const month = new Date(`${match[2]} 1, 2000`).getMonth();
  return new Date(Date.UTC(Number(match[3]), month, Number(match[1]))).toISOString().slice(0, 10);
}

async function nseJson(url: string, referer: string): Promise<unknown> {
  const home = await fetch(referer, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*", "Accept-Language": "en-US,en;q=0.9" },
    cache: "no-store",
  });
  const headers = new Headers({ "User-Agent": UA, Accept: "application/json,text/plain,*/*", "Accept-Language": "en-US,en;q=0.9", Referer: referer, Origin: "https://www.nseindia.com", "X-Requested-With": "XMLHttpRequest" });
  const cookie = home.headers.get("set-cookie");
  if (cookie) headers.set("Cookie", cookie.split(/,(?=[^;]+=)/).map(v => v.split(";", 1)[0]).join("; "));
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`NSE shareholding endpoint returned HTTP ${response.status}`);
  return response.json();
}

function parseXbrl(xml: string): Omit<ShareholdingQuarter, "quarter" | "asOnDate" | "sourceUrl"> | null {
  if (!xml.trim().startsWith("<") || !/ShareholdingAsAPercentageOfTotalNumberOfShares/.test(xml)) return null;
  const contexts = new Map<string, string[]>();
  const contextPattern = /<(?:[\w.-]+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?context>/g;
  for (const match of xml.matchAll(contextPattern)) {
    const members: string[] = [];
    const memberPattern = /<(?:[\w.-]+:)?explicitMember\b[^>]*>([^<]+)<\/(?:[\w.-]+:)?explicitMember>/g;
    for (const member of match[2].matchAll(memberPattern)) members.push(localName(member[1].trim()));
    contexts.set(match[1], members);
  }

  const categories: Record<string, string[]> = {
    promoter: ["ShareholdingOfPromoterAndPromoterGroupMember"],
    public: ["PublicShareholdingMember"],
    fii: ["InstitutionsForeignMember"],
    dii: ["InstitutionsDomesticMember"],
  };
  const values: Record<string, number | null> = { promoter: null, public: null, fii: null, dii: null };
  const factPattern = /<(?:[\w.-]+:)?ShareholdingAsAPercentageOfTotalNumberOfShares\b[^>]*\bcontextRef="([^"]+)"[^>]*>([-\d.]+)<\/(?:[\w.-]+:)?ShareholdingAsAPercentageOfTotalNumberOfShares>/g;
  for (const fact of xml.matchAll(factPattern)) {
    const members = contexts.get(fact[1]) ?? [];
    if (members.length > 2) continue;
    const raw = Number(fact[2]);
    if (!Number.isFinite(raw)) continue;
    for (const [category, names] of Object.entries(categories)) {
      if (values[category] === null && members.some(member => names.includes(member))) values[category] = raw;
    }
  }

  // Prefer the filing’s explicit pledge percentage; otherwise calculate from pledged and promoter share counts.
  let pledgePctRaw: number | null = null;
  const pledgePattern = /<(?:[\w.-]+:)?PledgedOrEncumberedSharesHeldAsPercentageOfTotalNumberOfShares\b[^>]*\bcontextRef="([^"]+)"[^>]*>([-\d.]+)<\/(?:[\w.-]+:)?PledgedOrEncumberedSharesHeldAsPercentageOfTotalNumberOfShares>/g;
  for (const fact of xml.matchAll(pledgePattern)) {
    const members = contexts.get(fact[1]) ?? [];
    const value = Number(fact[2]);
    if (members.length <= 2 && members.includes("ShareholdingOfPromoterAndPromoterGroupMember") && Number.isFinite(value)) { pledgePctRaw = value; break; }
  }
  const shareCounts: Record<string, number | null> = { promoter: null, pledged: null };
  const countPattern = /<(?:[\w.-]+:)?(NumberOfShares|NumberOfSharesPledgedOrOtherwiseEncumbered)\b[^>]*\bcontextRef="([^"]+)"[^>]*>(\d+)<\/(?:[\w.-]+:)?\1>/g;
  for (const fact of xml.matchAll(countPattern)) {
    const tag = fact[1], members = contexts.get(fact[2]) ?? [], raw = Number(fact[3]);
    if (members.length > 2 || !Number.isFinite(raw)) continue;
    if (tag === "NumberOfShares" && members.includes("ShareholdingOfPromoterAndPromoterGroupMember") && shareCounts.promoter === null) shareCounts.promoter = raw;
    if (tag === "NumberOfSharesPledgedOrOtherwiseEncumbered" && members.includes("ShareholdingOfPromoterAndPromoterGroupMember") && shareCounts.pledged === null) shareCounts.pledged = raw;
  }

  const sum = (values.promoter ?? 0) + (values.public ?? 0);
  const scale = sum > 1000 ? 0.01 : sum > 0 && sum < 2 ? 100 : 1;
  for (const key of ["promoter", "public", "fii", "dii"] as const) if (values[key] !== null) values[key] = Math.round((values[key] as number) * scale * 10000) / 10000;
  const promoterPledge = pledgePctRaw !== null
    ? Math.round(pledgePctRaw * scale * 100) / 100
    : shareCounts.promoter && shareCounts.pledged !== null
      ? Math.round((shareCounts.pledged / shareCounts.promoter) * 10000) / 100
      : null;
  if (Object.values(values).every(v => v === null)) return null;
  return { promoter: values.promoter, fii: values.fii, dii: values.dii, public: values.public, promoterPledge };
}

function htmlText(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
function screenerNumber(value: string): number | null {
  const text = htmlText(value).replace(/,/g, "").replace(/%/g, "").trim();
  if (!text || text === "-" || text === "—" || text === "NA" || text === "N/A") return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}
function parseScreener(html: string, symbol: string, url: string): ShareholdingQuarter[] {
  // Parse the actual quarterly Shareholding Pattern table. Screener labels rows
  // with a trailing "+" (e.g. "FIIs +"), which must be normalized before matching.
  const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  const parseRows = (table: string) => [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => {
    const cells = [...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(x => htmlText(x[1]));
    return cells;
  }).filter(row => row.length > 1);
  const normalizeLabel = (value: string) => htmlText(value).replace(/\s*\+\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  const periodPattern = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+['’]?\d{4}$/i;
  const candidates = tables.map(match => parseRows(match[0])).filter(rows => {
    const labels = rows.map(row => normalizeLabel(row[0] || ""));
    const hasPeriods = rows.some(row => row.slice(1).some(cell => periodPattern.test(normalizeLabel(cell))));
    return hasPeriods && labels.some(label => /^promoters?$/.test(label)) &&
      labels.some(label => /^fiis?$/.test(label)) &&
      labels.some(label => /^diis?$/.test(label)) &&
      labels.some(label => /^public$/.test(label));
  });
  const rows = candidates[0];
  if (!rows || rows.length < 2) return [];
  const header = rows.find(row => row.slice(1).some(cell => periodPattern.test(normalizeLabel(cell))));
  if (!header) return [];
  const dates = header.slice(1).map(value => {
    const cleaned = htmlText(value).replace(/[’']/g, " ").trim();
    const date = new Date(cleaned);
    return Number.isNaN(date.getTime()) ? null : {
      quarter: date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
      asOnDate: date.toISOString().slice(0, 10),
    };
  });
  const findRow = (patterns: RegExp[]) => rows.find(row => patterns.some(pattern => pattern.test(normalizeLabel(row[0] || ""))));
  const promoters = findRow([/^promoters?$/, /^promoter & promoter group$/]);
  const fii = findRow([/^fiis?$/, /^foreign institutional investors?$/, /^foreign institutions?$/]);
  const dii = findRow([/^diis?$/, /^domestic institutional investors?$/, /^domestic institutions?$/]);
  const publicRow = findRow([/^public$/, /^public shareholding$/]);
  const quarters: ShareholdingQuarter[] = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (!date) continue;
    const get = (row: string[] | undefined) => row ? screenerNumber(row[i + 1] || "") : null;
    const promoter = get(promoters), fiiValue = get(fii), diiValue = get(dii), publicValue = get(publicRow);
    if (promoter === null && fiiValue === null && diiValue === null && publicValue === null) continue;
    quarters.push({
      ...date, promoter, fii: fiiValue, dii: diiValue, public: publicValue,
      promoterPledge: null, sourceUrl: url, sourceName: "Screener.in",
    });
  }
  return quarters.sort((a, b) => b.asOnDate.localeCompare(a.asOnDate)).slice(0, 4);
}

async function loadScreenerFallback(symbol: string): Promise<{ url: string; quarters: ShareholdingQuarter[] }> {
  const url = `https://www.screener.in/company/${encodeURIComponent(symbol)}/`;
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*", "Accept-Language": "en-US,en;q=0.9" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Screener.in returned HTTP ${response.status}`);
  return { url, quarters: parseScreener(await response.text(), symbol, url) };
}


// Additional public-site fallbacks. They are best-effort HTML sources; every result
// must contain parsed quarter headers plus separate FII/DII values before use.
async function loadPublicSiteFallback(symbol: string): Promise<{url:string; name:string; quarters:ShareholdingQuarter[]}> {
  const providers = [
    {name:"Trendlyne", url:`https://trendlyne.com/equity/shareholding/${encodeURIComponent(symbol)}/`},
    {name:"Tickertape", url:`https://www.tickertape.in/stocks/${encodeURIComponent(symbol.toLowerCase())}/shareholding`},
    {name:"Moneycontrol", url:`https://www.moneycontrol.com/india/stockpricequote/${encodeURIComponent(symbol.toLowerCase())}`},
    {name:"Tijori Finance", url:`https://www.tijorifinance.com/company/${encodeURIComponent(symbol.toLowerCase())}/`},
  ];
  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, {
        headers:{ "User-Agent":UA, Accept:"text/html,application/xhtml+xml,*/*", "Accept-Language":"en-IN,en;q=0.9" },
        cache:"no-store",
      });
      if (!response.ok) continue;
      const html=await response.text();
      // Reuse the strict quarterly-table parser: do not scrape unrelated summary
      // percentages or infer missing categories from totals.
      const quarters=parseScreener(html,symbol,provider.url).map(q=>({...q,sourceName:provider.name}));
      if (quarters.length && quarters[0].fii!==null && quarters[0].dii!==null) {
        return {url:provider.url,name:provider.name,quarters};
      }
    } catch { /* continue to the next independent public source */ }
  }
  return {url:"",name:"",quarters:[]};
}


async function loadBseFallback(symbol:string):Promise<{url:string;quarters:ShareholdingQuarter[]}> {
  const headers={ "User-Agent":UA, Accept:"application/json, text/plain, */*", Referer:"https://www.bseindia.com/" };
  // Resolve NSE symbol to BSE scrip code through BSE's own public search.
  const lookupUrl="https://api.bseindia.com/BseIndiaAPI/api/PeerSmartSearch/w?Type=SS&text="+encodeURIComponent(symbol);
  const lookup=await fetch(lookupUrl,{headers,cache:"no-store"});
  if(!lookup.ok)throw new Error("BSE company lookup failed");
  const lookupText=await lookup.text();
  const escaped=symbol.replace(/[.*+?^${}()|[\]\\]/g,"\\async function loadShareholding(symbolInput: string, refresh = false): Promise<ShareholdingResult> {");
  const rowMatch=lookupText.match(new RegExp("[^<>]{0,240}"+escaped+"[^<>]{0,240}","i"));
  const row=rowMatch?.[0]??lookupText;
  const codeMatch=row.match(/(?:scripcode|scrip_code|scrip_cd|scripcode=|securityid|security_id)[^0-9]{0,24}(\\d{6})/i)
    ??lookupText.match(new RegExp("(?:^|[^0-9])(\\d{6})(?=[^<>]{0,160}"+escaped+")","i"));
  const code=codeMatch?.[1];
  if(!code)throw new Error("BSE scrip code not resolved for "+symbol);
  const indexUrl="https://api.bseindia.com/BseIndiaAPI/api/Corp_Shareholding_ng/w?scripcode="+code+"&flag=0&indtype=";
  const indexRes=await fetch(indexUrl,{headers,cache:"no-store"});
  if(!indexRes.ok)throw new Error("BSE shareholding index unavailable");
  const index=await indexRes.json() as {Table?:Array<Record<string,unknown>>};
  const filings=(index.Table??[]).filter(x=>Number(x.IsXBRL)===1&&typeof x.XBRLAttachment==="string"&&String(x.EndDate??"").slice(0,10).match(/^\\d{4}-\\d{2}-\\d{2}$/)).sort((a,b)=>String(b.EndDate).localeCompare(String(a.EndDate))).slice(0,4);
  const quarters:ShareholdingQuarter[]=[];
  for(const filing of filings){
    const attachment=String(filing.XBRLAttachment);
    const url=attachment.startsWith("http")?attachment:"https://www.bseindia.com"+(attachment.startsWith("/")?attachment:"/"+attachment);
    try{
      const res=await fetch(url,{headers:{...headers,Accept:"text/html,application/xhtml+xml,*/*"},cache:"no-store"});
      if(!res.ok)continue;
      const html=await res.text();
      const contexts=new Map<string,string[]>();
      for(const m of html.matchAll(/<(?:[\\w.-]+:)?context\\b[^>]*\\bid=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?context>/gi)){
        const members=[...m[2].matchAll(/<(?:[\\w.-]+:)?explicitMember\\b[^>]*>([^<]+)<\\/(?:[\\w.-]+:)?explicitMember>/gi)].map(x=>localName(x[1].trim()).toLowerCase());
        contexts.set(m[1],members);
      }
      const vals:Record<string,number[]>={promoter:[],fii:[],dii:[],public:[]};
      for(const fact of html.matchAll(/<(?:ix:)?nonFraction\\b([^>]*?)>([\\s\\S]*?)<\\/(?:ix:)?nonFraction>/gi)){
        const attrs=fact[1], name=(attrs.match(/\\bname=["']([^"']+)["']/i)?.[1]??"").toLowerCase();
        if(!name.includes("shareholdingasapercentageoftotalnumberofshares"))continue;
        const context=attrs.match(/\\bcontextref=["']([^"']+)["']/i)?.[1];
        const members=contexts.get(context??"")??[];
        if(!members.length||members.length>2)continue;
        const raw=htmlText(fact[2]).replace(/,/g,"").trim(), value=Number(raw);
        if(!Number.isFinite(value)||value<0||value>100)continue;
        const joined=members.join(" ");
        if(/promoterandpromotergroup/.test(joined))vals.promoter.push(value);
        else if(/foreign|fpi|fii/.test(joined))vals.fii.push(value);
        else if(/domestic|dii/.test(joined))vals.dii.push(value);
        else if(/publicshareholding|publicshareholdermember/.test(joined))vals.public.push(value);
      }
      const sum=(arr:number[])=>arr.length?Math.round(arr.reduce((a,b)=>a+b,0)*10000)/10000:null;
      const promoter=sum(vals.promoter),fii=sum(vals.fii),dii=sum(vals.dii),publicValue=sum(vals.public);
      if(fii===null||dii===null)continue;
      const asOnDate=String(filing.EndDate).slice(0,10),date=new Date(asOnDate+"T00:00:00Z");
      quarters.push({quarter:date.toLocaleDateString("en-IN",{month:"short",year:"numeric",timeZone:"UTC"}),asOnDate,promoter,fii,dii,public:publicValue,promoterPledge:null,sourceUrl:url,sourceName:"BSE"});
    }catch{continue;}
  }
  quarters.sort((a,b)=>b.asOnDate.localeCompare(a.asOnDate));
  return {url:"https://www.bseindia.com/corporates/Sharehold_Searchnew.aspx",quarters:quarters.slice(0,4)};
}

async function loadShareholding(symbolInput: string, refresh = false): Promise<ShareholdingResult> {
  const symbol = normalizeSymbol(symbolInput);
  if (!symbol) throw new Error("A valid NSE symbol is required.");
  const cached = cache.get(symbol);
  if (!refresh && cached && cached.expires > Date.now()) return cached.data;
  if (refresh) cache.delete(symbol);
  const page = `https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern?symbol=${encodeURIComponent(symbol)}&tabIndex=equity`;
  const base: ShareholdingResult = { symbol, source: page, sourceName: "NSE", quarters: [], note: null };
  try {
    const raw = await nseJson(`https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(symbol)}`, page);
    if (!Array.isArray(raw)) throw new Error("Unexpected response from NSE.");
    const filings = raw as Array<Record<string, unknown>>;
    const selected = filings.filter(row => typeof row.xbrl === "string" && /^https?:\/\//i.test(row.xbrl as string)).sort((a, b) => sourceDate(String(b.date ?? "")).localeCompare(sourceDate(String(a.date ?? "")))).slice(0, 4);
    // Fetch the latest four filing documents concurrently; their order is restored by filing date below.
    const parsedFilings = await Promise.all(selected.map(async (filing) => {
      const url = String(filing.xbrl);
      try {
        const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/xml,text/xml,*/*", Referer: page }, cache: "no-store" });
        if (!response.ok) return null;
        const parsed = parseXbrl(await response.text());
        if (!parsed) return null;
        const rawDate = String(filing.date ?? "");
        const date = sourceDate(rawDate);
        return {
          ...parsed,
          quarter: parseDate(date || rawDate),
          asOnDate: date || rawDate,
          sourceUrl: url,
          sourceName: "NSE" as const,
        };
      } catch { return null; }
    }));
    base.quarters = parsedFilings.filter((quarter): quarter is ShareholdingQuarter => quarter !== null);
    base.quarters.sort((a, b) => b.asOnDate.localeCompare(a.asOnDate));
    base.quarters = base.quarters.slice(0, 4);
    if (!base.quarters.length) base.note = "NSE filings were reachable, but no supported shareholding values could be parsed. Figures are not estimated.";
    else if (base.quarters.some(q => q.fii === null || q.dii === null)) base.note = "Some filings do not expose separate FII/DII values in a format this screen can verify. Missing figures remain unavailable.";
  } catch {
    base.note = "NSE shareholding data could not be retrieved right now.";
  }

  // Use Screener when NSE is blocked, returns no usable quarters, or lacks FII/DII figures.
  const latestNse = base.quarters[0];
  const needsFallback = !latestNse || latestNse.fii === null || latestNse.dii === null;
  if (needsFallback) {
    try {
      const fallback = await loadScreenerFallback(symbol);
      const fallbackLatest = fallback.quarters[0];
      const nseLatest = base.quarters[0];
      const fallbackIsCurrentOrNewer = !!fallbackLatest && (!nseLatest || fallbackLatest.asOnDate >= nseLatest.asOnDate);
      const fallbackHasScreeningData = !!fallbackLatest && fallbackLatest.fii !== null && fallbackLatest.dii !== null;
      if (fallbackIsCurrentOrNewer && fallbackHasScreeningData) {
        base.source = fallback.url;
        base.sourceName = "Screener.in";
        base.quarters = fallback.quarters;
        base.note = "Using Screener.in because its latest verified quarter is current or newer than the NSE result and includes separate FII/DII values. Verify figures at the linked source. Promoter pledge is not supplied by this fallback.";
      } else if (!base.quarters.length) {
        base.note = "NSE and Screener.in did not return verifiable latest-quarter FII/DII figures. No sample values are shown.";
      } else if (fallbackLatest && nseLatest && fallbackLatest.asOnDate < nseLatest.asOnDate) {
        base.note = "Screener.in data was older than the latest NSE filing, so it was not used to replace newer NSE data. Missing figures remain unavailable.";
      }
    } catch {
      if (!base.quarters.length) base.note = "NSE and Screener.in shareholding data could not be retrieved. Try again later; no sample figures are shown.";
    }
  }
  // BSE is a second exchange filing source. It is tried before aggregator-only pages.\n  if (!base.quarters[0] || base.quarters[0].fii===null || base.quarters[0].dii===null) {\n    try {\n      const bse=await loadBseFallback(symbol);\n      const latest=bse.quarters[0], current=base.quarters[0];\n      if(latest && (!current || latest.asOnDate>=current.asOnDate)){\n        base.source=latest.sourceUrl; base.sourceName="BSE"; base.quarters=bse.quarters;\n        base.note="Using BSE exchange-filed shareholding pattern. Quarter and separate FII/DII values were parsed from the filing; pledge is not available from this parser.";\n      }\n    } catch { /* continue to the other public sources */ }\n  }\n
  // If exchange/Screener sources did not yield complete institutional data,
  // try independent public finance sites. Only a parsed, dated quarter with both
  // FII and DII is eligible; never blend percentages from different providers.
  if (!base.quarters[0] || base.quarters[0].fii===null || base.quarters[0].dii===null) {
    const extra=await loadPublicSiteFallback(symbol);
    const extraLatest=extra.quarters[0];
    const current=base.quarters[0];
    if (extraLatest && (!current || extraLatest.asOnDate>=current.asOnDate)) {
      base.source=extra.url;
      base.sourceName=extra.name;
      base.quarters=extra.quarters;
      base.note=`Using ${extra.name} public shareholding table because it had a complete quarter no older than the exchange/Screener result. Verify at the linked source; missing pledge remains unavailable.`;
    }
  }

  // Cache only verified quarters. Empty/rate-limited responses must be retried on the next request.
  if (base.quarters.length) cache.set(symbol, { expires: Date.now() + 30 * 60_000, data: base });
  else cache.delete(symbol);
  return base;
}

export const fetchShareholding = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ symbol: z.string().min(1).max(40), refresh: z.boolean().optional() }).parse(data))
  .handler(async ({ data }) => loadShareholding(data.symbol, data.refresh));

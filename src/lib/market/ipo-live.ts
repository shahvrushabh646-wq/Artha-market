import { createServerFn } from "@tanstack/react-start";
type Ipo={nseSymbol?:string|null;bseScripCode?:string|null;bseSymbol?:string|null;normalizedName:string;issueDateKey:string|null;rhpStatus:"NOT_FOUND"|"DISCOVERED_UNPARSED"|"PARSED"|"PARSE_FAILED";officialWebsite?:string|null;prospectusUrl?:string|null;prospectusType?:"DRHP"|"RHP"|"Prospectus"|"Abridged Prospectus"|null;symbol?:string;exchange?:"NSE India"|"BSE India"|"BOTH"|"UNKNOWN";exchanges:string[];id:string;name:string;type:"Mainboard"|"SME";openDate:string|null;closeDate:string|null;listingDate:string|null;issueSize:number|null;minSubscription:number|null;subscription:number|null;subscriptionAmount:number|null;subscriptionSource:string|null;subscriptionCategories:{category:string;value:number|null}[];gmpPct:number|null;gmpRs:number|null;gmpSources:{source:string;url:string|null;pct:number|null;rs:number|null;asOf:string|null}[];gmpVerifiedSources:string[];city:string|null;state:string|null;business:string|null;promoters:string[];segments:string[];competitors:string[];countries:{country:string;business:string;salesPct:number|null}[];revenues:{year:string;value:number|null}[];profits:{year:string;value:number|null}[];eps:{year:string;value:number|null}[];priceBand:string|null;lotSize:number|null;faceValue:number|null;sharesOffered:number|null;offeredToPublic:number|null;retailShares:number|null;qibShares:number|null;niiShares:number|null;freshIssue:number|null;offerForSale:number|null;issueType:string|null;objects:string[];risks:string[];promoterHolding:number|null;postIssuePromoterHolding:number|null;moneycontrolUrl:string|null;detailSource:string|null;verifiedSources:string[];sourceUrls:string[];verifiedAt:string};
const NSE = "https://www.nseindia.com";
const NSE_PAGE = "https://www.nseindia.com/market-data/all-upcoming-issues-ipo";
const cache=new Map<string,{expires:number;value:Ipo[]}>();
const CACHE_MS=5000;
function clean(v:unknown){return String(v??"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
function n(v:unknown){if(v==null||v==="")return null;const x=Number(String(v).replace(/,/g,"").replace(/%/g,"").trim());return Number.isFinite(x)?x:null;}
function date(v:unknown){const s=clean(v);if(!s)return null;const m=s.match(/^(\d{1,2})[-\/](\w{3,})[-\/](\d{4})$/i);if(m){const months=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];const mi=months.indexOf(m[2].slice(0,3).toLowerCase());if(mi>=0)return m[3]+"-"+String(mi+1).padStart(2,"0")+"-"+String(Number(m[1])).padStart(2,"0");}const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);}
function band(v:unknown){const s=clean(v);const m=s.match(/(?:Rs\.?|₹)\s*([\d,.]+)\s*(?:-|to|–)\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i);return m?"₹"+Number(m[1].replace(/,/g,"")).toLocaleString("en-IN")+" - ₹"+Number(m[2].replace(/,/g,"")).toLocaleString("en-IN"):s||null;}
function upper(v:unknown){const s=clean(v);const m=s.match(/(?:-|to|–)\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i);return m?n(m[1]):null;}
function slugId(v:string){return clean(v).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"ipo";}
const HEADERS={
  "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  Accept:"application/json, text/plain, */*",
  "Accept-Language":"en-US,en;q=0.9",
  Referer:NSE_PAGE
};


const EXTERNAL_TIMEOUT_MS=3000;
const RESEARCH_TIMEOUT_MS=8000;
async function fetchWithTimeout(url:string,init:RequestInit={},timeoutMs=EXTERNAL_TIMEOUT_MS):Promise<Response>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...init,signal:controller.signal});}
  finally{clearTimeout(timer);}
}
function normalizeCompanyName(v:unknown){
  return clean(v).toLowerCase()
    .replace(/\b(limited|ltd|private|pvt|company|corporation|inc)\b/g," ")
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ").trim();
}
function issueDateKey(openDate:string|null,closeDate:string|null){
  return openDate??closeDate??null;
}
function buildCanonicalKey(item:Pick<Ipo,"nseSymbol"|"bseScripCode"|"bseSymbol"|"normalizedName"|"issueDateKey">){
  if(item.nseSymbol)return "NSE:"+item.nseSymbol.toUpperCase();
  if(item.bseScripCode)return "BSE_CODE:"+item.bseScripCode;
  if(item.bseSymbol)return "BSE_SYM:"+item.bseSymbol.toUpperCase();
  return "NAME_DATE:"+item.normalizedName+"_"+(item.issueDateKey||"NODATE");
}
function sameCompanyIssue(a:Ipo,b:Ipo){
  if(a.nseSymbol&&b.nseSymbol)return a.nseSymbol.toUpperCase()===b.nseSymbol.toUpperCase();
  if(a.bseScripCode&&b.bseScripCode)return a.bseScripCode===b.bseScripCode;
  if(a.bseSymbol&&b.bseSymbol)return a.bseSymbol.toUpperCase()===b.bseSymbol.toUpperCase();
  return !!a.normalizedName&&a.normalizedName===b.normalizedName&&
    !!a.issueDateKey&&!!b.issueDateKey&&a.issueDateKey===b.issueDateKey;
}
function mergeIpoRecords(existing:Ipo,incoming:Ipo):Ipo{
  const exchanges=[...(existing.exchanges??[]),...(incoming.exchanges??[])];
  const hasNse=!!(existing.nseSymbol||incoming.nseSymbol);
  const hasBse=!!(existing.bseScripCode||incoming.bseScripCode||existing.bseSymbol||incoming.bseSymbol);
  return {
    ...existing,...incoming,
    id:existing.id,
    name:existing.name||incoming.name,
    nseSymbol:existing.nseSymbol||incoming.nseSymbol,
    bseScripCode:existing.bseScripCode||incoming.bseScripCode,
    bseSymbol:existing.bseSymbol||incoming.bseSymbol,
    normalizedName:existing.normalizedName||incoming.normalizedName,
    issueDateKey:existing.issueDateKey||incoming.issueDateKey,
    exchanges:[...new Set(exchanges)],
    exchange:hasNse&&hasBse?"BOTH":(hasNse?"NSE India":hasBse?"BSE India":"UNKNOWN"),
    // Never let a sparse secondary exchange record erase verified primary values.
    subscription:incoming.subscription??existing.subscription,
    subscriptionAmount:incoming.subscriptionAmount??existing.subscriptionAmount,
    sharesOffered:incoming.sharesOffered??existing.sharesOffered,
    verifiedSources:[...new Set([...(existing.verifiedSources??[]),...(incoming.verifiedSources??[])])],
    sourceUrls:[...new Set([...(existing.sourceUrls??[]),...(incoming.sourceUrls??[])])]
  };
}
function scoreCandidateArray(arr:unknown[],expectedFields:string[]){
  if(!Array.isArray(arr)||arr.length===0)return 0;
  const sample=arr.slice(0,5);
  let total=0,count=0;
  for(const item of sample){
    if(!item||typeof item!=="object"||Array.isArray(item))continue;
    const keys=Object.keys(item as Record<string,unknown>);
    const matched=expectedFields.filter(k=>k in (item as Record<string,unknown>)).length;
    const coverage=matched/Math.max(1,expectedFields.length);
    const density=matched/Math.max(1,keys.length);
    const noise=Math.max(0,(keys.length-matched)/Math.max(1,keys.length));
    total += coverage*70 + density*30 - noise*20;
    count++;
  }
  return count?total/count:0;
}
function deepFindScoredRecordArray(raw:unknown,expectedFields:string[],maxDepth=3):any[]{
  const candidates:Array<{arr:any[];score:number;depth:number}>=[];
  const visit=(value:unknown,depth:number)=>{
    if(depth>maxDepth||value==null)return;
    if(Array.isArray(value)){
      const arr=value.filter(x=>x&&typeof x==="object"&&!Array.isArray(x));
      if(arr.length)candidates.push({arr,score:scoreCandidateArray(arr,expectedFields)-depth*5,depth});
      for(const item of value.slice(0,8))visit(item,depth+1);
      return;
    }
    if(typeof value==="object"){
      for(const child of Object.values(value as Record<string,unknown>))visit(child,depth+1);
    }
  };
  visit(raw,0);
  candidates.sort((a,b)=>b.score-a.score||a.depth-b.depth);
  return candidates[0]?.arr??[];
}
async function nseSession(){
  try{
    const r=await fetchWithTimeout(NSE,{headers:HEADERS,cache:"no-store"});
    const h=r.headers as Headers & {getSetCookie?:()=>string[]};
    const direct=h.getSetCookie?.()??[];
    if(direct.length) return direct.map(x=>x.split(";")[0]).join("; ");
    const raw=h.get("set-cookie")??"";
    if(raw) return raw.split(/,(?=[^;=]+=)/).map(x=>x.split(";")[0]).filter(Boolean).join("; ");
    return "";
  }catch{return "";}
}
async function parseProxyJson(text:string){
  const s=text.trim();
  try{return JSON.parse(s);}
  catch{}
  const a=s.indexOf("["); const o=s.indexOf("{");
  const start=a>=0&&(o<0||a<o)?a:o;
  if(start>=0){
    const end=Math.max(s.lastIndexOf("]"),s.lastIndexOf("}"));
    if(end>start){try{return JSON.parse(s.slice(start,end+1));}catch{}}
  }
  throw new Error("NSE proxy returned non-JSON");
}
async function fetchNse(path:string,cookie:string){
  try{
    const r=await fetchWithTimeout(NSE+path,{headers:{...HEADERS,Cookie:cookie},cache:"no-store"});
    if(!r.ok) throw new Error("NSE HTTP "+r.status);
    return await r.json();
  }catch{
    const proxy="https://r.jina.ai/http://www.nseindia.com"+path;
    const r=await fetchWithTimeout(proxy,{headers:{"User-Agent":HEADERS["User-Agent"],Accept:"application/json,text/plain,*/*"},cache:"no-store"});
    if(!r.ok) throw new Error("NSE proxy HTTP "+r.status);
    return parseProxyJson(await r.text());
  }
}

function rowsFromNse(raw:unknown): any[]{
  return deepFindScoredRecordArray(raw,["companyName","symbol","issueStartDate","issueEndDate","issuePrice","noOfSharesOffered"]);
}

function parseInfo(rows:unknown[]){
  const out:Record<string,string>={};
  for(const row of rows as Array<{title?:string;value?:unknown}>){
    if(row?.title) out[clean(row.title)]=clean(row.value);
  }
  return out;
}
function rowsFromCategory(raw:unknown):any[]{
  return deepFindScoredRecordArray(raw,["category","noOfTime","noOfTimes","subscription","noOfsharesBid","noOfSharesBid"]);
}

function issueSizeCr(v:string|null|undefined){
  const s=clean(v);
  const m=s.match(/(?:Rs\.?|₹)\s*([\d,.]+)\s*(million|crore|cr\b|lakh)/i);
  if(!m)return null;
  const x=n(m[1]); if(x==null)return null;
  const u=m[2].toLowerCase();
  return u.startsWith("million")?x/10:u.startsWith("lakh")?x/100:x;
}

type ResearchHit={url:string;domain:string;title:string;text:string;priority:number};

const SOURCE_RULES=[
  {name:"SEBI",hosts:["sebi.gov.in"],priority:100},
  {name:"NSE India",hosts:["nseindia.com"],priority:98},
  {name:"BSE India",hosts:["bseindia.com"],priority:98},
  {name:"Company website",hosts:[],priority:96},
  {name:"Chittorgarh",hosts:["chittorgarh.com"],priority:80},
  {name:"Moneycontrol",hosts:["moneycontrol.com"],priority:75},
  {name:"Economic Times",hosts:["economictimes.indiatimes.com"],priority:74},
  {name:"Livemint",hosts:["livemint.com"],priority:74},
  {name:"Groww",hosts:["groww.in"],priority:70},
  {name:"Zerodha",hosts:["zerodha.com"],priority:70},
  {name:"Angel One",hosts:["angelone.in"],priority:70},
  {name:"Upstox",hosts:["upstox.com"],priority:70},
  {name:"InvestorGain",hosts:["investorgain.com"],priority:68},
  {name:"IPO Watch",hosts:["ipowatch.in"],priority:68},
  {name:"IPO Central",hosts:["ipocentral.in"],priority:68},
  {name:"NiftyTrader",hosts:["niftytrader.in"],priority:68},
  {name:"IPOGram",hosts:["ipogram.in"],priority:68},
  {name:"IPO Ji",hosts:["ipoji.com"],priority:68},
  {name:"IPO Guru",hosts:["ipoguru.in"],priority:67},
  {name:"IPOinfo",hosts:["ipoinfo.ai"],priority:67},
  {name:"IPO Markets",hosts:["ipomarkets.com"],priority:67}
];
function domainOf(url:string){try{return new URL(url).hostname.replace(/^www\./,"").toLowerCase();}catch{return "";}}
function sourceName(url:string){const d=domainOf(url);const known=SOURCE_RULES.find(x=>x.hosts.some(h=>d===h||d.endsWith("."+h)));return known?.name??d;}
function sourcePriority(url:string){const d=domainOf(url);return SOURCE_RULES.find(x=>x.hosts.some(h=>d===h||d.endsWith("."+h)))?.priority??40;}
function firstText(s:string,patterns:RegExp[]){for(const p of patterns){const m=s.match(p);if(m?.[1])return clean(m[1]);}return null;}
function numberList(s:string,patterns:RegExp[],limit=3){for(const p of patterns){const ms=[...s.matchAll(p)];if(ms.length)return ms.slice(0,limit).map(m=>n(m[1])).filter((x):x is number=>x!=null);}return [];}
async function researchSearch(query:string):Promise<string[]>{
  try{
    const u="https://r.jina.ai/http://www.google.com/search?q="+encodeURIComponent(query);
    const r=await fetchWithTimeout(u,{headers:{Accept:"text/plain"},cache:"no-store"},RESEARCH_TIMEOUT_MS);
    if(!r.ok)return [];
    const t=await r.text();const urls:string[]=[];
    const add=(value:string)=>{
      const url=value.replace(/&amp;/g,"&").replace(/[),.;]+$/,"");
      if(/^https?:\/\//i.test(url)&&!urls.includes(url))urls.push(url);
    };
    for(const m of t.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g))add(m[1]);
    for(const m of t.matchAll(/\((https?:\/\/[^\s)]+)\)/g))add(m[1]);
    for(const m of t.matchAll(/https?:\/\/[^\s)\]">]+/g))add(m[0]);
    for(const m of t.matchAll(/(?:url\?q=|q=)(https?:\/\/[^&\s)\]">]+)/gi)){
      try{add(decodeURIComponent(m[1]));}catch{add(m[1]);}
    }
    return urls.slice(0,24);
  }catch{return [];}
}
async function readResearchUrl(url:string):Promise<string>{
  try{
    const r=await fetchWithTimeout("https://r.jina.ai/"+url,{headers:{Accept:"text/plain"},cache:"no-store"},RESEARCH_TIMEOUT_MS);
    if(!r.ok)return "";
    return (await r.text()).slice(0,45000);
  }catch{return "";}
}
function parseGmpValue(text:string){
  const s=String(text??"").replace(/\u00a0/g," ").replace(/\s+/g," ");
  const amount=/([+-]?\s*₹?\s*[\d,]+(?:\.\d+)?)/;
  const patterns=[
    /\b(?:gmp|gmp\s*today|latest\s*gmp|grey\s*market\s*premium|kotak\s*gmp|ipo\s*premium|expected\s*premium)\b[^₹\d+\-]{0,180}([+-]?\s*₹?\s*[\d,]+(?:\.\d+)?)/i,
    /([+-]?\s*₹?\s*[\d,]+(?:\.\d+)?)[^.!?]{0,120}\b(?:gmp|grey\s*market\s*premium|kotak\s*gmp|ipo\s*premium)\b/i
  ];
  for(const pattern of patterns){
    const m=s.match(pattern);
    if(!m)continue;
    const raw=m[1].replace(/[₹\s]/g,"");
    const parsed=n(raw);
    if(parsed==null)continue;
    if(parsed>=1900&&parsed<=2100)continue;
    return parsed;
  }
  const fallback=s.match(/\bGMP\b[^.!?]{0,80}/i);
  if(fallback){
    const m=fallback[0].match(amount);
    const parsed=m?n(m[1].replace(/[₹\s]/g,"")):null;
    if(parsed!=null)return parsed;
  }
  return null;
}
async function enrichGmp(ipo:Ipo){
  try{
    const name=ipo.name.replace(/\b(IPO|LIMITED|LTD\.?|PRIVATE|PVT\.?)\b/gi," ").replace(/\s+/g," ").trim();
    const allowed=SOURCE_RULES.filter(x=>x.hosts.length&&/investorgain|ipowatch|ipocentral|chittorgarh|moneycontrol|economictimes|livemint|groww|niftytrader|ipogram|ipoji|ipoguru|ipoinfo|ipomarkets/i.test(x.hosts[0]));
    // Search each requested GMP publisher separately. This avoids Google returning only
    // the same 1-2 sites for every IPO and lets Artha collect all sources that are
    // actually publishing a GMP for that issue.
    const sourceResults=await Promise.all(allowed.map(async rule=>{
      const urls=await researchSearch(name+" IPO GMP grey market premium site:"+rule.hosts[0]);
      const candidates=[...new Set(urls)].filter(u=>{
        const d=domainOf(u);
        return rule.hosts.some(h=>d===h||d.endsWith("."+h));
      }).slice(0,1);
      for(const url of candidates){
        const text=await readResearchUrl(url);
        const rs=parseGmpValue(text);
        if(rs==null)continue;
        const high=upper(ipo.priceBand);
        return {source:rule.name,url,pct:high?Number(((rs/high)*100).toFixed(2)):null,rs,asOf:new Date().toISOString()};
      }
      return null;
    }));
    // Broad search is a fallback for a publisher whose site-specific search did not
    // return a crawlable page.
    const fallbackUrls=await researchSearch(name+" IPO GMP grey market premium");
    for(const url of [...new Set(fallbackUrls)]){
      const source=sourceName(url);
      if(!allowed.some(x=>x.name===source))continue;
      if(sourceResults.some(x=>x?.source===source))continue;
      const text=await readResearchUrl(url);
      const rs=parseGmpValue(text);
      if(rs==null)continue;
      const high=upper(ipo.priceBand);
      sourceResults.push({source,url,pct:high?Number(((rs/high)*100).toFixed(2)):null,rs,asOf:new Date().toISOString()});
    }
    const unique=sourceResults.filter((x,i,a)=>x&&a.findIndex(y=>y?.source===x.source)===i) as {source:string;url:string|null;pct:number|null;rs:number|null;asOf:string|null}[];
    if(unique.length){
      const values=unique.map(x=>x.rs).filter((x):x is number=>x!=null).sort((a,b)=>a-b);
      const median=values.length
        ? values.length % 2 === 1
          ? values[Math.floor(values.length / 2)]
          : Number(((values[values.length / 2 - 1] + values[values.length / 2]) / 2).toFixed(2))
        : null;
      const high=upper(ipo.priceBand);
      ipo.gmpRs=median;
      ipo.gmpPct=median!=null&&high?Number(((median/high)*100).toFixed(2)):null;
      ipo.gmpSources=unique;
      ipo.gmpVerifiedSources=unique.map(x=>x.source);
    }
  }catch{
    // GMP is unofficial; failure must never block official IPO data.
  }
  return ipo;
}
async function researchHits(ipo:Ipo):Promise<ResearchHit[]>{
  const name=ipo.name.replace(/\b(IPO|LIMITED|LTD\.?|PRIVATE|PVT\.?)\b/gi," ").replace(/\s+/g," ").trim();
  const queries=[
    name+" official website investor relations IPO prospectus",
    name+" DRHP RHP prospectus SEBI",
    name+" IPO annual report revenue profit EPS",
    name+" IPO business objects risks price band lot size",
    name+" IPO GMP subscription"
  ];
  const found=(await Promise.all(queries.map(researchSearch))).flat();
  const unique=[...new Set(found)].filter(u=>!/facebook|instagram|youtube|linkedin|x\.com|twitter\.com/i.test(u));
  const preferred=unique.sort((a,b)=>sourcePriority(b)-sourcePriority(a)).slice(0,12);
  const texts=await Promise.all(preferred.map(async url=>({url,text:await readResearchUrl(url)})));
  return texts.filter(x=>x.text.length>=80).slice(0,8).map(x=>({
    url:x.url,domain:domainOf(x.url),
    title:x.text.split("\n").find(line=>line.trim())?.trim()??sourceName(x.url),
    text:x.text,priority:sourcePriority(x.url)
  }));
}
function applyResearchText(ipo:Ipo,hits:ResearchHit[]){
  const official=hits.filter(h=>h.priority>=96);
  const all=hits.map(h=>h.text).join("\n");
  const officialText=official.map(h=>h.text).join("\n");
  const text=officialText||all;
  const business=firstText(text,[/(?:business of the company|our business|company is engaged in|we are engaged in|business overview)[:\s]+([^\n]{60,500})/i,/(?:products and services|business model)[:\s]+([^\n]{60,500})/i]);
  if(business)ipo.business=business;
  const office=firstText(text,[/(?:registered office|corporate office|registered and corporate office)[:\s]+([^\n]{20,180})/i]);
  if(office){
    const parts=office.split(",").map(x=>x.trim()).filter(Boolean);
    if(parts.length>1)ipo.city=parts[parts.length-2]||ipo.city;
    ipo.state=parts[parts.length-1]||ipo.state;
  }
  const rev=numberList(all,[/(?:revenue from operations|revenue|turnover)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);
  const prof=numberList(all,[/(?:profit after tax|profit for the year|net profit|PAT)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);
  const eps=numberList(all,[/(?:basic EPS|diluted EPS|earnings per share|EPS)[^\d]{0,60}([\d,]+(?:\.\d+)?)/gi]);
  const years=[...new Set([...all.matchAll(/\b20(?:2[2-9]|3[0-9])\b/g)].map(m=>m[0]))].slice(-3);
  if(rev.length)ipo.revenues=rev.map((value,i)=>({year:years[years.length-rev.length+i]??String(i+1),value}));
  if(prof.length)ipo.profits=prof.map((value,i)=>({year:years[years.length-prof.length+i]??String(i+1),value}));
  if(eps.length)ipo.eps=eps.map((value,i)=>({year:years[years.length-eps.length+i]??String(i+1),value}));
  const objects=[...all.matchAll(/(?:objects of the issue|utilisation of proceeds|use of proceeds)[^\n:]*[:\-]\s*([^\n]{40,400})/gi)].slice(0,5).map(m=>clean(m[1]));
  const risks=[...all.matchAll(/(?:key risks|risk factors)[^\n:]*[:\-]\s*([^\n]{50,400})/gi)].slice(0,5).map(m=>clean(m[1]));
  if(objects.length)ipo.objects=objects;
  if(risks.length)ipo.risks=risks;

  const promoters = [
    ...[...all.matchAll(/(?:promoters?|promoter group)[^\n:]*[:\-]\s*([^\n]{20,500})/gi)].slice(0,3).map(m=>clean(m[1]))
  ];
  const segments = [
    ...[...all.matchAll(/(?:business segments?|segments?)[^\n:]*[:\-]\s*([^\n]{20,500})/gi)].slice(0,3).map(m=>clean(m[1]))
  ];
  const competitors = [
    ...[...all.matchAll(/(?:competitors?|competitive landscape)[^\n:]*[:\-]\s*([^\n]{20,500})/gi)].slice(0,3).map(m=>clean(m[1]))
  ];
  if(promoters.length)ipo.promoters=[...new Set(promoters)];
  if(segments.length)ipo.segments=[...new Set(segments)];
  if(competitors.length)ipo.competitors=[...new Set(competitors)];
}
function isCompanyOfficialUrl(url:string,name:string){const d=domainOf(url);if(!d||/sebi\.gov\.in|nseindia\.com|bseindia\.com|chittorgarh\.com|moneycontrol\.com|economictimes\.indiatimes\.com|livemint\.com|groww\.in|zerodha\.com|angelone\.in|upstox\.com|investorgain\.com|ipowatch\.in|ipocentral\.in|niftytrader\.in|ipogram\.in|ipoji\.com/.test(d))return false;const tokens=name.toLowerCase().replace(/\b(limited|ltd|private|pvt|ipo)\b/g," ").split(/[^a-z0-9]+/).filter(x=>x.length>=3);return tokens.some(t=>d.includes(t));}
function prospectusTypeFromUrl(url:string,text:string){const s=(url+" "+text).toLowerCase();if(/\bdrhp\b|draft red herring/.test(s))return "DRHP" as const;if(/\brhp\b|red herring prospectus/.test(s))return "RHP" as const;if(/abridged prospectus/.test(s))return "Abridged Prospectus" as const;if(/prospectus/.test(s))return "Prospectus" as const;return null;}
function extractOfficialAndProspectus(ipo:Ipo,hits:ResearchHit[]){const official=hits.find(h=>isCompanyOfficialUrl(h.url,ipo.name));const docs=hits.filter(h=>/sebi\.gov\.in|nseindia\.com|bseindia\.com/.test(h.domain)||/prospectus|rhp|drhp/i.test(h.url+" "+h.text));const doc=docs.sort((a,b)=>{const rank=(h:ResearchHit)=>{const t=(h.url+" "+h.text).toLowerCase();return /\bprospectus\b/.test(t)&&!/drhp|rhp/.test(t)?4:/\brhp\b|red herring/.test(t)?3:/\bdrhp\b|draft red herring/.test(t)?2:/abridged prospectus/.test(t)?1:0};return rank(b)-rank(a)||b.priority-a.priority;})[0];if(official)ipo.officialWebsite=official.url.split("/").slice(0,3).join("/");if(doc){ipo.prospectusUrl=doc.url;ipo.prospectusType=prospectusTypeFromUrl(doc.url,doc.text);if(ipo.prospectusType==="RHP")ipo.rhpStatus="DISCOVERED_UNPARSED";}}
async function universalResearch(ipo:Ipo){const hits=await researchHits(ipo);if(hits.length){applyResearchText(ipo,hits);extractOfficialAndProspectus(ipo,hits);ipo.verifiedSources=[...new Set(hits.map(h=>sourceName(h.url)))];ipo.sourceUrls=[...new Set(hits.map(h=>h.url))];ipo.detailSource=hits.find(h=>h.priority>=96)?.url??hits[0].url;}await enrichGmp(ipo);ipo.verifiedAt=new Date().toISOString();return ipo;}

function baseNse(r:any):Ipo{
  const issuePrice=band(r.issuePrice);
  const upperPrice=upper(issuePrice);
  const offered=n(r.noOfSharesOffered);
  const bid=n(r.noOfsharesBid??r.noOfSharesBid);
  const reportedSubscription=n(r.noOfTime??r.noOfTimes??r.subscription??r.subscriptionRatio??r.subscriptionRate);
  const calculatedSubscription=offered&&bid?Number((bid/offered).toFixed(4)):null;
  const subscription=reportedSubscription!=null&&reportedSubscription>0?Number(reportedSubscription.toFixed(2)):calculatedSubscription;
  const subscriptionAmount=bid!=null&&bid>0&&upperPrice!=null?Number((bid*upperPrice/10000000).toFixed(2)):null;
  const rawLot=n(r.lotSize??r.bidLot??r.bidLotSize??r.lot??r.marketLot);
  const rawMinimum=n(r.minSubscription??r.minimumApplication??r.minimumInvestment??r.minInvestment??r.minBidValue??r.minimumBidValue);
  const fallbackMinimum=rawMinimum??(rawLot!=null&&upperPrice!=null?Number((rawLot*upperPrice).toFixed(2)):null);
  return {
    officialWebsite:null,prospectusUrl:null,prospectusType:null,
    symbol:r.symbol??undefined,nseSymbol:r.isBse==="1"?undefined:(r.symbol??undefined),bseScripCode:r.scripCode??r.scripcode??undefined,bseSymbol:r.isBse==="1"?(r.symbol??undefined):undefined,exchange:r.isBse==="1"?"BSE India":"NSE India",exchanges:[r.isBse==="1"?"BSE India":"NSE India"],id:slugId(r.companyName||r.symbol||"ipo"),
    name:clean(r.companyName||r.symbol||"IPO"),
    normalizedName:normalizeCompanyName(r.companyName||r.symbol||"IPO"),
    issueDateKey:issueDateKey(date(r.issueStartDate),date(r.issueEndDate)),
    rhpStatus:"NOT_FOUND",
    type:r.series==="SME"?"SME":"Mainboard",
    openDate:date(r.issueStartDate),closeDate:date(r.issueEndDate),listingDate:null,
    issueSize:null,minSubscription:fallbackMinimum,subscription,subscriptionAmount,subscriptionSource:r.isBse==="1"?"BSE India":"NSE India",
    subscriptionCategories:[],gmpPct:null,gmpRs:null,gmpSources:[],gmpVerifiedSources:[],
    city:null,state:null,business:null,promoters:[],segments:[],competitors:[],countries:[],revenues:[],profits:[],eps:[],
    priceBand:band(r.issuePrice),lotSize:rawLot,faceValue:null,
    sharesOffered:n(r.noOfSharesOffered),offeredToPublic:null,retailShares:null,qibShares:null,niiShares:null,
    freshIssue:null,offerForSale:null,issueType:null,objects:[],risks:[],
    promoterHolding:null,postIssuePromoterHolding:null,moneycontrolUrl:null,
    detailSource:null,verifiedSources:[],sourceUrls:[],
    verifiedAt:new Date().toISOString()
  };
}
async function enrichNse(ipo:Ipo,cookie:string){
  try{
    const series=ipo.type==="SME"?"SME":"EQ";
    const symbol=String(ipo.symbol??"");
    if(!symbol)return ipo;
    const d=await fetchNse("/api/ipo-detail?symbol="+encodeURIComponent(symbol)+"&series="+series,cookie);
    const info=parseInfo(d?.issueInfo?.dataList??[]);
    const period=info["Issue Period"]?.match(/(\d{2}-\w{3}-\d{4})\s*to\s*(\d{2}-\w{3}-\d{4})/i);
    if(period){ipo.openDate=date(period[1]);ipo.closeDate=date(period[2]);}
    ipo.priceBand=band(info["Price Range"])||ipo.priceBand;
    const lot=info["Bid Lot"]?.match(/([\d,]+)\s*(?:Equity\s+Shares|shares)/i)??info["Bid Lot"]?.match(/([\d,]+)/i);
    ipo.lotSize=n(lot?.[1])??ipo.lotSize;
    ipo.faceValue=n(info["Face Value"]?.match(/[\d,.]+/)?.[0])??ipo.faceValue;
    ipo.issueSize=issueSizeCr(info["Issue Size"])??ipo.issueSize;
    const high=upper(info["Price Range"]);
    const low=clean(info["Price Range"]).match(/(?:Rs\.?|₹)?\s*([\d,.]+)\s*(?:-|to|–)/i);
    const lowPrice=n(low?.[1]);
    const applicationPrice=high??lowPrice;
    const reportedMinimum=n(
      info["Minimum Application"]??info["Minimum Investment"]??info["Min Investment"]??
      info["Minimum Bid Value"]??info["Min Bid Value"]
    );
    if(reportedMinimum!=null&&reportedMinimum>0){
      ipo.minSubscription=reportedMinimum;
    }else if(ipo.lotSize&&applicationPrice){
      // Artha's list fallback is deliberately deterministic:
      // upper price band × one lot, exactly matching the UI note.
      ipo.minSubscription=Number((ipo.lotSize*applicationPrice).toFixed(2));
    }
    const cats=rowsFromCategory(d?.activeCat);
    const grouped=new Map<string,Array<{label:string;row:any;value:number|null}>>();
    for(const row of cats){
      if(!row||row.srNo==="Sr.No.")continue;
      const label=clean(row.category??row.Category??row.investorCategory??row.name).toLowerCase();
      if(label.includes("total")&&!label.includes("qib")&&!label.includes("nii")){
        const total=n(row.noOfTotalMeant??row.noOfTime??row.noOfTimes??row.subscription??row.subscriptionRatio??row.subscriptionRate);
        if(total!=null&&total>0)ipo.subscription=Number(total.toFixed(2));
        continue;
      }
      const category=label.includes("qualified")||label.includes("qib")?"QIB"
        :label.includes("non institutional")||label.includes("non-institutional")||label.includes("nii")||label.includes("hni")?"NII"
        :label.includes("retail")||label.includes("individual")?"Retail":null;
      if(!category)continue;
      const valueRaw=n(row.noOfTotalMeant??row.noOfTime??row.noOfTimes??row.subscription??row.subscriptionRatio??row.subscriptionRate);
      const rows=grouped.get(category)??[];
      rows.push({label,row,value:valueRaw==null?null:Number(valueRaw.toFixed(2))});
      grouped.set(category,rows);
    }
    const valueFor=(rows:Array<{label:string;row:any;value:number|null}>):number|null=>{
      if(!rows.length)return null;
      const exact=rows.find(x=>{
        const label=x.label.replace(/[^a-z]/g,"");
        return label==="qib"||label==="qualifiedinstitutionalbuyers"||label==="nii"||label==="noninstitutional"||label==="retail"||label==="retailindividual";
      });
      if(exact)return exact.value;
      const unique=[...new Set(rows.map(x=>x.value).filter((v):v is number=>v!=null))];
      if(unique.length===1)return unique[0];
      const shareTotals=rows.reduce((acc,x)=>{
        const offered=n(x.row.noOfSharesOffered??x.row.sharesOffered??x.row.noOfSharesReserved);
        const bid=n(x.row.noOfsharesBid??x.row.noOfSharesBid??x.row.sharesBid);
        if(offered!=null&&bid!=null&&offered>0){acc.offered+=offered;acc.bid+=bid;acc.usable=true;}
        return acc;
      },{offered:0,bid:0,usable:false});
      return shareTotals.usable?Number((shareTotals.bid/shareTotals.offered).toFixed(2)):null;
    };
    ipo.subscriptionCategories=["QIB","NII","Retail"].filter(category=>grouped.has(category)).map(category=>({category,value:valueFor(grouped.get(category)??[])}));
    // Some NSE responses expose only the total multiple outside activeCat.
    if(ipo.subscription==null){
      const totalRows=rowsFromCategory(d?.subscriptionData??d?.subscription??d?.data);
      for(const row of totalRows){
        const label=clean(row?.category??row?.name).toLowerCase();
        if(label.includes("total")){
          const value=n(row?.noOfTime??row?.noOfTimes??row?.subscription??row?.subscriptionRatio??row?.subscriptionRate);
          if(value!=null){ipo.subscription=Number(value.toFixed(2));break;}
        }
      }
    }
    const bidRows=rowsFromNse(d?.bidDetails??d?.subscriptionData??d?.biddingData);
    const bidShares=bidRows.reduce((sum,row)=>sum+(n(row?.noOfsharesBid??row?.noOfSharesBid??row?.sharesBid)??0),0);
    if(bidShares>0&&high)ipo.subscriptionAmount=Number((bidShares*high/10000000).toFixed(2));
    if(ipo.subscriptionAmount==null&&ipo.subscription!=null&&ipo.sharesOffered!=null&&high){
      const estimatedBidShares=ipo.sharesOffered*ipo.subscription;
      ipo.subscriptionAmount=Number((estimatedBidShares*high/10000000).toFixed(2));
    }
    // Never replace a verified live total with an empty/detail value. If detail exposes
    // the total, accept it; otherwise retain the value calculated directly from the
    // official current-issue feed (bid shares / offered shares).
    const directBid=n((d as any)?.noOfsharesBid??(d as any)?.noOfSharesBid??(d as any)?.sharesBid);
    const directOffered=n((d as any)?.noOfSharesOffered??(d as any)?.sharesOffered);
    const directMultiple=n((d as any)?.noOfTime??(d as any)?.noOfTimes??(d as any)?.subscription);
    if(directMultiple!=null&&directMultiple>0)ipo.subscription=Number(directMultiple.toFixed(2));
    else if(ipo.subscription==null&&directBid!=null&&directOffered!=null&&directOffered>0)ipo.subscription=Number((directBid/directOffered).toFixed(2));
    ipo.subscriptionSource="NSE India";
    ipo.detailSource=NSE_PAGE;
    ipo.verifiedSources=["NSE India"];
    ipo.sourceUrls=[NSE_PAGE];
    ipo.verifiedAt=new Date().toISOString();
  }catch{
    // Never substitute third-party suggestions or hard-coded IPO values.
  }
  return ipo;
}
async function loadNse(){
  const cookie=await nseSession();
  let current:any=null;
  let upcoming:any=null;
  try{
    [current,upcoming]=await Promise.all([
      fetchNse("/api/ipo-current-issue",cookie),
      fetchNse("/api/all-upcoming-issues?category=ipo",cookie)
    ]);
  }catch{
    // If one NSE endpoint fails, keep trying the other endpoint instead of returning a blank IPO page.
    try{ current=await fetchNse("/api/ipo-current-issue",cookie); }catch{}
    try{ upcoming=await fetchNse("/api/all-upcoming-issues?category=ipo",cookie); }catch{}
  }
  const today=new Date().toISOString().slice(0,10);
  const map=new Map<string,Ipo>();
  const canonicalRecords:Ipo[]=[];
  for(const r of [...rowsFromNse(current),...rowsFromNse(upcoming)]){
    if(!r?.companyName && !r?.symbol && !r?.company)continue;
    if(!r.companyName && r.company) r.companyName=r.company;
    const ipo=baseNse(r);
    ipo.minSubscription=n(
      r.minSubscription??r.minimumApplication??r.minimumInvestment??r.minInvestment??
      r.minBidValue??r.minimumBidValue
    )??ipo.minSubscription;
    if(ipo.closeDate&&ipo.closeDate<today)continue;

    const key=buildCanonicalKey(ipo);
    const exact=map.get(key);
    if(exact){
      map.set(key,mergeIpoRecords(exact,ipo));
      continue;
    }
    // Secondary reconciliation is deliberately strict: company identity AND issue date
    // must agree. This prevents unrelated IPOs from being silently merged.
    const related=canonicalRecords.find(existing=>sameCompanyIssue(existing,ipo));
    if(related){
      const merged=mergeIpoRecords(related,ipo);
      const relatedKey=buildCanonicalKey(related);
      map.set(relatedKey,merged);
      canonicalRecords[canonicalRecords.indexOf(related)]=merged;
    }else{
      map.set(key,ipo);
      canonicalRecords.push(ipo);
    }
  }
  const base=[...map.values()].filter(x=>!!x.name&&!!x.closeDate&&x.closeDate>=today);

  // Enrich OPEN issues from NSE detail in a bounded, failure-safe way. The official
  // current-issue feed remains the source of truth for names/subscription, while detail
  // supplies lot size/minimum application and category data when NSE exposes it.
  // A slow detail endpoint can never blank or block the IPO list.
  const active=base.filter(x=>isNseOpen(x,today)&&x.symbol).slice(0,16);
  const enriched=await Promise.all(active.map(async ipo=>{
    try{
      return await Promise.race([
        enrichNse({...ipo},cookie),
        new Promise<Ipo>(resolve=>setTimeout(()=>resolve(ipo),9000))
      ]);
    }catch{return ipo;}
  }));
  const byId=new Map(enriched.map(x=>[x.id,x]));
  const liveBase=base.map(x=>byId.get(x.id)??x);
  // Populate GMP on the IPO list itself. Each source is optional: if a publisher
  // has no GMP for an issue, it is skipped; available sources are combined and
  // converted to a percentage using the upper price band.
  const gmpCandidates=liveBase.filter(x=>x.symbol);
  const gmpEnriched=await Promise.all(gmpCandidates.map(async ipo=>{
    try{
      return await Promise.race([
        enrichGmp({...ipo}),
        new Promise<Ipo>(resolve=>setTimeout(()=>resolve(ipo),30000))
      ]);
    }catch{return ipo;}
  }));
  const gmpById=new Map(gmpEnriched.map(x=>[x.id,x]));
  return liveBase.map(x=>gmpById.get(x.id)??x)
    .filter(x=>!!x.name&&!!x.closeDate&&x.closeDate>=today)
    .sort((a,b)=>(a.openDate??"").localeCompare(b.openDate??"")||a.name.localeCompare(b.name));
}
function isNseOpen(ipo:Ipo,today:string){
  return !!ipo.openDate&&ipo.openDate<=today&&!!ipo.closeDate&&ipo.closeDate>=today;
}
export const fetchOpenIposLive=createServerFn({method:"GET"}).handler(async()=>{
  const hit=cache.get("nse");
  if(hit&&hit.expires>Date.now())return hit.value;
  try{
    const value=await loadNse();
    cache.set("nse",{expires:Date.now()+CACHE_MS,value});
    return value;
  }catch{
    const empty:Ipo[]=[];
    cache.set("nse",{expires:Date.now()+2000,value:empty});
    return empty;
  }
});

export const fetchIpoDetailFast=createServerFn({method:"GET"}).inputValidator((data:{id:string})=>data).handler(async({data}:{data:{id:string}})=>{
  const list=await loadNse();
  const ipo=list.find(x=>x.id===data.id);
  if(!ipo)return null;
  return {...ipo,rhpStatus:ipo.rhpStatus??"NOT_FOUND"};
});

export const fetchIpoDetailLive=createServerFn({method:"GET"}).inputValidator((data:{id:string})=>data).handler(async({data}:{data:{id:string}})=>{
  const list=await loadNse();
  const ipo=list.find(x=>x.id===data.id);
  if(!ipo)return null;
  try{
    // Enrichment is explicitly non-critical. The fast endpoint above supplies the
    // primary exchange data immediately; this tier hydrates GMP/RHP/research fields.
    return await Promise.race([
      universalResearch({...ipo}),
      new Promise<Ipo>(resolve=>setTimeout(()=>resolve(ipo),9000))
    ]);
  }catch{return ipo;}
});

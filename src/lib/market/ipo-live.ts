import { createServerFn } from "@tanstack/react-start";
import { loadIpoEnriched, loadIpoFast, loadIpoUniverse } from "@/lib/ipo/engine";
type Ipo={nseSymbol?:string|null;bseScripCode?:string|null;bseSymbol?:string|null;normalizedName:string;issueDateKey:string|null;rhpStatus:"NOT_FOUND"|"DISCOVERED_UNPARSED"|"PARSED"|"PARSE_FAILED";officialWebsite?:string|null;prospectusUrl?:string|null;rhpUrl?:string|null;drhpUrl?:string|null;prospectusType?:"DRHP"|"RHP"|"Prospectus"|"Abridged Prospectus"|null;symbol?:string;exchange?:"NSE India"|"BSE India"|"BOTH"|"UNKNOWN";exchanges:string[];id:string;name:string;type:"Mainboard"|"SME";openDate:string|null;closeDate:string|null;listingDate:string|null;issueSize:number|null;minSubscription:number|null;verifiedMinApplication:number|null;subscription:number|null;subscriptionAmount:number|null;subscriptionSource:string|null;subscriptionCategories:{category:string;value:number|null}[];gmpPct:number|null;gmpRs:number|null;gmpSources:{source:string;url:string|null;pct:number|null;rs:number|null;asOf:string|null}[];gmpVerifiedSources:string[];city:string|null;state:string|null;business:string|null;businessModel:string|null;revenueSources:Array<{segment:string;amount:number|null;percentage:number|null}>;domesticRevenuePercent:number|null;exportRevenuePercent:number|null;sector:string|null;products:string[];services:string[];businessLocations:string[];registeredOffice:string|null;corporateOffice:string|null;promoters:string[];segments:string[];competitors:string[];customerType:string|null;customerConcentration:string|null;customerCategories:string[];industriesServed:string[];geographicPresence:string[];domesticMarket:boolean|null;exportMarket:boolean|null;b2b:boolean|null;b2c:boolean|null;leadManagers:string[];registrar?:string|null;registrarAddress?:string|null;registrarEmail?:string|null;registrarPhone?:string|null;sponsorBank?:string|null;marketMaker?:string|null;registrarWebsite?:string|null;allotmentCheckUrl?:string|null;scsbListUrl?:string|null;documents:{label:string;url:string;source:string}[];countryCount?:number|null;countries:{country:string;business:string;salesPct:number|null}[];revenues:{year:string;value:number|null}[];profits:{year:string;value:number|null}[];eps:{year:string;value:number|null}[];priceBand:string|null;lotSize:number|null;faceValue:number|null;sharesOffered:number|null;offeredToPublic:number|null;retailShares:number|null;qibShares:number|null;niiShares:number|null;freshIssue:number|null;freshIssueShares:number|null;offerForSale:number|null;offerForSaleShares:number|null;issueType:string|null;financials:{year:string;revenue:number|null;ebitda:number|null;pat:number|null;eps:number|null;debt:number|null;netWorth:number|null;assets:number|null;roe:number|null;roce:number|null;source:string|null}[];objects:string[];risks:string[];promoterHolding:number|null;postIssuePromoterHolding:number|null;moneycontrolUrl:string|null;detailSource:string|null;verifiedSources:string[];sourceUrls:string[];verifiedAt:string};
const NSE = "https://www.nseindia.com";
const NSE_PAGE = "https://www.nseindia.com/market-data/all-upcoming-issues-ipo";
const cache=new Map<string,{expires:number;value:Ipo[]}>();
const CACHE_MS=30000;
function clean(v:unknown){return String(v??"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
function firstNumber(text:string,patterns:RegExp[]){for(const pattern of patterns){const m=text.match(pattern);if(m){const v=n(m[1]);if(v!=null)return v;}}return null;}
function n(v:unknown){if(v==null||v==="")return null;const x=Number(String(v).replace(/,/g,"").replace(/%/g,"").trim());return Number.isFinite(x)?x:null;}
function date(v:unknown){
  const s=clean(v);
  if(!s)return null;
  const iso=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(iso)return iso[1]+"-"+String(Number(iso[2])).padStart(2,"0")+"-"+String(Number(iso[3])).padStart(2,"0");
  const dmy=s.match(/^(\d{1,2})[-\\/ ](\w{3,})[-\\/ ](\d{4})$/i);
  if(dmy){
    const months=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const mi=months.indexOf(dmy[2].slice(0,3).toLowerCase());
    if(mi>=0)return dmy[3]+"-"+String(mi+1).padStart(2,"0")+"-"+String(Number(dmy[1])).padStart(2,"0");
  }
  const d=s.match(/^(\d{1,2})[-\\/](\d{1,2})[-\\/](\d{4})$/);
  if(d)return d[3]+"-"+String(Number(d[2])).padStart(2,"0")+"-"+String(Number(d[1])).padStart(2,"0");
  const parsed=new Date(s);
  return Number.isNaN(parsed.getTime())?null:parsed.toISOString().slice(0,10);
}
function indiaDateKey(now=new Date()){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}
function band(v:unknown){const s=clean(v);const m=s.match(/(?:Rs\.?|₹)\s*([\d,.]+)\s*(?:-|to|–)\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i);return m?"₹"+Number(m[1].replace(/,/g,"")).toLocaleString("en-IN")+" - ₹"+Number(m[2].replace(/,/g,"")).toLocaleString("en-IN"):s||null;}
function upper(v:unknown){const s=clean(v);const m=s.match(/(?:-|to|–)\s*(?:Rs\.?|₹)?\s*([\d,.]+)/i);return m?n(m[1]):null;}
function slugId(v:string){return clean(v).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"ipo";}
const HEADERS={
  "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  Accept:"application/json, text/plain, */*",
  "Accept-Language":"en-US,en;q=0.9",
  Referer:NSE_PAGE
};


const EXTERNAL_TIMEOUT_MS=7000;
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
  const merged:{[key:string]:any}={...existing};
  for(const [key,value] of Object.entries(incoming as Record<string,unknown>)){
    if(value===null||value===undefined)continue;
    if(Array.isArray(value)&&value.length===0)continue;
    merged[key]=value;
  }
  const exchanges=[...(existing.exchanges??[]),...(incoming.exchanges??[])];
  const hasNse=!!(existing.nseSymbol||incoming.nseSymbol);
  const hasBse=!!(existing.bseScripCode||incoming.bseScripCode||existing.bseSymbol||incoming.bseSymbol);
  merged.id=existing.id;
  merged.name=existing.name||incoming.name;
  merged.nseSymbol=existing.nseSymbol||incoming.nseSymbol;
  merged.bseScripCode=existing.bseScripCode||incoming.bseScripCode;
  merged.bseSymbol=existing.bseSymbol||incoming.bseSymbol;
  merged.normalizedName=existing.normalizedName||incoming.normalizedName;
  merged.issueDateKey=existing.issueDateKey||incoming.issueDateKey;
  merged.exchanges=[...new Set(exchanges)];
  merged.exchange=hasNse&&hasBse?"BOTH":(hasNse?"NSE India":hasBse?"BSE India":"UNKNOWN");
  merged.verifiedSources=[...new Set([...(existing.verifiedSources??[]),...(incoming.verifiedSources??[])])];
  merged.sourceUrls=[...new Set([...(existing.sourceUrls??[]),...(incoming.sourceUrls??[])])];
  return merged as Ipo;
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
  {name:"Angel One",hosts:["angelone.in"],priority:72},
  {name:"Yahoo Finance",hosts:["finance.yahoo.com"],priority:72},
  {name:"Upstox",hosts:["upstox.com"],priority:70},
  {name:"5paisa",hosts:["5paisa.com"],priority:69},
  {name:"ICICI Direct",hosts:["icicidirect.com"],priority:69},
  {name:"HDFC Securities",hosts:["hdfcsec.com"],priority:69},
  {name:"Kotak Neo",hosts:["kotaksecurities.com","kotakneo.com"],priority:69},
  {name:"Motilal Oswal",hosts:["motilaloswal.com"],priority:69},
  {name:"IIFL Securities",hosts:["indiainfoline.com","iifl.com"],priority:69},
  {name:"SBI Securities",hosts:["sbisecurities.in"],priority:69},
  {name:"Sharekhan",hosts:["sharekhan.com"],priority:69},
  {name:"Nuvama",hosts:["nuvamawealth.com"],priority:69},
  {name:"Dhan",hosts:["dhan.co"],priority:69},
  {name:"Paytm Money",hosts:["paytmmoney.com"],priority:69},
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
type ResearchQuestionKey="Q1"|"Q2"|"Q3"|"Q4"|"Q5"|"Q6"|"Q7"|"Q8"|"Q9";

const QUESTION_QUERIES:Record<ResearchQuestionKey,string[]>={
  Q1:["IPO company overview official offer details RHP DRHP company profile"],
  Q2:["IPO registered office location sector products services business segments"],
  Q3:["IPO main business what company does products services customers revenue model"],
  Q4:["IPO countries exports domestic sales geographic revenue country wise sales"],
  Q5:["IPO financials FY2026 FY2025 FY2024 revenue profit EPS restated financial statements"],
  Q6:["IPO price band lot size issue size fresh issue OFS allocation promoter holding subscription"],
  Q7:["IPO objects of issue use of proceeds capex risks risk factors"],
  Q8:["IPO GMP grey market premium latest GMP today"],
  Q9:["IPO registrar lead manager BRLM sponsor bank market maker contact details"]
};

const QUESTION_SOURCE_RULES=SOURCE_RULES.filter(x=>x.hosts.length).map(x=>({
  ...x,
  // One canonical host per source brand keeps the matrix complete without
  // multiplying requests for the same publisher.
  host:x.hosts[0]
}));

async function mapWithConcurrency<T,R>(items:T[],limit:number,fn:(item:T)=>Promise<R>):Promise<R[]>{
  const out:R[]=new Array(items.length);
  let cursor=0;
  const worker=async()=>{
    while(true){
      const i=cursor++;
      if(i>=items.length)return;
      try{out[i]=await fn(items[i]);}catch{out[i]=null as R;}
    }
  };
  await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker()));
  return out;
}

async function researchQuestion(ipo:Ipo,key:ResearchQuestionKey):Promise<ResearchHit[]>{
  const name=ipo.name.replace(/\b(IPO|LIMITED|LTD\.?|PRIVATE|PVT\.?)\b/gi," ").replace(/\s+/g," ").trim();
  const suffix=QUESTION_QUERIES[key][0];
  // QUESTION-FIRST MATRIX:
  // Q1 is independently sent to every source, then Q2 is independently sent
  // to every source, and so on through Q9. We do not first build one pooled
  // page list and then try to answer all nine questions from that cap.
  const jobs=QUESTION_SOURCE_RULES.map(rule=>({
    rule,
    query:name+" "+suffix+" site:"+rule.host
  }));
  const found=await mapWithConcurrency(jobs,12,async job=>{
    const urls=await researchSearch(job.query);
    const candidates=[...new Set(urls)].filter(u=>{
      const d=domainOf(u);
      return d===job.rule.host||d.endsWith("."+job.rule.host);
    }).slice(0,1);
    for(const url of candidates){
      const text=await readResearchUrl(url);
      if(text.length>=80)return {
        url,domain:domainOf(url),
        title:text.split("\\n").find(line=>line.trim())?.trim()??job.rule.name,
        text,priority:job.rule.priority
      } as ResearchHit;
    }
    return null;
  });
  const hits=found.filter((x):x is ResearchHit=>!!x);
  // Also ask the web-wide index for the same question. This catches an issuer
  // page or a secondary source that is not indexed under one of the named
  // publisher domains, while the source matrix above remains the primary path.
  const broad=await researchSearch(name+" "+suffix);
  const extra=await mapWithConcurrency([...new Set(broad)].slice(0,10),4,async url=>{
    if(/facebook|instagram|youtube|linkedin|x\\.com|twitter\\.com/i.test(url))return null;
    const text=await readResearchUrl(url);
    return text.length>=80?{
      url,domain:domainOf(url),
      title:text.split("\\n").find(line=>line.trim())?.trim()??sourceName(url),
      text,priority:sourcePriority(url)
    } as ResearchHit:null;
  });
  for(const h of extra.filter((x):x is ResearchHit=>!!x)){
    if(!hits.some(x=>x.url===h.url))hits.push(h);
  }
  return hits.sort((a,b)=>b.priority-a.priority);
}

async function researchHitsByQuestion(ipo:Ipo):Promise<Record<ResearchQuestionKey,ResearchHit[]>>{
  const keys:ResearchQuestionKey[]=["Q1","Q2","Q3","Q4","Q5","Q6","Q7","Q8","Q9"];
  const result={} as Record<ResearchQuestionKey,ResearchHit[]>;
  // Deliberately sequential: finish the complete source matrix for Q1 before
  // starting Q2, then Q3 ... Q9. Each question gets its own independent evidence.
  for(const key of keys) result[key]=await researchQuestion(ipo,key);
  return result;
}

function applyQuestionResearch(ipo:Ipo,key:ResearchQuestionKey,hits:ResearchHit[]){
  if(!hits.length)return;
  // Run the existing robust extractor against this question's evidence only,
  // then copy back ONLY fields belonging to that question. This prevents a
  // Q2 business page from silently overwriting Q5 financials, etc.
  const draft={...ipo,
    promoters:[...ipo.promoters],segments:[...ipo.segments],competitors:[...ipo.competitors],
    leadManagers:[...ipo.leadManagers],documents:[...ipo.documents],customerCategories:[...ipo.customerCategories],businessLocations:[...ipo.businessLocations],financials:[...ipo.financials],
    countries:[...ipo.countries],revenues:[...ipo.revenues],profits:[...ipo.profits],eps:[...ipo.eps],
    objects:[...ipo.objects],risks:[...ipo.risks]
  };
  applyResearchText(draft,hits);
  switch(key){
    case "Q1":
      ipo.city=draft.city; ipo.state=draft.state; ipo.promoters=draft.promoters;
      break;
    case "Q2":
      ipo.city=draft.city; ipo.state=draft.state; ipo.business=draft.business; ipo.businessModel=draft.businessModel; ipo.sector=draft.sector; ipo.products=draft.products; ipo.services=draft.services; ipo.businessLocations=draft.businessLocations; ipo.registeredOffice=draft.registeredOffice; ipo.corporateOffice=draft.corporateOffice; ipo.segments=draft.segments; ipo.promoters=draft.promoters;
      break;
    case "Q3":
      ipo.business=draft.business; ipo.customerType=draft.customerType; ipo.customerConcentration=draft.customerConcentration; ipo.customerCategories=draft.customerCategories; ipo.industriesServed=draft.industriesServed; ipo.geographicPresence=draft.geographicPresence; ipo.domesticMarket=draft.domesticMarket; ipo.exportMarket=draft.exportMarket; ipo.b2b=draft.b2b; ipo.b2c=draft.b2c; ipo.promoters=draft.promoters; ipo.competitors=draft.competitors; ipo.countries=draft.countries; ipo.countryCount=draft.countryCount;
      break;
    case "Q4":
      ipo.countryCount=draft.countryCount; ipo.countries=draft.countries; ipo.revenueSources=draft.revenueSources; ipo.domesticRevenuePercent=draft.domesticRevenuePercent; ipo.exportRevenuePercent=draft.exportRevenuePercent;
      ipo.revenues=draft.revenues;
      break;
    case "Q5":
      ipo.revenues=draft.revenues; ipo.profits=draft.profits; ipo.eps=draft.eps; ipo.financials=draft.financials;
      break;
    case "Q6":
      ipo.promoterHolding=draft.promoterHolding; ipo.postIssuePromoterHolding=draft.postIssuePromoterHolding; ipo.sharesOffered=draft.sharesOffered; ipo.freshIssue=draft.freshIssue; ipo.freshIssueShares=draft.freshIssueShares; ipo.offerForSale=draft.offerForSale; ipo.offerForSaleShares=draft.offerForSaleShares;
      break;
    case "Q7":
      ipo.objects=draft.objects; ipo.risks=draft.risks;
      break;
    case "Q8":
      // GMP has its own dedicated multi-source enrichment below.
      break;
    case "Q9":
      ipo.leadManagers=draft.leadManagers;
      ipo.registrar=draft.registrar; ipo.registrarAddress=draft.registrarAddress; ipo.registrarEmail=draft.registrarEmail;
      ipo.registrarPhone=draft.registrarPhone; ipo.sponsorBank=draft.sponsorBank; ipo.marketMaker=draft.marketMaker;
      break;
  }
}

function flattenQuestionHits(byQuestion:Record<ResearchQuestionKey,ResearchHit[]>):ResearchHit[]{
  const all=Object.values(byQuestion).flat();
  return [...new Map(all.map(h=>[h.url,h])).values()].sort((a,b)=>b.priority-a.priority);
}

function applyResearchText(ipo:Ipo,hits:ResearchHit[]){
  const official=hits.filter(h=>h.priority>=96);
  const all=hits.map(h=>h.text).join("\n");
  const officialText=official.map(h=>h.text).join("\n");
  const text=officialText||all;
  const business=firstText(all,[
    /(?:business of the company|our business|company is engaged in|we are engaged in|business overview|nature of business|principal business activities?)[:\s]+([^\n]{40,900})/i,
    /(?:the company|our company|company)\s+(?:is|are)\s+(?:primarily\s+|mainly\s+|principally\s+)?engaged\s+in\s+([^\n.]{40,900})/i,
    /(?:the company|our company|company)\s+(?:operates|functions)\s+as\s+(?:an?\s+)?([^\n.]{40,700})/i,
    /(?:about [^\n]{0,100}|products and services|business model|what the company does)[:\s]+([^\n]{40,900})/i
  ]);
  if(business)ipo.business=business;
  const domesticPct=firstNumber(all,[/(?:domestic sales|domestic revenue|revenue from domestic|domestic)[:\s-]*([0-9]+(?:\.[0-9]+)?)\s*%/i]);
  const exportPct=firstNumber(all,[/(?:export sales|export revenue|revenue from exports?|exports?)[:\s-]*([0-9]+(?:\.[0-9]+)?)\s*%/i]);
  if(domesticPct!=null&&domesticPct<=100)ipo.domesticRevenuePercent=domesticPct;
  if(exportPct!=null&&exportPct<=100)ipo.exportRevenuePercent=exportPct;
  const segmentPattern=/(?:revenue|sales)[^\n]{0,80}?([A-Za-z][A-Za-z &/-]{2,70})\s*[:\-]\s*(?:₹|Rs\.?\s*)?([0-9][0-9,]*(?:\.\d+)?)\s*(?:crore|cr|%)/gi;
  const segmentRows:Array<{segment:string;amount:number|null;percentage:number|null}>=[];
  for(const m of all.matchAll(segmentPattern)){
    const segment=clean(m[1]); const raw=Number(String(m[2]).replace(/,/g,""));
    if(segment&&segment.length<80&&Number.isFinite(raw))segmentRows.push({segment,amount:/crore|cr/i.test(m[0])?raw*10000000:null,percentage:/%/.test(m[0])?raw:null});
  }
  if(segmentRows.length)ipo.revenueSources=[...new Map(segmentRows.map(x=>[x.segment.toLowerCase(),x])).values()].slice(0,15);
  const office=firstText(officialText||all,[/(?:registered and corporate office|registered office|corporate office)[:\s]+([^\n]{20,220})/i]);
  const registeredOffice=firstText(officialText||all,[/(?:registered office)[:\s]+([^\n]{20,220})/i]);
  const corporateOffice=firstText(officialText||all,[/(?:corporate office)[:\s]+([^\n]{20,220})/i]);
  const businessModel=firstText(all,[/(?:business model|business model of the company)[:\s]+([^\n]{30,700})/i]);
  const servicesText=firstText(all,[/(?:services?|service portfolio|key services?)[:\s]+([^\n]{20,500})/i]);
  if(registeredOffice)ipo.registeredOffice=registeredOffice;
  if(corporateOffice)ipo.corporateOffice=corporateOffice;
  if(businessModel)ipo.businessModel=businessModel;
  if(servicesText)ipo.services=[...new Set(servicesText.split(/,|;|\|/).map(clean).filter(x=>x.length>2))].slice(0,12);
  if(office){
    const parts=office.split(",").map(x=>x.trim()).filter(Boolean);
    if(parts.length>1)ipo.city=parts[parts.length-2]||ipo.city;
    ipo.state=parts[parts.length-1]||ipo.state;
  }
  const sector=firstText(all,[/(?:industry|sector|industry classification)[:\s]+([^\n]{10,160})/i]);
  if(sector)ipo.sector=sector;
  if(sector && !ipo.segments.length)ipo.segments=[sector];
  const productText=firstText(all,[/(?:products?|product portfolio|product range|key products?)[:\s]+([^\n]{20,500})/i]);
  if(productText){
    ipo.products=[...new Set([...ipo.products,...productText.split(/,|;|\|/).map(clean).filter(x=>x.length>2)])].slice(0,15);
    ipo.segments=[...new Set([...ipo.segments,productText])];
  }
  const rev=numberList(all,[/(?:revenue from operations|revenue|turnover)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);  const ebitda=numberList(all,[/(?:EBITDA|EBITDA margin)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr|%)/gi]);
  const roe=numberList(all,[/(?:ROE|return on equity)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*%/gi]);
  const roce=numberList(all,[/(?:ROCE|return on capital employed)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*%/gi]);
  const debt=numberList(all,[/(?:total debt|net debt|borrowings|debt)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);
  const netWorth=numberList(all,[/(?:net worth|networth)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);
  const assets=numberList(all,[/(?:total assets|assets)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);
  const finYears=years.length?years:["FY1","FY2","FY3"];
  ipo.financials=finYears.map((year,i)=>({year,revenue:rev[i]??null,ebitda:ebitda[i]??null,pat:prof[i]??null,eps:eps[i]??null,debt:debt[i]??null,netWorth:netWorth[i]??null,assets:assets[i]??null,roe:roe[i]??null,roce:roce[i]??null,source:sourceName(hits[0]?.url??"")})).filter(x=>x.revenue!=null||x.pat!=null||x.eps!=null||x.ebitda!=null||x.debt!=null||x.netWorth!=null||x.assets!=null||x.roe!=null||x.roce!=null);
  const freshAmount=firstNumber(all,[/(?:fresh issue|fresh equity issue)[^₹\d]{0,80}(?:₹|Rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/i]);
  const freshShares=firstNumber(all,[/(?:fresh issue|fresh equity issue)[^\d]{0,120}([\d,]+(?:\.\d+)?)\s*(?:equity )?shares?/i]);
  const ofsAmount=firstNumber(all,[/(?:offer for sale|OFS)[^₹\d]{0,80}(?:₹|Rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/i]);
  const ofsShares=firstNumber(all,[/(?:offer for sale|OFS)[^\d]{0,120}([\d,]+(?:\.\d+)?)\s*(?:equity )?shares?/i]);
  if(freshAmount!=null)ipo.freshIssue=freshAmount;
  if(freshShares!=null)ipo.freshIssueShares=freshShares;
  if(ofsAmount!=null)ipo.offerForSale=ofsAmount;
  if(ofsShares!=null)ipo.offerForSaleShares=ofsShares;

  const prof=numberList(all,[/(?:profit after tax|profit for the year|net profit|PAT)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);
  const eps=numberList(all,[/(?:basic EPS|diluted EPS|earnings per share|EPS)[^\d]{0,60}([\d,]+(?:\.\d+)?)/gi]);
  const years=[...new Set([...all.matchAll(/\b20(?:2[2-9]|3[0-9])\b/g)].map(m=>m[0]))].slice(-3);
  if(rev.length)ipo.revenues=rev.map((value,i)=>({year:years[years.length-rev.length+i]??String(i+1),value}));
  if(prof.length)ipo.profits=prof.map((value,i)=>({year:years[years.length-prof.length+i]??String(i+1),value}));
  if(eps.length)ipo.eps=eps.map((value,i)=>({year:years[years.length-eps.length+i]??String(i+1),value}));
  const objects=[...all.matchAll(/(?:objects of the issue|utilisation of proceeds|use of proceeds|objects of offer)(?:.|\\n){0,80}?(?:₹|Rs\.?)[^\\n]{0,80}?([^\\n]{20,500})/gi)].slice(0,8).map(m=>clean(m[1]));
  const objectHead=all.match(/(?:objects of the issue|utilisation of proceeds|use of proceeds|objects of offer)([\\s\\S]{0,1800})/i);
  if(objectHead?.[1])objects.push(...objectHead[1].split(/\\n/).map(clean).filter(x=>x.length>25&&/₹|Rs\.?|capital|corporate|facility|repay|working capital/i.test(x)).slice(0,8));
  const risks=[...all.matchAll(/(?:key risks|risk factors|risk factors and mitigation)([\\s\\S]{0,1200})/gi)].slice(0,4).flatMap(m=>m[1].split(/\\n/).map(clean).filter(x=>x.length>35)).slice(0,8);
  if(objects.length)ipo.objects=[...new Set(objects)].slice(0,8);
  if(risks.length)ipo.risks=[...new Set(risks)].slice(0,8);

  const promoters = [
    ...[...all.matchAll(/(?:promoters?|promoter group)[^\n:]*[:\-]\s*([^\n]{20,500})/gi)].slice(0,3).map(m=>clean(m[1]))
  ];
  const segments = [
    ...[...all.matchAll(/(?:business segments?|segments?)[^\n:]*[:\-]\s*([^\n]{20,500})/gi)].slice(0,3).map(m=>clean(m[1]))
  ];
  const customerConcentration=firstText(all,[/(?:customer concentration|concentration of customers|top \d+ customers)[^:\n]*[:\-]\s*([^\n]{15,300})/i]);
  const customerCategoriesText=firstText(all,[/(?:customer categories|customer segments|types of customers|customer base)[^:\n]*[:\-]\s*([^\n]{15,500})/i]);
  const locationsText=firstText(all,[/(?:manufacturing locations?|operating locations?|business locations?|facilities|plants)[^:\n]*[:\-]\s*([^\n]{15,500})/i]);
  if(customerCategoriesText)ipo.customerCategories=[...new Set(customerCategoriesText.split(/,|;|\|/).map(clean).filter(x=>x.length>2))].slice(0,15);
  if(locationsText)ipo.businessLocations=[...new Set(locationsText.split(/,|;|\|/).map(clean).filter(x=>x.length>2))].slice(0,20);

  const industriesText=firstText(all,[/(?:industries served|industries we serve|end-user industries)[^:\n]*[:\-]\s*([^\n]{15,400})/i]);
  const geographyText=firstText(all,[/(?:geographic presence|geographical presence|states served|markets served)[^:\n]*[:\-]\s*([^\n]{15,500})/i]);
  if(customerConcentration)ipo.customerConcentration=customerConcentration;
  if(industriesText)ipo.industriesServed=[...new Set(industriesText.split(/,|;|\|/).map(clean).filter(x=>x.length>2))].slice(0,15);
  if(geographyText)ipo.geographicPresence=[...new Set(geographyText.split(/,|;|\|/).map(clean).filter(x=>x.length>2))].slice(0,20);
  const customerFlags=all.toLowerCase();
  if(/\bb2b\b|business[- ]to[- ]business|institutional customers?/.test(customerFlags)){ipo.b2b=true;ipo.customerType=ipo.customerType||"B2B";}
  if(/\bb2c\b|business[- ]to[- ]consumer|retail customers?/.test(customerFlags)){ipo.b2c=true;ipo.customerType=ipo.customerType?ipo.customerType+" / B2C":"B2C";}
  if(/domestic market|domestic sales|within india/.test(customerFlags))ipo.domesticMarket=true;
  if(/export market|exports?|international market/.test(customerFlags))ipo.exportMarket=true;
  const competitors = [
    ...[...all.matchAll(/(?:competitors?|competitive landscape)[^\n:]*[:\-]\s*([^\n]{20,500})/gi)].slice(0,3).map(m=>clean(m[1]))
  ];
  if(promoters.length)ipo.promoters=[...new Set(promoters)];
  if(!ipo.products.length&&productText)ipo.products=[productText];
  if(segments.length)ipo.segments=[...new Set(segments)];
  if(competitors.length)ipo.competitors=[...new Set(competitors)];

  // Universal Q3 fallback: every IPO should get a useful main-business summary
  // whenever reliable research exposes sector/product/segment information. Never
  // invent a business description; derive it only from fields already extracted.
  if(!ipo.business){
    const sectorValue=sector ? clean(sector) : "";
    const productValue=productText ? clean(productText) : "";
    const segmentValue=segments.length ? clean(segments.slice(0,3).join("; ")) : "";
    const pieces=[sectorValue,productValue,segmentValue].filter(Boolean);
    if(pieces.length){
      ipo.business=pieces.length===1
        ? pieces[0]
        : "The company operates in " + pieces[0] + ". Its main products/services or business segments include " + pieces.slice(1).join("; ") + ".";
    }
  }

  const managers=[...all.matchAll(/(?:book running lead managers?|lead managers?|BRLMs?|merchant bankers?)[^\n:\\-]*[:\\-]\s*([^\n]{10,500})/gi)].slice(0,5).map(m=>clean(m[1]));
  const registrar=firstText(all,[/(?:registrar to the issue|registrar)[^\n:]*[:\\-]\s*([^\n]{5,180})/i]);
  const sponsorBank=firstText(all,[/(?:sponsor bank|sponsor banks?)[^\n:]*[:\\-]\s*([^\n]{5,180})/i]);
  const marketMaker=firstText(all,[/(?:market maker|market makers?)[^\n:]*[:\-]\s*([^\n]{5,180})/i]);
  if(managers.length)ipo.leadManagers=[...new Set(managers)];
  if(registrar)ipo.registrar=registrar;
  if(registrarAddress)ipo.registrarAddress=registrarAddress;
  if(sponsorBank)ipo.sponsorBank=sponsorBank;
  if(marketMaker)ipo.marketMaker=marketMaker;
  const promoterPct=firstText(all,[/(?:promoter(?:s)?(?:'s)?|promoter group)[^\\d%]{0,100}(\\d+(?:\\.\\d+)?)\\s*%/i]);
  if(promoterPct)(ipo as any).promoterHolding=n(promoterPct);

  const countryMatch=all.match(/(?:operate|operates|present|presence|export|exports|serves|serve)[^\\n]{0,120}?(?:in|to|across|over)[^\\n]{0,60}?(\\d{1,3})\\s+(?:countries|country)/i);
  const countryNames=[...new Set((all.match(/\\b(?:China|Kuwait|United States|USA|U\.S\.|Malaysia|United Kingdom|UK|U\.K\.|India|Vietnam|UAE|United Arab Emirates|Saudi Arabia|Qatar|Singapore|Bangladesh|Nepal|Oman|Canada|Australia|Japan|South Korea|Thailand)\\b/gi)??[]).map(x=>x.replace(/U\\.S\\./i,"United States").replace(/U\\.K\\./i,"United Kingdom")))];
  if(countryMatch)(ipo as any).countryCount=Number(countryMatch[1]);
  else if(countryNames.length)(ipo as any).countryCount=countryNames.length;
  if(countryNames.length)(ipo as any).countries=countryNames.map(country=>({country,business:"Export / international business",salesPct:null}));
}
function isCompanyOfficialUrl(url:string,name:string){const d=domainOf(url);if(!d||/sebi\.gov\.in|nseindia\.com|bseindia\.com|chittorgarh\.com|moneycontrol\.com|economictimes\.indiatimes\.com|livemint\.com|groww\.in|zerodha\.com|angelone\.in|upstox\.com|investorgain\.com|ipowatch\.in|ipocentral\.in|niftytrader\.in|ipogram\.in|ipoji\.com/.test(d))return false;const tokens=name.toLowerCase().replace(/\b(limited|ltd|private|pvt|ipo)\b/g," ").split(/[^a-z0-9]+/).filter(x=>x.length>=3);return tokens.some(t=>d.includes(t));}
function prospectusTypeFromUrl(url:string,text:string){const s=(url+" "+text).toLowerCase();if(/\bdrhp\b|draft red herring/.test(s))return "DRHP" as const;if(/\brhp\b|red herring prospectus/.test(s))return "RHP" as const;if(/abridged prospectus/.test(s))return "Abridged Prospectus" as const;if(/prospectus/.test(s))return "Prospectus" as const;return null;}
function extractOfficialAndProspectus(ipo:Ipo,hits:ResearchHit[]){const official=hits.find(h=>isCompanyOfficialUrl(h.url,ipo.name));const docs=hits.filter(h=>/sebi\.gov\.in|nseindia\.com|bseindia\.com/.test(h.domain)||/prospectus|rhp|drhp/i.test(h.url+" "+h.text));const uniqueDocs=[...new Map(docs.map(d=>[d.url,d])).values()].slice(0,8);(ipo as any).documents=uniqueDocs.map(d=>({label:prospectusTypeFromUrl(d.url,d.text)??"Source document",url:d.url,source:sourceName(d.url)}));const doc=docs.sort((a,b)=>{const rank=(h:ResearchHit)=>{const t=(h.url+" "+h.text).toLowerCase();return /\bprospectus\b/.test(t)&&!/drhp|rhp/.test(t)?4:/\brhp\b|red herring/.test(t)?3:/\bdrhp\b|draft red herring/.test(t)?2:/abridged prospectus/.test(t)?1:0};return rank(b)-rank(a)||b.priority-a.priority;})[0];if(official)ipo.officialWebsite=official.url.split("/").slice(0,3).join("/");if(doc){ipo.prospectusUrl=doc.url;ipo.prospectusType=prospectusTypeFromUrl(doc.url,doc.text);if(ipo.prospectusType==="RHP")ipo.rhpStatus="DISCOVERED_UNPARSED";}}
async function universalResearch(ipo:Ipo){
  const byQuestion=await researchHitsByQuestion(ipo);
  const keys:ResearchQuestionKey[]=["Q1","Q2","Q3","Q4","Q5","Q6","Q7","Q8","Q9"];
  // Merge in question order. Each pass receives ONLY that question's
  // independently collected source evidence, so a capped pooled page list can
  // never starve a later question of its own source search.
  for(const key of keys){
    const hits=byQuestion[key]??[];
    if(hits.length)applyQuestionResearch(ipo,key,hits);
  }
  const hits=flattenQuestionHits(byQuestion);
  if(hits.length){
    extractOfficialAndProspectus(ipo,hits);
    ipo.verifiedSources=[...new Set([...(ipo.verifiedSources??[]),...hits.map(h=>sourceName(h.url))])];
    ipo.sourceUrls=[...new Set(hits.map(h=>h.url))];
    ipo.detailSource=hits.find(h=>h.priority>=96)?.url??hits[0].url;
  }
  await enrichGmp(ipo);
  ipo.verifiedAt=new Date().toISOString();
  return ipo;
}

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
    symbol:r.symbol??undefined,nseSymbol:r.isBse==="1"?undefined:(r.symbol??undefined),bseScripCode:r.scripCode??r.scripcode??undefined,bseSymbol:r.isBse==="1"?(r.symbol??undefined):undefined,exchange:r.isBse==="1"?"BSE India":"NSE India",exchanges:[r.isBse==="1"?"BSE India":"NSE India"],id:"ipo-"+slugId(normalizeCompanyName(r.companyName||r.symbol||"ipo"))+"-"+slugId(date(r.issueStartDate)??date(r.issueEndDate)??r.symbol??"no-date"),
    name:clean(r.companyName||r.symbol||"IPO"),
    normalizedName:normalizeCompanyName(r.companyName||r.symbol||"IPO"),
    issueDateKey:issueDateKey(date(r.issueStartDate),date(r.issueEndDate)),
    rhpStatus:"NOT_FOUND",
    type:r.series==="SME"?"SME":"Mainboard",
    openDate:date(r.issueStartDate),closeDate:date(r.issueEndDate),listingDate:null,
    issueSize:null,minSubscription:fallbackMinimum,verifiedMinApplication:rawMinimum,subscription,subscriptionAmount,subscriptionSource:r.isBse==="1"?"BSE India":"NSE India",
    subscriptionCategories:[],gmpPct:null,gmpRs:null,gmpSources:[],gmpVerifiedSources:[],
    city:null,state:null,business:null,businessModel:null,revenueSources:[],domesticRevenuePercent:null,exportRevenuePercent:null,sector:null,products:[],services:[],businessLocations:[],registeredOffice:null,corporateOffice:null,promoters:[],segments:[],competitors:[],customerType:null,customerConcentration:null,customerCategories:[],industriesServed:[],geographicPresence:[],domesticMarket:null,exportMarket:null,b2b:null,b2c:null,leadManagers:[],documents:[],countries:[],countryCount:null,revenues:[],profits:[],eps:[],
    priceBand:band(r.issuePrice),lotSize:rawLot,faceValue:null,
    sharesOffered:n(r.noOfSharesOffered),offeredToPublic:null,retailShares:null,qibShares:null,niiShares:null,
    freshIssue:null,freshIssueShares:null,offerForSale:null,offerForSaleShares:null,issueType:null,financials:[],objects:[],risks:[],
    promoterHolding:null,postIssuePromoterHolding:null,registrar:null,registrarAddress:null,registrarEmail:null,registrarPhone:null,registrarWebsite:null,allotmentCheckUrl:null,sponsorBank:null,marketMaker:null,scsbListUrl:null,moneycontrolUrl:null,
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
      ipo.verifiedMinApplication=reportedMinimum;
      ipo.minSubscription=reportedMinimum;
    }else if(ipo.lotSize&&applicationPrice){
      // Artha's list fallback is deliberately deterministic:
      // upper price band × one lot, exactly matching the UI note.
      ipo.minSubscription=Number((ipo.lotSize*applicationPrice).toFixed(2));
      ipo.verifiedMinApplication=null;
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
  const today=indiaDateKey();
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
  // Keep current/upcoming issues plus a bounded recent-closed window so the IPO page can
  // truthfully show OPEN, UPCOMING and CLOSED instead of relabelling closed issues as upcoming.
  const recentClosedCutoff=(() => {
    const d=new Date(today+"T00:00:00Z");
    d.setUTCDate(d.getUTCDate()-30);
    return d.toISOString().slice(0,10);
  })();
  const base=[...map.values()].filter(x=>{
    if(!x.name)return false;
    // Keep every usable NSE record. Upcoming/current issues normally have a close
    // date, but NSE can temporarily publish an issue with only an open date while
    // the remaining fields are still being populated. Do not hide such records.
    if(x.closeDate)return x.closeDate>=recentClosedCutoff;
    return !!x.openDate;
  });

  // Enrich OPEN issues from NSE detail in a bounded, failure-safe way. The official
  // current-issue feed remains the source of truth for names/subscription, while detail
  // supplies lot size/minimum application and category data when NSE exposes it.
  // A slow detail endpoint can never blank or block the IPO list.
  const active=base.filter(x=>isNseOpen(x,today)&&x.symbol).slice(0,20);
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
  const gmpCandidates=liveBase.filter(x=>x.symbol&&isNseOpen(x,today)).slice(0,10);
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
    .filter(x=>!!x.name&&((x.closeDate&&x.closeDate>=recentClosedCutoff)||(!x.closeDate&&x.openDate)))
    .sort((a,b)=>(a.openDate??"").localeCompare(b.openDate??"")||a.name.localeCompare(b.name));
}
function isNseOpen(ipo:Ipo,today:string){
  return !!ipo.openDate&&ipo.openDate<=today&&!!ipo.closeDate&&ipo.closeDate>=today;
}
export const fetchOpenIposLive=createServerFn({method:"GET"}).handler(async()=>{
  try{
    const universe=await loadIpoUniverse();
    if(universe.length)return universe;
  }catch{}
  const hit=cache.get("nse");
  if(hit&&hit.expires>Date.now())return hit.value;
  try{
    const value=await loadNse();
    cache.set("nse",{expires:Date.now()+CACHE_MS,value});
    return value;
  }catch{
    // Keep the last verified payload during a transient exchange/API failure.
    if(hit?.value?.length) return hit.value;
    const empty:Ipo[]=[];
    cache.set("nse",{expires:Date.now()+5000,value:empty});
    return empty;
  }
});

export const fetchIpoDetailFast=createServerFn({method:"GET"}).inputValidator((data:{id:string})=>data).handler(async({data}:{data:{id:string}})=>{
  try{
    const ipo=await loadIpoFast(data.id);
    if(ipo)return ipo;
  }catch{}
  const list=await loadNse();
  const ipo=list.find(x=>x.id===data.id);
  if(!ipo)return null;
  return {...ipo,rhpStatus:ipo.rhpStatus??"NOT_FOUND"};
});

export const fetchIpoDetailLive=createServerFn({method:"GET"}).inputValidator((data:{id:string})=>data).handler(async({data}:{data:{id:string}})=>{
  let enriched:Ipo|null=null;
  try{enriched=await loadIpoEnriched(data.id);}catch{}
  const list=await loadNse();
  const fallback=list.find(x=>x.id===data.id);
  const base=enriched??fallback;
  if(!base)return null;
  try{
    // Always run the universal research layer after official/secondary enrichment.
    // This is what makes Q1-Q10 work automatically for new future IPOs instead of
    // relying only on one secondary website.
    return await Promise.race([
      universalResearch({...base}),
      new Promise<Ipo>(resolve=>setTimeout(()=>resolve(base),60000))
    ]);
  }catch{return base;}
});

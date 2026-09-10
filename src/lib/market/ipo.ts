import { createServerFn } from "@tanstack/react-start";

type Ipo = {
  id: string;
  name: string;
  type: "Mainboard" | "SME";
  openDate: string | null;
  closeDate: string | null;
  issueSize: number | null;
  minSubscription: number | null;
  subscription: number | null;
  subscriptionSource: string | null;
  gmpPct: number | null;
  gmpSources: { source: string; pct: number | null }[];
  city: string | null;
  state: string | null;
  business: string | null;
  countries: { country: string; business: string; salesPct: number | null }[];
  profits: { year: string; value: number | null }[];
  priceBand: string | null;
  lotSize: number | null;
  moneycontrolUrl: string | null;
  detailSource: string | null;
  verifiedSources: string[];
  verifiedAt: string;
};

const GROWW_IPO = "https://groww.in/ipo";
const GROWW_SUBSCRIPTION = "https://groww.in/ipo/subscription";
const MONEYCONTROL_OPEN = "https://www.moneycontrol.com/ipo/open-ipos/";
const UA = "Mozilla/5.0 (compatible; Artha-market/1.0)";

const GMP_SOURCE_URLS = (id: string) => ({
  "IPO Watch": `https://ipowatch.in/${id}-ipo-gmp-grey-market-premium/`,
  "IPO Central": `https://ipocentral.in/${id}-ipo-gmp-price-allotment/`,
  "GMP IPO Watch": `https://www.gmpipowatch.in/ipo/${id}`,
  InvestorGain: `https://www.investorgain.com/gmp/${id}-ipo-gmp/`,
});

const DETAIL_SOURCE_URLS = (id: string) => ({
  "IPO Watch": `https://ipowatch.in/${id}-ipo-gmp-grey-market-premium/`,
  "IPO Central": `https://ipocentral.in/${id}-ipo-gmp-price-allotment/`,
  InvestorGain: `https://www.investorgain.com/gmp/${id}-ipo-gmp/`,
});

const cache = new Map<string, { expires: number; value: Ipo[] }>();

async function getHtml(url: string, timeoutMs = 6000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/json", "Accept-Language": "en-US,en;q=0.9" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

function clean(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&#8377;|&#x20b9;/gi, "₹").replace(/&ndash;|&mdash;|&#8211;|&#8212;/gi, "-")
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
}

function norm(value: string): string {
  return value.toLowerCase().replace(/&amp;/g, "and").replace(/limited|ltd\.?|private|pvt\.?|ipo|inc\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
function num(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}
function idFor(name: string): string { return norm(name).replace(/\s+/g, "-"); }
function parseDate(value: string): string | null {
  const m = value.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/); if (!m) return null;
  const months: Record<string,string> = {jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};
  const month = months[m[2].slice(0,3).toLowerCase()]; return month ? `${m[3]}-${month}-${String(Number(m[1])).padStart(2,"0")}` : null;
}
function priceNumbers(value: string): [number|null, number|null] {
  const m = value.match(/(?:₹|Rs\.?|INR)?\s*([\d,.]+)\s*(?:-|–|to)\s*(?:₹|Rs\.?|INR)?\s*([\d,.]+)/i);
  return m ? [num(m[1]), num(m[2])] : [null,null];
}
function parsePriceBand(value: string): string | null {
  const [low,high] = priceNumbers(value); if (low !== null && high !== null) return `₹${low.toLocaleString("en-IN")} – ₹${high.toLocaleString("en-IN")}`;
  const m = value.match(/(?:₹|Rs\.?|INR)\s*([\d,.]+)/i); return m ? `₹${num(m[1])?.toLocaleString("en-IN") ?? m[1]}` : null;
}
function firstNumber(value: string, patterns: RegExp[]): number | null {
  for (const p of patterns) { const m=value.match(p); if(m){const n=num(m[1]); if(n!==null)return n;} } return null;
}
function blank(name:string,type:"SME"|"Mainboard"="Mainboard"):Ipo { return {
  id:idFor(name),name,type,openDate:null,closeDate:null,issueSize:null,minSubscription:null,subscription:null,subscriptionSource:null,
  gmpPct:null,gmpSources:[],city:null,state:null,business:null,countries:[],profits:[],priceBand:null,lotSize:null,moneycontrolUrl:null,detailSource:null,verifiedSources:[],verifiedAt:new Date().toISOString()
}; }

function rowName(raw:string):string {
  const a=raw.match(/<a[^>]+href=["'][^"']*\/ipo\/[^"']*ipodetail[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  if(a){const n=clean(a[1]).replace(/^(image|logo)\s*:?/i,"").trim();if(n&&n.length>=2&&!/^(details|view|read more)$/i.test(n))return n;}
  const text=clean(raw), firstDate=text.search(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/); const before=firstDate>=0?text.slice(0,firstDate):text;
  return before.replace(/Image:\s*/gi," ").replace(/Company Name|Company|Type|Open Date|Close Date|Issue Size|Issue Price|QIB|NII|Retail|Employee|Total/gi," ").replace(/\b(Mainboard|SME|Open|Upcoming|RHP|RHPSME)\b/gi," ").replace(/\s+/g," ").trim();
}
function moneycontrolLink(raw:string):string|null { const m=raw.match(/href=["']([^"']*\/ipo\/[^"']*ipodetail[^"']*)["']/i); if(!m)return null; return m[1].startsWith("http")?m[1]:`https://www.moneycontrol.com${m[1]}`; }

function exactMinimum(text:string, priceBand:string|null, lotSize:number|null):number|null {
  const direct = firstNumber(text,[
    /minimum\s+(?:investment|application|bid\s+amount)[^₹\d]{0,80}(?:₹|Rs\.?|INR)?\s*([\d,.]+)/i,
    /min(?:imum)?\s+(?:investment|application)[^₹\d]{0,80}(?:₹|Rs\.?|INR)?\s*([\d,.]+)/i,
    /application\s+amount[^₹\d]{0,80}(?:₹|Rs\.?|INR)?\s*([\d,.]+)/i,
  ]);
  if(direct!==null) return direct;
  const [low]=priceNumbers(priceBand??text);
  return low!==null&&lotSize!==null ? low*lotSize : null;
}

function parseRows(html:string):Ipo[] {
  const result:Ipo[]=[];
  for(const match of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)){
    const raw=match[0],text=clean(raw),dates=[...text.matchAll(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/g)].map(x=>x[0]); if(!dates.length)continue;
    const name=rowName(raw); if(!name||name.length<2||/company name|open date|close date/i.test(name))continue;
    const ipo=blank(name,/\bSME\b/i.test(text)?"SME":"Mainboard"); ipo.openDate=parseDate(dates[0]); ipo.closeDate=dates.length>1?parseDate(dates[1]):null;
    ipo.moneycontrolUrl=moneycontrolLink(raw); ipo.detailSource=ipo.moneycontrolUrl?"Moneycontrol":null;
    const after=text.slice(text.indexOf(dates[0])+dates[0].length);
    ipo.priceBand=parsePriceBand(after);
    ipo.lotSize=firstNumber(after,[/\blot\s*size\s*[:\-]?\s*(\d[\d,]*)/i,/\blot\s*[:\-]?\s*(\d[\d,]*)/i]);
    ipo.issueSize=firstNumber(after,[/issue\s*size[^\d]{0,60}(?:₹|Rs\.?|INR)?\s*([\d,.]+)\s*(?:Cr|crore)/i,/(?:₹|Rs\.?|INR)?\s*([\d,.]+)\s*(?:Cr|crore)/i]);
    ipo.minSubscription=exactMinimum(after,ipo.priceBand,ipo.lotSize); result.push(ipo);
  } return result;
}

function parseGrowwSubscription(html:string):Ipo[] {
  const result:Ipo[]=[];
  for(const match of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)){
    const raw=match[0],text=clean(raw),dates=[...text.matchAll(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/g)].map(x=>x[0]); if(!dates.length)continue;
    const name=rowName(raw); if(!name||name.length<2||/company name|close date/i.test(name))continue;
    const ipo=blank(name,/\bSME\b/i.test(text)?"SME":"Mainboard"); ipo.closeDate=parseDate(dates[0]); const after=text.slice(text.indexOf(dates[0])+dates[0].length);
    ipo.priceBand=parsePriceBand(after); ipo.issueSize=firstNumber(after,[/issue\s*size[^\d]{0,60}([\d,.]+)\s*(?:Cr|crore)/i,/(?:₹|Rs\.?|INR)?\s*([\d,.]+)\s*(?:Cr|crore)/i]);
    const subs=[...after.matchAll(/(\d+(?:\.\d+)?)\s*x\b/gi)].map(x=>num(x[1])).filter((v):v is number=>v!==null); if(subs.length)ipo.subscription=subs[subs.length-1];
    ipo.lotSize=firstNumber(after,[/\blot\s*size\s*[:\-]?\s*(\d[\d,]*)/i]); ipo.minSubscription=exactMinimum(after,ipo.priceBand,ipo.lotSize);
    if(ipo.subscription!==null)ipo.subscriptionSource="Groww verified"; result.push(ipo);
  } return result;
}

function mergeInto(map:Map<string,Ipo>,incoming:Ipo):void { const key=norm(incoming.name);if(!key)return;const e=map.get(key);if(!e){map.set(key,incoming);return;}
  if(incoming.type==="SME")e.type="SME"; e.openDate??=incoming.openDate;e.closeDate??=incoming.closeDate;e.issueSize??=incoming.issueSize;e.priceBand??=incoming.priceBand;e.lotSize??=incoming.lotSize;
  e.minSubscription??=incoming.minSubscription;e.moneycontrolUrl??=incoming.moneycontrolUrl;e.detailSource??=incoming.detailSource;
  if(e.subscription===null&&incoming.subscription!==null){e.subscription=incoming.subscription;e.subscriptionSource=incoming.subscriptionSource;}
}

function extractGmp(text:string):number|null { const value=clean(text);for(const p of [/(?:Current GMP|Live GMP|GMP Today)[^₹\d]{0,120}₹\s*(-?[\d,]+(?:\.\d+)?)/i,/(?:GMP)[^\d]{0,80}(-?[\d,]+(?:\.\d+)?)\s*(?:₹|Rs)/i]){const m=value.match(p);if(m)return num(m[1]);}return null; }
async function enrichGmp(ipo:Ipo):Promise<void>{const settled=await Promise.allSettled(Object.entries(GMP_SOURCE_URLS(ipo.id)).map(async([source,url])=>({source,pct:extractGmp(await getHtml(url,3000))})));const values=settled.flatMap(x=>x.status==="fulfilled"&&x.value.pct!==null?[x.value]:[]);ipo.gmpSources=values;if(values.length<2){ipo.gmpPct=null;return;}const sorted=values.map(x=>x.pct as number).sort((a,b)=>a-b),mid=Math.floor(sorted.length/2),median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;const[,upper]=priceNumbers(ipo.priceBand??"");ipo.gmpPct=upper&&upper>0?Number(((median/upper)*100).toFixed(2)):null;}

function parseMoneycontrolDetail(text:string,ipo:Ipo):void { const details=text.match(/IPO Details[\s\S]{0,16000}/i)?.[0]??text;ipo.priceBand??=parsePriceBand(details);ipo.lotSize??=firstNumber(details,[/Lot Size\s*[:\-]?\s*([\d,]+)/i,/Lot size[^\d]{0,40}([\d,]+)/i]);ipo.issueSize??=firstNumber(details,[/Issue Size[^\d]{0,70}(?:₹|Rs\.?|INR)?\s*([\d,.]+)\s*(?:Cr|crore)/i]);ipo.minSubscription??=exactMinimum(details,ipo.priceBand,ipo.lotSize);
  const address=text.match(/Address[\s\S]{0,1600}/i)?.[0]??"";const cities=["Mumbai","Delhi","Bengaluru","Bangalore","Chennai","Pune","Ahmedabad","Kolkata","Hyderabad","Jaipur","Surat","Noida","Gurugram","Gurgaon","Vadodara","Indore","Rajkot","Tiruppur"];const city=cities.find(x=>new RegExp(`\\b${x}\\b`,"i").test(address));if(city)ipo.city=city==="Bangalore"?"Bengaluru":city;
  const states=["Maharashtra","Gujarat","Karnataka","Tamil Nadu","Delhi","West Bengal","Telangana","Rajasthan","Haryana","Uttar Pradesh","Madhya Pradesh"];const state=states.find(x=>new RegExp(`\\b${x}\\b`,"i").test(address));if(state)ipo.state=state;
  const about=text.match(/About (?:the )?(?:Company|Product)[\s\S]{0,4500}/i)?.[0];if(about)ipo.business=clean(about).replace(/^About (?:the )?(?:Company|Product)\s*/i,"").slice(0,1800);
  const profits=[...text.matchAll(/(?:FY|Year)[^\d]{0,30}(20\d{2})[^₹\d]{0,80}₹?\s*([\d,.]+)\s*(?:Cr|crore)/gi)].map(x=>({year:x[1],value:num(x[2])})).filter(x=>x.value!==null).slice(-3);if(profits.length)ipo.profits=profits;
}
async function enrichMoneycontrol(ipo:Ipo):Promise<void>{if(!ipo.moneycontrolUrl)return;try{const text=await getHtml(ipo.moneycontrolUrl,4500);if(text.length<200)return;parseMoneycontrolDetail(text,ipo);ipo.detailSource="Moneycontrol";ipo.verifiedSources.push("Moneycontrol");}catch{}}
function parseSecondaryDetail(text:string,ipo:Ipo):boolean{const value=clean(text);const before=ipo.minSubscription;ipo.priceBand??=parsePriceBand(value);ipo.lotSize??=firstNumber(value,[/Lot Size[^\d]{0,60}([\d,]+)/i,/Lot size[^\d]{0,60}([\d,]+)/i]);ipo.issueSize??=firstNumber(value,[/Issue Size[^\d]{0,80}(?:₹|Rs\.?|INR)?\s*([\d,.]+)\s*(?:Cr|crore)/i]);ipo.minSubscription??=exactMinimum(value,ipo.priceBand,ipo.lotSize);return Boolean(ipo.priceBand||ipo.lotSize||ipo.issueSize||(before!==ipo.minSubscription));}
async function enrichSecondaryDetails(ipo:Ipo):Promise<void>{const settled=await Promise.allSettled(Object.entries(DETAIL_SOURCE_URLS(ipo.id)).map(async([source,url])=>({source,text:await getHtml(url,3000)})));for(const x of settled){if(x.status!=="fulfilled"||x.value.text.length<200)continue;if(parseSecondaryDetail(x.value.text,ipo))ipo.verifiedSources.push(x.value.source);}}
function todayIST():string{return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
async function loadIpos():Promise<Ipo[]>{const cached=cache.get("ipos");if(cached&&cached.expires>Date.now())return cached.value;const [gd,gs,mc]=await Promise.allSettled([getHtml(GROWW_IPO,5000),getHtml(GROWW_SUBSCRIPTION,5000),getHtml(MONEYCONTROL_OPEN,5000)]);const map=new Map<string,Ipo>();if(gd.status==="fulfilled")for(const x of parseRows(gd.value))mergeInto(map,x);if(gs.status==="fulfilled")for(const x of parseGrowwSubscription(gs.value))mergeInto(map,x);if(mc.status==="fulfilled")for(const x of parseRows(mc.value))mergeInto(map,x);const today=todayIST();const active=[...map.values()].filter(x=>x.closeDate!==null&&x.closeDate>=today);const enriched=await Promise.all(active.map(async ipo=>{await Promise.allSettled([enrichMoneycontrol(ipo),enrichSecondaryDetails(ipo),enrichGmp(ipo)]);if(ipo.subscription!==null&&!ipo.verifiedSources.includes("Groww"))ipo.verifiedSources.push("Groww");ipo.verifiedSources=[...new Set(ipo.verifiedSources)];ipo.verifiedAt=new Date().toISOString();return ipo;}));enriched.sort((a,b)=>(a.openDate??"9999-99-99").localeCompare(b.openDate??"9999-99-99")||a.name.localeCompare(b.name));cache.set("ipos",{expires:Date.now()+60000,value:enriched});return enriched;}
export const fetchOpenIpos=createServerFn({method:"POST"}).handler(async():Promise<Ipo[]>=>{try{return await loadIpos();}catch{return[];}});

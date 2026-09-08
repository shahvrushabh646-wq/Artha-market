import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Ipo={id:string;name:string;type:"Mainboard"|"SME";openDate:string|null;closeDate:string|null;issueSize:number|null;minSubscription:number|null;subscription:number|null;subscriptionSource:string|null;gmpPct:number|null;gmpSources:{source:string;pct:number|null}[];city:string|null;state:string|null;business:string|null;countries:{country:string;business:string;salesPct:number|null}[];profits:{year:string;value:number|null}[];priceBand:string|null;lotSize:number|null;moneycontrolUrl:string|null;detailSource:string|null;verifiedAt:string};

const GROWW_SUBSCRIPTION="https://groww.in/ipo/subscription";
const MONEYCONTROL_OPEN="https://www.moneycontrol.com/ipo/open-ipos/";
const GMP_SOURCE_URLS=(id:string)=>({"IPO Watch":`https://ipowatch.in/${id}-ipo-gmp-grey-market-premium/`,`IPO Central`:`https://ipocentral.in/${id}-ipo-gmp-price-allotment/`,`GMP IPO Watch`:`https://www.gmpipowatch.in/ipo/${id}`,InvestorGain:`https://www.investorgain.com/gmp/${id}-ipo-gmp/`});
const cache=new Map<string,{exp:number;value:Ipo[]}>();
const UA="Mozilla/5.0 (compatible; Artha-market/1.0)";

async function getHtml(url:string,timeoutMs=12000){const c=new AbortController();const timer=setTimeout(()=>c.abort(),timeoutMs);try{const r=await fetch(url,{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml,application/json","Accept-Language":"en-US,en;q=0.9"},cache:"no-store",signal:c.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text();}finally{clearTimeout(timer);}}
function clean(h:string){return h.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#8377;|&#x20b9;/gi,"₹").replace(/&ndash;|&mdash;/gi,"-").replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g," ").trim();}
function norm(s:string){return s.toLowerCase().replace(/&amp;/g,"and").replace(/limited|ltd\.?|private|pvt\.?|ipo|inc\.?/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function num(v:unknown){const n=Number(String(v??"").replace(/,/g,""));return Number.isFinite(n)?n:null;}
function idFor(name:string){return norm(name).replace(/\s+/g,"-");}
function parseDate(s:string){let m=s.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);if(!m)m=s.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);if(!m)return null;const months:Record<string,string>={jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};const firstDay=/^\d/.test(m[1]);const mo=months[(firstDay?m[2]:m[1]).slice(0,3).toLowerCase()];const day=firstDay?m[1]:m[2];return mo?`${m[3]}-${mo}-${String(Number(day)).padStart(2,"0")}`:null;}
function parsePriceBand(s:string){const m=s.match(/₹?\s*([\d,.]+)\s*(?:-|–|to)\s*₹?\s*([\d,.]+)/i);return m?`₹${m[1]} – ₹${m[2]}`:s.match(/₹\s*([\d,.]+)/)?.[0]??null;}
function priceNumbers(s:string){const m=s.match(/₹?\s*([\d,.]+)\s*(?:-|–|to)\s*₹?\s*([\d,.]+)/i);return m?[num(m[1]),num(m[2])]:[null,null];}
function extractNumber(t:string,patterns:RegExp[]){for(const p of patterns){const m=t.match(p);if(m){const n=num(m[1]);if(n!=null)return n;}}return null;}
function blank(name:string,type:"SME"|"Mainboard"="Mainboard"):Ipo{return {id:idFor(name),name,type,openDate:null,closeDate:null,issueSize:null,minSubscription:null,subscription:null,subscriptionSource:null,gmpPct:null,gmpSources:[],city:null,state:null,business:null,countries:[],profits:[],priceBand:null,lotSize:null,moneycontrolUrl:null,detailSource:null,verifiedAt:new Date().toISOString()};}

function parseMoneycontrolRows(html:string):Ipo[]{
  const rows=[...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)];
  const out:Ipo[]=[];
  for(const match of rows){
    const raw=match[0];
    const row=clean(raw);
    const dates=[...row.matchAll(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/g)].map(m=>m[0]);
    if(!dates.length)continue;
    const type:"SME"|"Mainboard"=/SME/i.test(row)?"SME":"Mainboard";
    const before=row.split(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/)[0];
    const name=before.replace(/Image:\s*/gi,"").replace(/Company Name|Type|Open Date|Close Date|Issue Size|Issue Price/gi," ").replace(/\b(Mainboard|SME|Open|RHP|RHPSME)\b/gi," ").replace(/\s+/g," ").trim();
    if(!name||name.length<2||/company name/i.test(name))continue;
    const ipo=blank(name,type);
    ipo.openDate=parseDate(dates[0]);
    ipo.closeDate=dates.length>1?parseDate(dates[1]):null;
    const after=row.slice(row.indexOf(dates[0])+dates[0].length);
    ipo.priceBand=parsePriceBand(after);
    ipo.lotSize=extractNumber(after,[/lot\s*size\s*(\d[\d,]*)/i]);
    const cr=after.match(/₹?\s*([\d,.]+)\s*(?:Cr|crore)/i);ipo.issueSize=cr?num(cr[1]):null;
    const prices=priceNumbers(ipo.priceBand??after);if(ipo.lotSize&&prices[0]!=null)ipo.minSubscription=prices[0]*ipo.lotSize;
    const href=raw.match(/href=["']([^"']*\/ipo\/[^"']*ipodetail[^"']*)["']/i)?.[1];
    if(href)ipo.moneycontrolUrl=href.startsWith("http")?href:`https://www.moneycontrol.com${href}`;
    if(ipo.moneycontrolUrl)ipo.detailSource="Moneycontrol";
    out.push(ipo);
  }
  return out;
}

function parseGrowwSubscription(html:string):Ipo[]{
  const rows=[...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)];const out:Ipo[]=[];
  for(const match of rows){const row=clean(match[0]);const dates=[...row.matchAll(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/g)].map(m=>m[0]);if(!dates.length)continue;
    const type:"SME"|"Mainboard"=/SME/i.test(row)?"SME":"Mainboard";
    const before=row.split(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}/)[0];
    const name=before.replace(/Image:\s*/gi,"").replace(/Company Name|Type|Close Date|Issue Size|Issue Price|QIB|NII|Retail|Employee|Total/gi," ").replace(/\b(Mainboard|SME)\b/gi," ").replace(/\s+/g," ").trim();
    if(!name||name.length<2||/company name/i.test(name))continue;
    const ipo=blank(name,type);ipo.closeDate=parseDate(dates[0]);
    const after=row.slice(row.indexOf(dates[0])+dates[0].length);ipo.priceBand=parsePriceBand(after);
    const cr=after.match(/([\d,.]+)\s*Cr/i);ipo.issueSize=cr?num(cr[1]):null;
    const totals=[...after.matchAll(/(\d+(?:\.\d+)?)\s*x\b/gi)].map(m=>num(m[1])).filter((v):v is number=>v!=null);if(totals.length)ipo.subscription=totals[totals.length-1];
    const prices=priceNumbers(ipo.priceBand??after);const lot=extractNumber(after,[/lot\s*size\s*(\d[\d,]*)/i]);if(lot)ipo.lotSize=lot;if(ipo.lotSize&&prices[0]!=null)ipo.minSubscription=prices[0]*lot;
    if(ipo.subscription!=null)ipo.subscriptionSource="Groww verified";out.push(ipo);
  }return out;
}

function mergeInto(map:Map<string,Ipo>,ipo:Ipo){const key=norm(ipo.name);const old=map.get(key);if(!old){map.set(key,ipo);return;}old.type=old.type==="SME"||ipo.type==="SME"?"SME":"Mainboard";old.openDate=old.openDate??ipo.openDate;old.closeDate=old.closeDate??ipo.closeDate;old.issueSize=old.issueSize??ipo.issueSize;old.priceBand=old.priceBand??ipo.priceBand;old.lotSize=old.lotSize??ipo.lotSize;old.minSubscription=old.minSubscription??ipo.minSubscription;old.moneycontrolUrl=old.moneycontrolUrl??ipo.moneycontrolUrl;old.detailSource=old.detailSource??ipo.detailSource;if(old.subscription==null&&ipo.subscription!=null){old.subscription=ipo.subscription;old.subscriptionSource=ipo.subscriptionSource;}}

function extractGmp(text:string){const t=clean(text);const patterns=[/(?:Current GMP|Live GMP|GMP Today|GMP)[^₹\d]{0,120}₹\s*(-?[\d,]+(?:\.\d+)?)/i,/(?:GMP)[^\d]{0,80}(-?[\d,]+(?:\.\d+)?)\s*(?:₹|Rs)/i];for(const p of patterns){const m=t.match(p);if(m)return num(m[1]);}return null;}
async function enrichGmp(ipo:Ipo){const values:{source:string;pct:number|null}[]=[];for(const [source,url] of Object.entries(GMP_SOURCE_URLS(ipo.id))){try{const g=extractGmp(await getHtml(url,8000));if(g!=null)values.push({source,pct:g});}catch{}}
  ipo.gmpSources=values; if(values.length<2){ipo.gmpPct=null;return;}const nums=values.map(x=>x.pct).filter((x):x is number=>x!=null).sort((a,b)=>a-b);const g=nums.length%2?nums[Math.floor(nums.length/2)]:(nums[nums.length/2-1]+nums[nums.length/2])/2;const upper=priceNumbers(ipo.priceBand??"")[1]??priceNumbers(ipo.priceBand??"")[0];ipo.gmpPct=upper&&upper>0?Number(((g/upper)*100).toFixed(2)):null;}

function parseMoneycontrolDetail(t:string,ipo:Ipo){
  const details=t.match(/IPO Details[\s\S]{0,7000}/i)?.[0]??t;
  ipo.priceBand=ipo.priceBand??parsePriceBand(details);
  ipo.lotSize=ipo.lotSize??extractNumber(details,[/Lot Size\s*([\d,]+)/i,/Lot size[^\d]{0,30}([\d,]+)/i]);
  ipo.issueSize=ipo.issueSize??extractNumber(details,[/Issue Size[^\d]{0,50}₹?\s*([\d,.]+)\s*(?:Cr|crore)/i]);
  const address=t.match(/Address[\s\S]{0,500}/i)?.[0]??"";
  const loc=address.match(/\b(Mumbai|Delhi|Bengaluru|Bangalore|Chennai|Pune|Ahmedabad|Kolkata|Hyderabad|Jaipur|Surat|Noida|Gurugram|Gurgaon|Vadodara|Indore|Rajkot|Tiruppur)\b[^\n,;]{0,80}(?:,|\s)(Maharashtra|Tamil Nadu|Gujarat|Karnataka|Delhi|West Bengal|Telangana|Rajasthan|Haryana|Uttar Pradesh|Madhya Pradesh)/i);
  if(loc){ipo.city=loc[1];ipo.state=loc[2];}else{const city=address.match(/\b(Mumbai|Delhi|Bengaluru|Bangalore|Chennai|Pune|Ahmedabad|Kolkata|Hyderabad|Jaipur|Surat|Noida|Gurugram|Gurgaon|Vadodara|Indore|Rajkot|Tiruppur)\b/i);if(city)ipo.city=city[1];}
  const about=t.match(/About Product[\s\S]{0,3500}/i)?.[0];if(about)ipo.business=clean(about).replace(/^About Product\s*/i,"").slice(0,1800);
}
async function enrichMoneycontrol(ipo:Ipo){try{
  let url=ipo.moneycontrolUrl;
  if(!url){const html=await getHtml(MONEYCONTROL_OPEN,9000);const rows=[...html.matchAll(/href=["']([^"']*\/ipo\/[^"']*ipodetail[^"']*)["'][^>]*>[\s\S]{0,500}?([^<]{2,120})/gi)];const target=norm(ipo.name);const hit=rows.find(m=>norm(clean(m[2]))===target||norm(clean(m[2])).includes(target)||target.includes(norm(clean(m[2]))));if(hit)url=hit[1].startsWith("http")?hit[1]:`https://www.moneycontrol.com${hit[1]}`;}
  if(!url)return;const t=clean(await getHtml(url,10000));if(t.length<200)return;ipo.moneycontrolUrl=url;ipo.detailSource="Moneycontrol";parseMoneycontrolDetail(t,ipo);
}catch{}}

function todayIST(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
async function loadIpos(){const hit=cache.get("open");if(hit&&hit.exp>Date.now())return hit.value;
  const [groww,mc]=await Promise.allSettled([getHtml(GROWW_SUBSCRIPTION),getHtml(MONEYCONTROL_OPEN)]);const map=new Map<string,Ipo>();
  if(groww.status==="fulfilled")for(const x of parseGrowwSubscription(groww.value))mergeInto(map,x);
  if(mc.status==="fulfilled")for(const x of parseMoneycontrolRows(mc.value))mergeInto(map,x);
  const today=todayIST();const ipos=[...map.values()].filter(x=>x.closeDate==null||x.closeDate>=today);
  const enriched=await Promise.all(ipos.map(async ipo=>{await enrichMoneycontrol(ipo);await enrichGmp(ipo);ipo.verifiedAt=new Date().toISOString();return ipo;}));
  enriched.sort((a,b)=>{const ad=a.closeDate??"9999-99-99",bd=b.closeDate??"9999-99-99";return ad===bd?a.name.localeCompare(b.name):ad.localeCompare(bd);});
  cache.set("open",{exp:Date.now()+30000,value:enriched});return enriched;
}

export const fetchOpenIpos=createServerFn({method:"POST"}).validator((data:unknown)=>z.object({refresh:z.boolean().optional()}).parse(data)).handler(async()=>{try{return await loadIpos();}catch{return[];}});

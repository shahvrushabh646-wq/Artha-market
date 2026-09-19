import { createServerFn } from "@tanstack/react-start";
type Ipo={symbol?:string;id:string;name:string;type:"Mainboard"|"SME";openDate:string|null;closeDate:string|null;listingDate:string|null;issueSize:number|null;minSubscription:number|null;subscription:number|null;subscriptionAmount:number|null;subscriptionSource:string|null;subscriptionCategories:{category:string;value:number|null}[];gmpPct:number|null;gmpRs:number|null;gmpSources:{source:string;pct:number|null;rs:number|null;asOf:string|null}[];gmpVerifiedSources:string[];city:string|null;state:string|null;business:string|null;countries:{country:string;business:string;salesPct:number|null}[];revenues:{year:string;value:number|null}[];profits:{year:string;value:number|null}[];eps:{year:string;value:number|null}[];priceBand:string|null;lotSize:number|null;faceValue:number|null;sharesOffered:number|null;offeredToPublic:number|null;retailShares:number|null;qibShares:number|null;niiShares:number|null;freshIssue:number|null;offerForSale:number|null;issueType:string|null;objects:string[];risks:string[];promoterHolding:number|null;postIssuePromoterHolding:number|null;moneycontrolUrl:string|null;detailSource:string|null;verifiedSources:string[];sourceUrls:string[];verifiedAt:string};
type SamcoIpo={id:string;slug:string;company_name:string;type:string;company_profile:string;issue_type:string;issue_open:string;issue_close:string;listed_date:string;face_value:string;price_band:string;bid_lot:string;minimum_order:string;listing:string;issue_size:string;fresh_issue:string;ofs:string;obj_issue:string;key_strengths:string;risks:string;RHP_url:string;knowledge_center_url:string};

const NSE = "https://www.nseindia.com";
const NSE_PAGE = "https://www.nseindia.com/market-data/all-upcoming-issues-ipo";
const cache=new Map<string,{expires:number;value:Ipo[]}>();
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

async function nseSession(){
  try{
    const r=await fetch(NSE,{headers:HEADERS,cache:"no-store"});
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
    const r=await fetch(NSE+path,{headers:{...HEADERS,Cookie:cookie},cache:"no-store"});
    if(!r.ok) throw new Error("NSE HTTP "+r.status);
    return await r.json();
  }catch{
    const proxy="https://r.jina.ai/http://www.nseindia.com"+path;
    const r=await fetch(proxy,{headers:{"User-Agent":HEADERS["User-Agent"],Accept:"application/json,text/plain,*/*"},cache:"no-store"});
    if(!r.ok) throw new Error("NSE proxy HTTP "+r.status);
    return parseProxyJson(await r.text());
  }
}

function rowsFromNse(raw:unknown): any[]{
  if(Array.isArray(raw)) return raw;
  const root=raw as any;
  if(root && Array.isArray(root.data)) return root.data;
  if(root && Array.isArray(root.records)) return root.records;
  if(root && root.data && Array.isArray(root.data.data)) return root.data.data;
  return [];
}
function parseInfo(rows:unknown[]){
  const out:Record<string,string>={};
  for(const row of rows as Array<{title?:string;value?:unknown}>){
    if(row?.title) out[clean(row.title)]=clean(row.value);
  }
  return out;
}
function rowsFromCategory(raw:unknown):any[]{
  if(Array.isArray(raw)) return raw;
  const x=raw as any;
  if(x&&Array.isArray(x.dataList)) return x.dataList;
  if(x&&Array.isArray(x.data)) return x.data;
  if(x&&Array.isArray(x.records)) return x.records;
  if(x&&x.data&&Array.isArray(x.data.data)) return x.data.data;
  return [];
}
function findRows(root:unknown,predicate:(row:any)=>boolean):any[]{
  const seen=new Set<any>();
  const walk=(value:unknown):any[]=>{
    if(value==null||typeof value!=="object"||seen.has(value as any))return [];
    seen.add(value as any);
    if(Array.isArray(value)){
      const direct=value.filter(predicate);
      if(direct.length)return direct;
      for(const item of value){const found=walk(item);if(found.length)return found;}
      return [];
    }
    const obj=value as Record<string,unknown>;
    for(const key of Object.keys(obj)){
      const found=walk(obj[key]);
      if(found.length)return found;
    }
    return [];
  };
  return walk(root);
}
function infoRowsFromDetail(root:unknown):any[]{
  return findRows(root,row=>row&&typeof row==="object"&&("title" in row)&&("value" in row));
}
function documentUrlsFromDetail(root:unknown):string[]{
  const found:string[]=[];
  const seen=new Set<any>();
  const walk=(value:unknown)=>{
    if(value==null||typeof value!=="object"||seen.has(value as any))return;
    seen.add(value as any);
    if(Array.isArray(value)){for(const item of value)walk(item);return;}
    for(const [key,val] of Object.entries(value as Record<string,unknown>)){
      if(typeof val==="string"&&/^https?:\/\//i.test(val)){
        const k=key.toLowerCase();
        const u=val.trim();
        if(/rhp|red.?herring|prospectus|offer.?document|offer.?doc|issue.?document|abridged/i.test(k+" "+u))found.push(u);
      }else walk(val);
    }
  };
  walk(root);
  return [...new Set(found)].sort((a,b)=>{
    const score=(u:string)=>/rhp|red.?herring/i.test(u)?0:/prospectus/i.test(u)?1:/offer/i.test(u)?2:3;
    return score(a)-score(b);
  });
}
function categoryRowsFromDetail(root:unknown):any[]{
  return findRows(root,row=>row&&typeof row==="object"&&(
    "category" in row||"Category" in row
  )&&(
    "noOfTotalMeant" in row||"noOfSharesBid" in row||"noOfsharesBid" in row||"noOfTime" in row
  ));
}

function issueSizeCr(v:string|null|undefined){
  const s=clean(v);
  const m=s.match(/(?:Rs\.?|₹)\s*([\d,.]+)\s*(million|crore|cr\b|lakh)/i);
  if(!m)return null;
  const x=n(m[1]); if(x==null)return null;
  const u=m[2].toLowerCase();
  return u.startsWith("million")?x/10:u.startsWith("lakh")?x/100:x;
}

function normName(v:string){
  return clean(v).toLowerCase()
    .replace(/\b(limited|ltd|india|private|pvt|company|corporation|corporate|inc)\b/g," ")
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}
function parseGmpFromText(text:string,company:string){
  const t=clean(text);
  const key=normName(company);
  if(!key)return null;
  const compact=t.toLowerCase();
  const parts=key.split(" ").filter(Boolean);
  let idx=compact.indexOf(key);
  if(idx<0){
    const first=parts.slice(0,3).join(" ");
    idx=compact.indexOf(first);
  }
  if(idx<0)return null;
  const window=t.slice(idx,idx+900);
  const m=window.match(/(?:GMP|grey market premium|live gmp)[^₹0-9\-]{0,80}(?:₹\s*)?(-?\d[\d,]*(?:\.\d+)?)/i);
  if(!m)return null;
  const value=Number(m[1].replace(/,/g,""));
  return Number.isFinite(value)?value:null;
}
async function fetchSourceText(url:string){
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),2500);
    const r=await fetch(url,{signal:controller.signal,headers:{
      "User-Agent":HEADERS["User-Agent"],
      Accept:"text/html,application/xhtml+xml,application/json,text/plain,*/*"
    },cache:"no-store"});
    if(!r.ok){clearTimeout(timer);return null;}
    const text=await r.text();
    clearTimeout(timer);
    return text;
  }catch{return null;}
}
const GMP_SOURCES=[
  {name:"InvestorGain",url:"https://www.investorgain.com/"},
  {name:"IPO Watch",url:"https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/"},
  {name:"IPO Central",url:"https://ipocentral.in/ipo-grey-market-premium/"},
  {name:"GMPWatch",url:"https://www.gmpwatch.in/"}
];
function gmpUrls(ipo:Ipo,source:string){
  const special=normName(ipo.name).includes("national stock exchange");
  if(special){
    if(source==="InvestorGain")return ["https://www.investorgain.com/gmp/nse-ipo/2305/","https://investorgain.in/"];
    if(source==="IPO Watch")return ["https://ipowatch.in/nse-ipo-gmp-grey-market-premium/","https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/"];
    if(source==="IPO Central")return ["https://ipocentral.in/nse-ipo-gmp/"];
    if(source==="GMPWatch")return ["https://www.gmpwatch.in/nse-ipo-gmp-today-grey-market-premium/"];
  }
  const slug=slugId(ipo.name);
  if(source==="InvestorGain")return ["https://investorgain.in/"];
  if(source==="IPO Watch")return [`https://ipowatch.in/${slug}-ipo-gmp-grey-market-premium/`,"https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/"];
  if(source==="IPO Central")return [`https://ipocentral.in/${slug}-ipo-gmp-price-allotment/`];
  if(source==="GMPWatch")return [`https://www.gmpwatch.in/${slug}-ipo-gmp-today-grey-market-premium/`];
  return [];
}
function aliasesFor(company:string){
  const n=normName(company);
  const a=[company,n];
  if(n.includes("national stock exchange"))a.push("NSE");
  const words=n.split(" ").filter(x=>x.length>=4);
  if(words.length>=2)a.push(words.slice(0,3).join(" "));
  return [...new Set(a)];
}
function parseGmp(text:string,company:string){
  for(const alias of aliasesFor(company)){
    const rs=parseGmpFromText(text,alias);
    if(rs!=null)return rs;
  }
  return null;
}
function textAround(text:string,patterns:RegExp[],max=1800){
  const t=text.replace(//g,"");
  for(const p of patterns){
    const m=p.exec(t);
    if(m?.index!=null)return clean(t.slice(m.index,Math.min(t.length,m.index+max)));
  }
  return null;
}
function parseBusiness(text:string){
  const section=textAround(text,[/\bOUR BUSINESS\b/i,/\bBUSINESS OVERVIEW\b/i,/\bOUR BUSINESS OVERVIEW\b/i,/\bABOUT THE COMPANY\b/i],2200);
  if(!section)return null;
  return section.replace(/^(?:OUR BUSINESS|BUSINESS OVERVIEW|OUR BUSINESS OVERVIEW|ABOUT THE COMPANY)\s*/i,"").slice(0,1800).trim()||null;
}
function parseObjectsAndRisks(text:string){
  const take=(patterns:RegExp[],max=2600)=>{
    const s=textAround(text,patterns,max);
    if(!s)return [] as string[];
    return s.split(/\n|•|(?=\d+\.\s)/).map(clean).filter(x=>x.length>25).slice(0,8);
  };
  return {
    objects:take([/objects of the issue/i,/objects of issue/i,/objects of the offer/i],3200),
    risks:take([/risk factors/i,/risks in relation to the issue/i,/key risks/i],3200)
  };
}
function parseOffice(text:string){
  const s=textAround(text,[/registered office/i,/corporate office/i],900);
  if(!s)return {city:null as string|null,state:null as string|null};
  const states=["Maharashtra","Gujarat","Delhi","Karnataka","Tamil Nadu","Telangana","Rajasthan","Uttar Pradesh","West Bengal","Haryana","Punjab","Kerala","Madhya Pradesh","Andhra Pradesh","Odisha","Bihar","Jharkhand","Chhattisgarh","Goa","Uttarakhand","Assam"];
  const state=states.find(v=>new RegExp("\b"+v+"\b","i").test(s))??null;
  const cities=["Mumbai","Thane","Pune","Navi Mumbai","Ahmedabad","Vadodara","Surat","Delhi","Bengaluru","Bangalore","Chennai","Hyderabad","Jaipur","Kolkata","Noida","Gurugram","Gurgaon","Indore","Lucknow","Kochi","Rajkot","Nagpur","Nashik"];
  const city=cities.find(v=>new RegExp("\b"+v+"\b","i").test(s))??null;
  return {city,state};
}
function parseGeography(text:string){
  const section=textAround(text,[/geographical presence/i,/geographic(?:al)? presence/i,/countries in which we operate/i,/countries where we operate/i,/geographies/i],2400);
  if(!section)return {business:null,countries:[] as {country:string;business:string;salesPct:number|null}[]};
  const countries:{country:string;business:string;salesPct:number|null}[]=[];
  const rx=/\b(India|United States(?: of America)?|USA|United Kingdom|UK|UAE|United Arab Emirates|Germany|France|Italy|Singapore|Australia|Canada|Japan|Saudi Arabia|Qatar|Oman|Nepal|Bangladesh)\b[^\n%]{0,100}?(\d+(?:\.\d+)?)\s*%/gi;
  let m:RegExpExecArray|null;
  while((m=rx.exec(section))){countries.push({country:m[1],business:"",salesPct:Number(m[2])});if(countries.length>=12)break;}
  return {business:section.slice(0,1800),countries};
}
function parseFinancials(text:string){
  const t=text.replace(//g,"");
  const years=[...t.matchAll(/\b(20\d{2})\b/g)].map(m=>m[1]);
  const uniqueYears=[...new Set(years)].slice(-6);
  const pick=(patterns:RegExp[])=>{
    for(const p of patterns){
      const m=p.exec(t); if(m?.index==null)continue;
      const s=t.slice(m.index,Math.min(t.length,m.index+1200));
      const nums=[...s.matchAll(/(?:₹|Rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:crore|lakhs?|million)?/gi)].map(z=>Number(z[1].replace(/,/g,""))).filter(Number.isFinite);
      if(nums.length>=3)return nums.slice(0,3);
    }
    return [] as number[];
  };
  const rev=pick([/revenue from operations/i,/total income/i]);
  const profit=pick([/profit for the year/i,/profit after tax/i,/profit for the period/i]);
  const eps=pick([/earnings per share/i,/basic earnings per share/i,/diluted earnings per share/i]);
  const selected=uniqueYears.slice(-3).reverse();
  if(!selected.length)return {revenues:[],profits:[],eps:[]};
  const mk=(vals:number[])=>selected.map((year,i)=>({year,value:vals[i]??null}));
  return {revenues:mk(rev),profits:mk(profit),eps:mk(eps)};
}
async function fetchRhpUrlFromIssuePage(ipo:Ipo){
  try{
    if(!ipo.symbol)return null;
    const series=ipo.type==="SME"?"SME":"EQ";
    const page=NSE+"/market-data/issue-information?series="+series+"&symbol="+encodeURIComponent(String(ipo.symbol))+"&type=Active";
    const r=await fetch(page,{headers:HEADERS,cache:"no-store"});
    if(!r.ok)return null;
    const html=await r.text();
    const matches=[...html.matchAll(/href=["']([^"']+)["'][^>]*>[^<]*(?:Red Herring Prospectus|RHP|Prospectus)[^<]*</gi)];
    for(const m of matches){
      const u=m[1];
      if(/^https?:\\/\\//i.test(u))return u;
      if(u.startsWith("/"))return NSE+u;
    }
    const plain=[...html.matchAll(/https?:[^"'\\s<>]+(?:rhp|prospectus)[^"'\\s<>]*/gi)];
    return plain[0]?.[0]??null;
  }catch{return null;}
}
async function fetchOfferDocumentText(url:string){
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),7000);
    const reader="https://r.jina.ai/"+url;
    const r=await fetch(reader,{signal:controller.signal,headers:{"User-Agent":HEADERS["User-Agent"],Accept:"text/plain"},cache:"no-store"});
    clearTimeout(timer);
    if(!r.ok)return null;
    const text=await r.text();
    return text.length>500000?text.slice(0,500000):text;
  }catch{return null;}
}
async function enrichOfferDocument(ipo:Ipo,detail:unknown){
  try{
    const pageRhp=await fetchRhpUrlFromIssuePage(ipo);\n    const urls=[...new Set([...(pageRhp?[pageRhp]:[]),...documentUrlsFromDetail(detail)])];
    for(const url of urls.slice(0,3)){
      const text=await fetchOfferDocumentText(url);
      if(!text)continue;
      const business=parseBusiness(text);
      const geo=parseGeography(text);
      const fin=parseFinancials(text);
      const use=parseObjectsAndRisks(text);
      const office=parseOffice(text);
      if(business)ipo.business=business;
      if(geo.countries.length)ipo.countries=geo.countries;
      if(fin.revenues.length)ipo.revenues=fin.revenues;
      if(fin.profits.length)ipo.profits=fin.profits;
      if(fin.eps.length)ipo.eps=fin.eps;
      if(use.objects.length)ipo.objects=use.objects;
      if(use.risks.length)ipo.risks=use.risks;
      if(office.city)ipo.city=office.city;
      if(office.state)ipo.state=office.state;
      ipo.sourceUrls=[...new Set([...ipo.sourceUrls,url])];
      ipo.detailSource="NSE India issue-information + Red Herring Prospectus";
      ipo.verifiedSources=[...new Set([...ipo.verifiedSources,"NSE Red Herring Prospectus"])];
      ipo.verifiedAt=new Date().toISOString();
      if(business||geo.countries.length||fin.revenues.length||fin.profits.length||fin.eps.length||use.objects.length||use.risks.length||office.city||office.state)break;
    }
  }catch{}
  return ipo;
}
async function enrichGmp(ipo:Ipo){
  const upperBand=upper(ipo.priceBand);
  const results=await Promise.all(GMP_SOURCES.map(async s=>{
    let rs:number|null=null;
    for(const url of gmpUrls(ipo,s.name)){
      const text=await fetchSourceText(url);
      if(text){rs=parseGmp(text,ipo.name);if(rs!=null)break;}
    }
    const pct=rs!=null&&upperBand?Number(((rs/upperBand)*100).toFixed(2)):null;
    return {source:s.name,pct,rs,asOf:new Date().toISOString()};
  }));
  const valid=results.filter(x=>x.rs!=null) as Array<{source:string;pct:number|null;rs:number;asOf:string}>;
  ipo.gmpSources=results;
  ipo.gmpVerifiedSources=valid.map(x=>x.source);
  if(valid.length>=2){
    const sorted=valid.map(x=>x.rs).sort((a,b)=>a-b);
    const mid=Math.floor(sorted.length/2);
    const median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
    ipo.gmpRs=Math.round(median);
    ipo.gmpPct=upperBand?Number(((ipo.gmpRs/upperBand)*100).toFixed(2)):null;
  }else{
    ipo.gmpRs=valid.length===1?valid[0].rs:null;
    ipo.gmpPct=valid.length===1?valid[0].pct:null;
  }
  return ipo;
}

function baseNse(r:any):Ipo{
  const issuePrice=band(r.issuePrice);
  const upperPrice=upper(issuePrice);
  const offered=n(r.noOfSharesOffered);
  const bid=n(r.noOfsharesBid??r.noOfSharesBid);
  const reportedSubscription=n(r.noOfTime);
  const calculatedSubscription=offered&&bid?Number((bid/offered).toFixed(4)):null;
  const subscription=reportedSubscription!=null&&reportedSubscription>0?reportedSubscription:calculatedSubscription;
  const subscriptionAmount=bid!=null&&upperPrice!=null?Number((bid*upperPrice/10000000).toFixed(2)):null;
  return {
    symbol:r.symbol??undefined,id:slugId(r.companyName||r.symbol||"ipo"),
    name:clean(r.companyName||r.symbol||"IPO"),
    type:r.series==="SME"?"SME":"Mainboard",
    openDate:date(r.issueStartDate),closeDate:date(r.issueEndDate),listingDate:null,
    issueSize:null,minSubscription:null,subscription,subscriptionAmount,subscriptionSource:"NSE India",
    subscriptionCategories:[],gmpPct:null,gmpRs:null,gmpSources:[],gmpVerifiedSources:[],
    city:null,state:null,business:null,countries:[],revenues:[],profits:[],eps:[],
    priceBand:band(r.issuePrice),lotSize:null,faceValue:null,
    sharesOffered:n(r.noOfSharesOffered),offeredToPublic:null,retailShares:null,qibShares:null,niiShares:null,
    freshIssue:null,offerForSale:null,issueType:null,objects:[],risks:[],
    promoterHolding:null,postIssuePromoterHolding:null,moneycontrolUrl:null,
    detailSource:"NSE India official IPO data",verifiedSources:["NSE India"],sourceUrls:[NSE_PAGE],
    verifiedAt:new Date().toISOString()
  };
}
async function enrichNse(ipo:Ipo,cookie:string){
  try{
    const series=ipo.type==="SME"?"SME":"EQ";
    const symbol=String(ipo.symbol??"");
    if(!symbol)return ipo;
    const d=await fetchNse("/api/ipo-detail?symbol="+encodeURIComponent(symbol)+"&series="+series,cookie);
    const info=parseInfo(infoRowsFromDetail(d));
    const period=(info["Issue Period"]??info["Issue period"])?.match(/(\d{2}-\w{3}-\d{4})\s*to\s*(\d{2}-\w{3}-\d{4})/i);
    if(period){ipo.openDate=date(period[1]);ipo.closeDate=date(period[2]);}
    ipo.priceBand=band(info["Price Range"]??info["Price range"])||ipo.priceBand;
    const lotText=info["Bid Lot"]??info["Bid lot"]??info["Minimum Order Quantity"]??info["Minimum order quantity"];
    const lot=clean(lotText).match(/([\d,]+)\s*(?:Equity Shares|shares?)/i);
    ipo.lotSize=n(lot?.[1])??ipo.lotSize;
    ipo.faceValue=n((info["Face Value"]??info["Face value"])?.match(/[\d,.]+/)?.[0])??ipo.faceValue;
    ipo.issueSize=issueSizeCr(info["Issue Size"]??info["Issue size"])??ipo.issueSize;
    const high=upper(info["Price Range"]);
    const low=clean(info["Price Range"]).match(/(?:Rs\.?|₹)?\s*([\d,.]+)\s*(?:-|to|–)/i);
    const lowPrice=n(low?.[1]);
    const applicationPrice=lowPrice??high;
    if(ipo.lotSize&&applicationPrice){
      const lotValue=ipo.lotSize*applicationPrice;
      // SME individual applications require at least 2 lots and a bid value above ₹2 lakh.
      const minimumLots=ipo.type==="SME"?Math.max(2,Math.ceil(200000/lotValue)):1;
      ipo.minSubscription=ipo.lotSize*minimumLots*applicationPrice;
    }
    const cats=categoryRowsFromDetail(d);
    const mapped:{category:string;value:number|null}[]=[];
    let totalBidShares=0;
    for(const row of cats){
      if(!row||row.srNo==="Sr.No.")continue;
      const label=clean(row.category??row.Category??row.investorCategory??row.name).toLowerCase();
      const value=n(row.noOfTotalMeant??row.noOfTime??row.subscription??row.noOfTimes);
      const bid=n(row.noOfsharesBid??row.noOfSharesBid??row.sharesBid);
      if(bid!=null)totalBidShares+=bid;
      if(label.includes("qualified")||label.includes("qib")||String(row.srNo)==="1")mapped.push({category:"QIB",value});
      else if(label.includes("non institutional")||label.includes("nii")||label.includes("hni")||String(row.srNo)==="2")mapped.push({category:"NII",value});
      else if(label.includes("retail")||label.includes("individual")||String(row.srNo)==="3")mapped.push({category:"Retail",value});
      else if(label.includes("total"))ipo.subscription=value;
    }
    ipo.subscriptionCategories=mapped;
    if(ipo.subscription==null&&mapped.length){
      const vals=mapped.map(x=>x.value).filter((x):x is number=>x!=null);
      if(vals.length)ipo.subscription=Math.max(...vals);
    }
    if(ipo.subscription==null&&ipo.sharesOffered&&totalBidShares>0){
      ipo.subscription=Number((totalBidShares/ipo.sharesOffered).toFixed(4));
    }
    if(ipo.subscription==null&&mapped.length){
      const vals=mapped.map(x=>x.value).filter((x):x is number=>x!=null);
      if(vals.length)ipo.subscription=Math.max(...vals);
    }
    ipo.subscriptionAmount=totalBidShares>0&&high?Number((totalBidShares*high/10000000).toFixed(2)):ipo.issueSize!=null&&ipo.subscription!=null?Number((ipo.issueSize*ipo.subscription).toFixed(2)):ipo.subscriptionAmount;
    ipo.subscriptionSource="NSE India";
    ipo.detailSource="NSE India official issue-information";
    ipo.verifiedSources=["NSE India","NSE India issue-information"];
    ipo.verifiedAt=new Date().toISOString();
  }catch{
    // Never substitute third-party suggestions or hard-coded IPO values.
  }
  return ipo;
}
async function loadNse(){
  const cookie=await nseSession();
  const [current,upcoming]=await Promise.all([
    fetchNse("/api/ipo-current-issue",cookie),
    fetchNse("/api/all-upcoming-issues?category=ipo",cookie)
  ]);
  const today=new Date().toISOString().slice(0,10);
  const map=new Map<string,Ipo>();
  const rows=[...rowsFromNse(current),...rowsFromNse(upcoming)];
  for(const r of rows){
    if(!r?.companyName && !r?.symbol && !r?.company)continue;
    if(!r.companyName && r.company) r.companyName=r.company;
    const ipo=baseNse(r);
    if(ipo.closeDate&&ipo.closeDate<today)continue;
    const previous=map.get(ipo.id);
    if(!previous||r.status==="Active")map.set(ipo.id,ipo);
  }
  const result:Ipo[]=[];
  for(const ipo of map.values()){
    const enriched=await enrichNse(ipo,cookie);
    try{ result.push(await enrichGmp(enriched)); }catch{ result.push(enriched); }
  }
  return result
    .filter(x=>!!x.closeDate&&x.closeDate>=today)
    .sort((a,b)=>(a.openDate??"").localeCompare(b.openDate??"")||a.name.localeCompare(b.name));
}
export const fetchOpenIposLive=createServerFn({method:"GET"}).handler(async()=>{
  const hit=cache.get("nse");
  if(hit&&hit.expires>Date.now())return hit.value;
  try{
    const value=await loadNse();
    cache.set("nse",{expires:Date.now()+60000,value});
    return value;
  }catch{
    const empty:Ipo[]=[];
    cache.set("nse",{expires:Date.now()+15000,value:empty});
    return empty;
  }
});


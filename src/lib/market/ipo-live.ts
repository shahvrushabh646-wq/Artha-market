import { createServerFn } from "@tanstack/react-start";
type Ipo={officialWebsite?:string|null;prospectusUrl?:string|null;prospectusType?:"DRHP"|"RHP"|"Prospectus"|"Abridged Prospectus"|null;symbol?:string;exchange?:"NSE India"|"BSE India";id:string;name:string;type:"Mainboard"|"SME";openDate:string|null;closeDate:string|null;listingDate:string|null;issueSize:number|null;minSubscription:number|null;subscription:number|null;subscriptionAmount:number|null;subscriptionSource:string|null;subscriptionCategories:{category:string;value:number|null}[];gmpPct:number|null;gmpRs:number|null;gmpSources:{source:string;url:string|null;pct:number|null;rs:number|null;asOf:string|null}[];gmpVerifiedSources:string[];city:string|null;state:string|null;business:string|null;countries:{country:string;business:string;salesPct:number|null}[];revenues:{year:string;value:number|null}[];profits:{year:string;value:number|null}[];eps:{year:string;value:number|null}[];priceBand:string|null;lotSize:number|null;faceValue:number|null;sharesOffered:number|null;offeredToPublic:number|null;retailShares:number|null;qibShares:number|null;niiShares:number|null;freshIssue:number|null;offerForSale:number|null;issueType:string|null;objects:string[];risks:string[];promoterHolding:number|null;postIssuePromoterHolding:number|null;moneycontrolUrl:string|null;detailSource:string|null;verifiedSources:string[];sourceUrls:string[];verifiedAt:string};
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
  {name:"Groww",hosts:["groww.in"],priority:70},
  {name:"Zerodha",hosts:["zerodha.com"],priority:70},
  {name:"Angel One",hosts:["angelone.in"],priority:70},
  {name:"Upstox",hosts:["upstox.com"],priority:70},
  {name:"InvestorGain",hosts:["investorgain.com"],priority:68},
  {name:"IPO Watch",hosts:["ipowatch.in"],priority:68},
  {name:"IPO Central",hosts:["ipocentral.in"],priority:68}
];
function domainOf(url:string){try{return new URL(url).hostname.replace(/^www\./,"").toLowerCase();}catch{return "";}}
function sourceName(url:string){const d=domainOf(url);const known=SOURCE_RULES.find(x=>x.hosts.some(h=>d===h||d.endsWith("."+h)));return known?.name??d;}
function sourcePriority(url:string){const d=domainOf(url);return SOURCE_RULES.find(x=>x.hosts.some(h=>d===h||d.endsWith("."+h)))?.priority??40;}
function firstText(s:string,patterns:RegExp[]){for(const p of patterns){const m=s.match(p);if(m?.[1])return clean(m[1]);}return null;}
function numberList(s:string,patterns:RegExp[],limit=3){for(const p of patterns){const ms=[...s.matchAll(p)];if(ms.length)return ms.slice(0,limit).map(m=>n(m[1])).filter((x):x is number=>x!=null);}return [];}
async function researchSearch(query:string):Promise<string[]>{
  try{
    const u="https://r.jina.ai/http://www.google.com/search?q="+encodeURIComponent(query);
    const r=await fetch(u,{headers:{Accept:"text/plain"},cache:"no-store"});
    if(!r.ok)return [];
    const t=await r.text();const urls:string[]=[];
    const add=(value:string)=>{
      const url=value.replace(/&amp;/g,"&").replace(/[),.;]+$/,"");
      if(/^https?:\/\//i.test(url)&&!urls.includes(url))urls.push(url);
    };
    for(const m of t.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g))add(m[1]);
    for(const m of t.matchAll(/\((https?:\/\/[^\s)]+)\)/g))add(m[1]);
    for(const m of t.matchAll(/https?:\/\/[^\s)\]">]+/g))add(m[0]);
    return urls.slice(0,16);
  }catch{return [];}
}
async function readResearchUrl(url:string):Promise<string>{
  try{
    const r=await fetch("https://r.jina.ai/"+url,{headers:{Accept:"text/plain"},cache:"no-store"});
    if(!r.ok)return "";
    return (await r.text()).slice(0,45000);
  }catch{return "";}
}
function parseGmpValue(text:string){
  const s=clean(text);
  const patterns=[
    /(?:grey market premium|gmp)[^₹0-9]{0,80}(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)/i,
    /(?:gmp)[^₹0-9]{0,30}(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:per share)?/i
  ];
  for(const p of patterns){const m=s.match(p);const value=n(m?.[1]);if(value!=null)return value;}
  return null;
}
async function enrichGmp(ipo:Ipo){
  try{
    const name=ipo.name.replace(/\b(IPO|LIMITED|LTD\.?|PRIVATE|PVT\.?)\b/gi," ").replace(/\s+/g," ").trim();
    const urls=await researchSearch(name+" IPO GMP grey market premium");
    const preferred=[...new Set(urls)].filter(u=>/investorgain|ipowatch|ipocentral|chittorgarh|moneycontrol|groww|economictimes/i.test(u)).slice(0,8);
    const sources:{source:string;url:string|null;pct:number|null;rs:number|null;asOf:string|null}[]=[];
    for(const url of preferred){
      const text=await readResearchUrl(url);
      const rs=parseGmpValue(text);
      if(rs==null)continue;
      const high=upper(ipo.priceBand);
      const pct=high?Number(((rs/high)*100).toFixed(2)):null;
      sources.push({source:sourceName(url),url,pct,rs,asOf:new Date().toISOString()});
    }
    if(sources.length){
      const unique=sources.filter((x,i,a)=>a.findIndex(y=>y.source===x.source)===i);
      const values=unique.map(x=>x.rs).filter((x):x is number=>x!=null).sort((a,b)=>a-b);
      const median=values.length?values[Math.floor(values.length/2)]:null;
      ipo.gmpRs=median;
      const high=upper(ipo.priceBand);
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
}
function isCompanyOfficialUrl(url:string,name:string){const d=domainOf(url);if(!d||/sebi\.gov\.in|nseindia\.com|bseindia\.com|chittorgarh\.com|moneycontrol\.com|economictimes\.indiatimes\.com|groww\.in|zerodha\.com|angelone\.in|upstox\.com|investorgain\.com|ipowatch\.in|ipocentral\.in/.test(d))return false;const tokens=name.toLowerCase().replace(/\b(limited|ltd|private|pvt|ipo)\b/g," ").split(/[^a-z0-9]+/).filter(x=>x.length>=3);return tokens.some(t=>d.includes(t));}
function prospectusTypeFromUrl(url:string,text:string){const s=(url+" "+text).toLowerCase();if(/\bdrhp\b|draft red herring/.test(s))return "DRHP" as const;if(/\brhp\b|red herring prospectus/.test(s))return "RHP" as const;if(/abridged prospectus/.test(s))return "Abridged Prospectus" as const;if(/prospectus/.test(s))return "Prospectus" as const;return null;}
function extractOfficialAndProspectus(ipo:Ipo,hits:ResearchHit[]){const official=hits.find(h=>isCompanyOfficialUrl(h.url,ipo.name));const docs=hits.filter(h=>/sebi\.gov\.in|nseindia\.com|bseindia\.com/.test(h.domain)||/prospectus|rhp|drhp/i.test(h.url+" "+h.text));const doc=docs.sort((a,b)=>{const rank=(h:ResearchHit)=>{const t=(h.url+" "+h.text).toLowerCase();return /\bprospectus\b/.test(t)&&!/drhp|rhp/.test(t)?4:/\brhp\b|red herring/.test(t)?3:/\bdrhp\b|draft red herring/.test(t)?2:/abridged prospectus/.test(t)?1:0};return rank(b)-rank(a)||b.priority-a.priority;})[0];if(official)ipo.officialWebsite=official.url.split("/").slice(0,3).join("/");if(doc){ipo.prospectusUrl=doc.url;ipo.prospectusType=prospectusTypeFromUrl(doc.url,doc.text);}}
async function universalResearch(ipo:Ipo){const hits=await researchHits(ipo);if(hits.length){applyResearchText(ipo,hits);extractOfficialAndProspectus(ipo,hits);ipo.verifiedSources=[...new Set(hits.map(h=>sourceName(h.url)))];ipo.sourceUrls=[...new Set(hits.map(h=>h.url))];ipo.detailSource=hits.find(h=>h.priority>=96)?.url??hits[0].url;}await enrichGmp(ipo);ipo.verifiedAt=new Date().toISOString();return ipo;}

function baseNse(r:any):Ipo{
  const issuePrice=band(r.issuePrice);
  const upperPrice=upper(issuePrice);
  const offered=n(r.noOfSharesOffered);
  const bid=n(r.noOfsharesBid??r.noOfSharesBid);
  const reportedSubscription=n(r.noOfTime);
  const calculatedSubscription=offered&&bid?Number((bid/offered).toFixed(4)):null;
  const subscription=reportedSubscription!=null&&reportedSubscription>0?Number(reportedSubscription.toFixed(2)):r.status==="Active"&&offered!=null&&bid!=null?Number((bid/offered).toFixed(2)):calculatedSubscription;
  const subscriptionAmount=bid!=null&&bid>0&&upperPrice!=null?Number((bid*upperPrice/10000000).toFixed(2)):null;
  return {
    officialWebsite:null,prospectusUrl:null,prospectusType:null,
    symbol:r.symbol??undefined,exchange:r.isBse==="1"?"BSE India":"NSE India",id:slugId(r.companyName||r.symbol||"ipo"),
    name:clean(r.companyName||r.symbol||"IPO"),
    type:r.series==="SME"?"SME":"Mainboard",
    openDate:date(r.issueStartDate),closeDate:date(r.issueEndDate),listingDate:null,
    issueSize:null,minSubscription:null,subscription,subscriptionAmount,subscriptionSource:r.isBse==="1"?"BSE India":"NSE India",
    subscriptionCategories:[],gmpPct:null,gmpRs:null,gmpSources:[],gmpVerifiedSources:[],
    city:null,state:null,business:null,countries:[],revenues:[],profits:[],eps:[],
    priceBand:band(r.issuePrice),lotSize:null,faceValue:null,
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
    const lot=info["Bid Lot"]?.match(/([\d,]+)\s*Equity Shares/i);
    ipo.lotSize=n(lot?.[1])??ipo.lotSize;
    ipo.faceValue=n(info["Face Value"]?.match(/[\d,.]+/)?.[0])??ipo.faceValue;
    ipo.issueSize=issueSizeCr(info["Issue Size"])??ipo.issueSize;
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
    const cats=rowsFromCategory(d?.activeCat);
    const grouped=new Map<string,Array<{label:string;row:any;value:number|null}>>();
    for(const row of cats){
      if(!row||row.srNo==="Sr.No.")continue;
      const label=clean(row.category??row.Category??row.investorCategory??row.name).toLowerCase();
      if(label.includes("total")&&!label.includes("qib")&&!label.includes("nii")){
        const total=n(row.noOfTotalMeant??row.noOfTime??row.subscription??row.noOfTimes);
        if(total!=null)ipo.subscription=Number(total.toFixed(2));
        continue;
      }
      const category=label.includes("qualified")||label.includes("qib")?"QIB"
        :label.includes("non institutional")||label.includes("non-institutional")||label.includes("nii")||label.includes("hni")?"NII"
        :label.includes("retail")||label.includes("individual")?"Retail":null;
      if(!category)continue;
      const valueRaw=n(row.noOfTotalMeant??row.noOfTime??row.subscription??row.noOfTimes);
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
          const value=n(row?.noOfTime??row?.subscription??row?.noOfTimes);
          if(value!=null){ipo.subscription=Number(value.toFixed(2));break;}
        }
      }
    }
    const bidRows=rowsFromNse(d?.bidDetails??d?.subscriptionData??d?.biddingData);
    const bidShares=bidRows.reduce((sum,row)=>sum+(n(row?.noOfsharesBid??row?.noOfSharesBid??row?.sharesBid)??0),0);
    if(bidShares>0&&high)ipo.subscriptionAmount=Number((bidShares*high/10000000).toFixed(2));
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
  for(const r of [...rowsFromNse(current),...rowsFromNse(upcoming)]){
    if(!r?.companyName && !r?.symbol && !r?.company)continue;
    if(!r.companyName && r.company) r.companyName=r.company;
    const ipo=baseNse(r);
    // Preserve any direct minimum-application value exposed by NSE when available.
    ipo.minSubscription=n(
      r.minSubscription??r.minimumApplication??r.minimumInvestment??r.minInvestment??
      r.minBidValue??r.minimumBidValue
    )??ipo.minSubscription;
    if(ipo.closeDate&&ipo.closeDate<today)continue;
    const previous=map.get(ipo.id);
    if(!previous||r.status==="Active")map.set(ipo.id,ipo);
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
        new Promise<Ipo>(resolve=>setTimeout(()=>resolve(ipo),3500))
      ]);
    }catch{return ipo;}
  }));
  const byId=new Map(enriched.map(x=>[x.id,x]));
  return base.map(x=>byId.get(x.id)??x)
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

export const fetchIpoDetailLive=createServerFn({method:"GET"}).handler(async({data}:{data:{id:string}})=>{
  const list=await loadNse();
  const ipo=list.find(x=>x.id===data.id);
  if(!ipo)return null;
  try{
    return await Promise.race([
      universalResearch(ipo),
      new Promise<Ipo>(resolve=>setTimeout(()=>resolve(ipo),15000))
    ]);
  }catch{return ipo;}
});

import { createServerFn } from "@tanstack/react-start";
type Ipo={symbol?:string;exchange?:"NSE India"|"BSE India";id:string;name:string;type:"Mainboard"|"SME";openDate:string|null;closeDate:string|null;listingDate:string|null;issueSize:number|null;minSubscription:number|null;subscription:number|null;subscriptionAmount:number|null;subscriptionSource:string|null;subscriptionCategories:{category:string;value:number|null}[];gmpPct:number|null;gmpRs:number|null;gmpSources:{source:string;url:string|null;pct:number|null;rs:number|null;asOf:string|null}[];gmpVerifiedSources:string[];city:string|null;state:string|null;business:string|null;countries:{country:string;business:string;salesPct:number|null}[];revenues:{year:string;value:number|null}[];profits:{year:string;value:number|null}[];eps:{year:string;value:number|null}[];priceBand:string|null;lotSize:number|null;faceValue:number|null;sharesOffered:number|null;offeredToPublic:number|null;retailShares:number|null;qibShares:number|null;niiShares:number|null;freshIssue:number|null;offerForSale:number|null;issueType:string|null;objects:string[];risks:string[];promoterHolding:number|null;postIssuePromoterHolding:number|null;moneycontrolUrl:string|null;detailSource:string|null;verifiedSources:string[];sourceUrls:string[];verifiedAt:string};
type SamcoIpo={id:string;slug:string;company_name:string;type:string;company_profile:string;issue_type:string;issue_open:string;issue_close:string;listed_date:string;face_value:string;price_band:string;bid_lot:string;minimum_order:string;listing:string;issue_size:string;fresh_issue:string;ofs:string;obj_issue:string;key_strengths:string;risks:string;RHP_url:string;knowledge_center_url:string};

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

async function fetchHtml(url:string){
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    const r=await fetch(url,{signal:controller.signal,headers:{"User-Agent":HEADERS["User-Agent"],Accept:"text/html,application/xhtml+xml,text/plain,*/*"},cache:"no-store"});
    const text=await r.text(); clearTimeout(timer); return r.ok?text:"";
  }catch{return "";}
}
function parseMoneycontrolIpos(html:string):Ipo[]{
  const text=clean(html); const out:Ipo[]=[];
  const re=/([A-Z][A-Za-z0-9&().,'’ -]{2,100}?)\\s+IPO\\s+opens for subscription on\\s+(\\d{1,2}\\s+[A-Za-z]{3},\\s+\\d{4})\\s+and closes on\\s+(\\d{1,2}\\s+[A-Za-z]{3},\\s+\\d{4})\\.\\s+[^.]{0,120}?price band is set at\\s+([\\d,.]+)\\s+to\\s+([\\d,.]+)\\s+per share\\./gi;
  let m:RegExpExecArray|null;
  while((m=re.exec(text))!==null){
    const name=clean(m[1]); if(!name||out.some(x=>normName(x.name)===normName(name)))continue;
    const low=n(m[5]),high=n(m[6]);
    out.push({symbol:undefined,exchange:"NSE India",id:slugId(name),name,type:"Mainboard",openDate:date(m[2]),closeDate:date(m[3]),listingDate:null,issueSize:null,minSubscription:null,subscription:null,subscriptionAmount:null,subscriptionSource:"Moneycontrol",subscriptionCategories:[],gmpPct:null,gmpRs:null,gmpSources:[],gmpVerifiedSources:[],city:null,state:null,business:null,countries:[],revenues:[],profits:[],eps:[],priceBand:low!=null&&high!=null?"₹"+low.toLocaleString("en-IN")+" - ₹"+high.toLocaleString("en-IN"):null,lotSize:null,faceValue:null,sharesOffered:null,offeredToPublic:null,retailShares:null,qibShares:null,niiShares:null,freshIssue:null,offerForSale:null,issueType:null,objects:[],risks:[],promoterHolding:null,postIssuePromoterHolding:null,moneycontrolUrl:"https://www.moneycontrol.com/ipo/open-ipos/",detailSource:"Moneycontrol IPO",verifiedSources:["Moneycontrol"],sourceUrls:["https://www.moneycontrol.com/ipo/open-ipos/"],verifiedAt:new Date().toISOString()});
  } return out;
}
async function fetchBrokerFallback():Promise<Ipo[]>{
  const sources=["https://www.moneycontrol.com/ipo/open-ipos/","https://zerodha.com/ipo/","https://www.angelone.in/ipo/nse-ipo"];
  for(const url of sources){
    const html=await fetchHtml(url); if(!html)continue;
    const rows=url.includes("moneycontrol")?parseMoneycontrolIpos(html):parseMoneycontrolIpos(html);
    if(rows.length)return rows.filter(x=>!x.closeDate||x.closeDate>=new Date().toISOString().slice(0,10));
  } return [];
}
async function fetchGrowwFallback(): Promise<Ipo[]>{
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),9000);
    const r=await fetch("https://groww.in/ipo",{
      signal:controller.signal,
      headers:{"User-Agent":HEADERS["User-Agent"],Accept:"text/html,application/xhtml+xml,text/html,*/*"},
      cache:"no-store"
    });
    const html=await r.text();
    clearTimeout(timer);
    if(!r.ok)return [];
    const m=html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
    if(!m)return [];
    const next=JSON.parse(m[1]) as any;
    const page=next?.props?.pageProps??{};
    const rows=[...(page.openDataList??[]),...(page.upcomingDataList??[])];
    const today=new Date().toISOString().slice(0,10);
    const out:Ipo[]=[];
    for(const row of rows){
      const name=clean(row?.companyName);
      if(!name)continue;
      const cats=Array.isArray(row?.categories)?row.categories:[];
      const cat=cats[0]??{};
      const open=row?.bidStartTimestamp?new Date(Number(row.bidStartTimestamp)).toISOString().slice(0,10):null;
      const close=row?.bidEndTimestamp?new Date(Number(row.bidEndTimestamp)).toISOString().slice(0,10):null;
      if(close&&close<today)continue;
      const low=n(cat?.minPrice), high=n(cat?.maxPrice);
      const priceBand=low!=null&&high!=null?`₹${low.toLocaleString("en-IN")} - ₹${high.toLocaleString("en-IN")}`:null;
      const lot=n(cat?.lotSize??cat?.minBidQuantity);
      const minBid=n(cat?.minBidQuantity);
      const minSubscription=high!=null&&minBid!=null?high*minBid:null;
      const subscription=n(row?.overallSubscription);
      out.push({
        symbol:row?.symbol,exchange:"NSE India",id:slugId(name),name,type:row?.isSme?"SME":"Mainboard",
        openDate:open,closeDate:close,listingDate:null,issueSize:n(row?.issueSize),minSubscription,
        subscription,subscriptionAmount:null,subscriptionSource:"Groww",
        subscriptionCategories:cats.map((x:any)=>({category:clean(x?.categoryLabel??x?.category),value:n(x?.subscriptionRate)})).filter((x:any)=>x.category),
        gmpPct:null,gmpRs:null,gmpSources:[],gmpVerifiedSources:[],
        city:null,state:null,business:null,countries:[],revenues:[],profits:[],eps:[],
        priceBand,lotSize:lot,faceValue:null,sharesOffered:null,offeredToPublic:null,retailShares:null,qibShares:null,niiShares:null,
        freshIssue:null,offerForSale:null,issueType:null,objects:[],risks:[],
        promoterHolding:null,postIssuePromoterHolding:null,moneycontrolUrl:null,
        detailSource:"Groww IPO dashboard",verifiedSources:["Groww"],sourceUrls:["https://groww.in/ipo"],verifiedAt:new Date().toISOString()
      });
    }
    return out;
  }catch{return []}
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
  // Keep the match close to this IPO row so a neighbouring IPO's premium
  // can never be attributed to the requested company.
  const window=t.slice(idx,idx+260);
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
  const aliases=aliasesFor(company);
  const rows=[...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>clean(m[1]));
  // On tracker pages, require the company and GMP to occur in the same table row.
  if(rows.length){
    for(const row of rows){
      if(!aliases.some(alias=>normName(row).includes(normName(alias))))continue;
      for(const alias of aliases){
        const rs=parseGmpFromText(row,alias);        if(rs!=null)return rs;
      }
    }
    return null;
  }
  for(const alias of aliases){
    const rs=parseGmpFromText(text,alias);
    if(rs!=null)return rs;
  }
  return null;
}
async function enrichGmp(ipo:Ipo){
  const upperBand=upper(ipo.priceBand);
  const results=await Promise.all(GMP_SOURCES.map(async s=>{
    let rs:number|null=null;
    let matchedUrl:string|null=null;
    for(const url of gmpUrls(ipo,s.name)){
      const text=await fetchSourceText(url);
      if(text){rs=parseGmp(text,ipo.name);if(rs!=null){matchedUrl=url;break;}}
    }
    const pct=rs!=null&&upperBand?Number(((rs/upperBand)*100).toFixed(2)):null;
    return {source:s.name,url:matchedUrl,pct,rs,asOf:rs!=null?new Date().toISOString():null};
  }));
  const valid=results.filter(x=>x.rs!=null) as Array<{source:string;url:string|null;pct:number|null;rs:number;asOf:string|null}>;
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


function htmlMeta(html:string,name:string){
  const lower=html.toLowerCase();
  const target=name.toLowerCase();
  const keys=["name","property"];
  for(const key of keys){
    let pos=0;
    while((pos=lower.indexOf("<meta",pos))>=0){
      const close=lower.indexOf(">",pos);
      if(close<0)break;
      const tag=html.slice(pos,close+1);
      const tagLower=tag.toLowerCase();
      const marker=key+"=";
      const mi=tagLower.indexOf(marker);
      if(mi>=0){
        const rest=tag.slice(mi+marker.length).trim();
        const quote=rest[0];
        if(quote === '"' || quote === "'"){
          const qend=rest.indexOf(quote,1);
          if(qend>0&&rest.slice(1,qend).toLowerCase()===target){
            const ci=tagLower.indexOf("content=");
            if(ci>=0){
              const cr=tag.slice(ci+8).trim();
              const cq=cr[0];
              if(cq === '"' || cq === "'"){
                const ce=cr.indexOf(cq,1);
                if(ce>0)return cr.slice(1,ce);
              }
            }
          }
        }
      }
      pos=close+1;
    }
  }
  return null;
}
function stripHtml(s:string){
  let out=s;
  while(true){
    const a=out.toLowerCase().indexOf("<script");
    if(a<0)break;
    const b=out.toLowerCase().indexOf("</script>",a);
    out=b<0?out.slice(0,a):out.slice(0,a)+" "+out.slice(b+9);
  }
  while(true){
    const a=out.toLowerCase().indexOf("<style");
    if(a<0)break;
    const b=out.toLowerCase().indexOf("</style>",a);
    out=b<0?out.slice(0,a):out.slice(0,a)+" "+out.slice(b+8);
  }
  return clean(out);
}
async function duckSearch(query:string){
  try{
    const r=await fetch("https://html.duckduckgo.com/html/?q="+encodeURIComponent(query),{headers:{"User-Agent":HEADERS["User-Agent"],Accept:"text/html,text/plain,*/*"},cache:"no-store"});
    if(!r.ok)return [] as Array<{title:string;url:string;snippet:string}>;
    const html=await r.text();
    const out:Array<{title:string;url:string;snippet:string}>=[];
    let pos=0;
    while(out.length<8){
      const marker=html.indexOf("result__a",pos);
      if(marker<0)break;
      const a=html.lastIndexOf("<a",marker);
      const b=html.indexOf("</a>",marker);
      if(a<0||b<0)break;
      const tagEnd=html.indexOf(">",a);
      if(tagEnd<0||tagEnd>b)break;
      const tag=html.slice(a,tagEnd+1);
      const hrefMarker="href=";
      const hi=tag.toLowerCase().indexOf(hrefMarker);
      if(hi>=0){
        const rest=tag.slice(hi+hrefMarker.length).trim();
        const q=rest[0];
        if(q === '"' || q === "'"){
          const qe=rest.indexOf(q,1);
          if(qe>0){
            out.push({title:stripHtml(html.slice(tagEnd+1,b)),url:rest.slice(1,qe),snippet:""});
          }
        }
      }
      pos=b+4;
    }
    return out;
  }catch{return [] as Array<{title:string;url:string;snippet:string}>}
}
function looksLikeCompanySite(url:string){
  try{
    const host=new URL(url).hostname.toLowerCase().replace(/^www\./,"");
    return !/(nseindia|bseindia|sebi|moneycontrol|economictimes|business-standard|financialexpress|reuters|indiatoday|linkedin|facebook|instagram|youtube|wikipedia|ipowatch|ipocentral|investorgain|gmpwatch|groww|zerodha|upstox)/.test(host);
  }catch{return false;}
}
function parseMoneycontrolDetail(html:string,ipo:Ipo){
  const text=stripHtml(html);
  const put=(key:string,value:string)=>{if(!value)return;ipo.sourceUrls=[...new Set([...ipo.sourceUrls,key])];};
  const pickNumber=(re:RegExp)=>{const m=text.match(re);return m?n(m[1]):null;};
  const bandMatch=text.match(/Issue Price[^₹0-9]{0,40}₹?\\s*([0-9,.]+)\\s*(?:-|to|–)\\s*₹?\\s*([0-9,.]+)/i);
  if(!ipo.priceBand&&bandMatch)ipo.priceBand="₹"+Number(bandMatch[1].replace(/,/g,"")).toLocaleString("en-IN")+" - ₹"+Number(bandMatch[2].replace(/,/g,"")).toLocaleString("en-IN");
  const lot=pickNumber(/Lot Size[^0-9]{0,30}([0-9,]+)/i); if(ipo.lotSize==null&&lot!=null)ipo.lotSize=lot;
  const issue=pickNumber(/Issue Size[^₹0-9]{0,40}(?:₹\\s*)?([0-9,.]+)\\s*Cr/i); if(ipo.issueSize==null&&issue!=null)ipo.issueSize=issue;
  const face=pickNumber(/Face Value[^₹0-9]{0,30}(?:₹\\s*)?([0-9,.]+)/i); if(ipo.faceValue==null&&face!=null)ipo.faceValue=face;
  const pre=pickNumber(/Pre Issue Promoters Holding[^0-9]{0,20}([0-9.]+)%/i); if(ipo.promoterHolding==null&&pre!=null)ipo.promoterHolding=pre;
  const post=pickNumber(/Post Issue Promoters Holding[^0-9]{0,20}([0-9.]+)%/i); if(ipo.postIssuePromoterHolding==null&&post!=null)ipo.postIssuePromoterHolding=post;
  const open=text.match(/Open Date[^0-9]{0,20}(\\d{1,2}\\s+[A-Za-z]{3},\\s+\\d{4})/i); if(!ipo.openDate&&open)ipo.openDate=date(open[1]);
  const close=text.match(/Close Date[^0-9]{0,20}(\\d{1,2}\\s+[A-Za-z]{3},\\s+\\d{4})/i); if(!ipo.closeDate&&close)ipo.closeDate=date(close[1]);
  const list=text.match(/Listing Date[^0-9]{0,20}(\\d{1,2}\\s+[A-Za-z]{3},\\s+\\d{4})/i); if(!ipo.listingDate&&list)ipo.listingDate=date(list[1]);
  const business=text.match(/Company Info[\\s\\S]{0,3000}?About Product[\\s\\S]{0,1200}?((?:We|The company|It is)[^\\n]{80,900})/i);
  if(!ipo.business){
    const candidates=[
      text.match(/Company Info[\\s\\S]{0,2000}?About Product[\\s\\S]{0,1200}/i)?.[0],
      text.match(/(?:operates|engaged in|provides|offers|is a)[^.!?]{80,700}[.!?]/i)?.[0]
    ].filter(Boolean) as string[];
    if(candidates.length)ipo.business=clean(candidates[0]).slice(-700);
  }
  const objective=text.match(/Objective of Issue[\\s\\S]{0,1800}?(?:Industry Overview|Managing Director|Promoters|Registrar)/i)?.[0];
  if(objective){
    const items=[...objective.matchAll(/(?:^|[.\\n])\\s*(?:[0-9]+[.)]|[•-])\\s*([^\\n]{20,350})/g)].map(x=>clean(x[1])).filter(Boolean);
    if(items.length)ipo.objects=[...new Set(items)].slice(0,8);
  }
  const risks=text.match(/(?:Key Risks|Risk Factors|Risks)[\\s\\S]{0,2500}?(?:Financials|Company Info|Objective of Issue|Industry Overview)/i)?.[0];
  if(risks){
    const items=[...risks.matchAll(/(?:[0-9]+[.)]|[•-])\\s*([^\\n]{25,450})/g)].map(x=>clean(x[1])).filter(Boolean);
    if(items.length)ipo.risks=[...new Set(items)].slice(0,8);
  }
  const fresh=pickNumber(/Fresh Issue[^₹0-9]{0,30}(?:₹\\s*)?([0-9,.]+)\\s*Cr/i);
  if(ipo.freshIssue==null&&fresh!=null)ipo.freshIssue=fresh;
  const ofs=pickNumber(/Offer For Sale|OFS/);
  if(ipo.offerForSale==null){
    const om=text.match(/Offer[- ]For[- ]Sale[^₹0-9]{0,40}(?:₹\\s*)?([0-9,.]+)\\s*Cr/i);
    if(om)ipo.offerForSale=n(om[1]);
  }
  if(!ipo.issueType){
    const im=text.match(/Issue Type[^\\n]{0,100}/i)?.[0];
    if(im)ipo.issueType=clean(im.replace(/Issue Type/i,""));
  }
  const retail=text.match(/Retail[^\\n]{0,100}?([0-9,]+)\\s*\\(/i); if(ipo.retailShares==null&&retail)ipo.retailShares=n(retail[1]);
  const qib=text.match(/Qualified Institutional Buyers[^\\n]{0,100}?([0-9,]+)\\s*\\(/i); if(ipo.qibShares==null&&qib)ipo.qibShares=n(qib[1]);
  const nii=text.match(/Non-Instituional Investor[^\\n]{0,100}?([0-9,]+)\\s*\\(/i); if(ipo.niiShares==null&&nii)ipo.niiShares=n(nii[1]);

  const finRows:{year:string;revenue:number|null;profit:number|null;eps:number|null}[]=[];
  const finRe=/(?:Revenue|Revenue from operations|Net Profit|Profit)[^0-9]{0,80}(?:for|in)?\\s*(20\\d{2})[^₹0-9]{0,80}(?:Rs\\.?|₹)\\s*([0-9,.]+)\\s*Cr/gi;
  for(const m of text.matchAll(finRe)){finRows.push({year:m[1],revenue:/Revenue/i.test(m[0])?n(m[2]):null,profit:/Profit/i.test(m[0])?n(m[2]):null,eps:null});}
  const years=[...new Set(finRows.map(x=>x.year))];
  if(finRows.length){
    const map=new Map<string,{year:string;revenue:number|null;profit:number|null;eps:number|null}>();
    for(const r of finRows){const x=map.get(r.year)??{year:r.year,revenue:null,profit:null,eps:null};x.revenue=x.revenue??r.revenue;x.profit=x.profit??r.profit;map.set(r.year,x);}
    const arr=[...map.values()].sort((a,b)=>a.year.localeCompare(b.year)).slice(-3);
    ipo.revenues=arr.map(x=>({year:x.year,value:x.revenue})).filter(x=>x.value!=null);
    ipo.profits=arr.map(x=>({year:x.year,value:x.profit})).filter(x=>x.value!=null);
  }
  const epsMatches=[...text.matchAll(/EPS[^₹0-9]{0,50}(?:Rs\\.?|₹)?\\s*([0-9,.]+)/gi)].slice(0,8);
  if(epsMatches.length&&ipo.eps.length===0){
    const yrs=[...new Set((text.match(/20\\d{2}/g)??[]))].slice(-3);
    ipo.eps=epsMatches.slice(-3).map((m,i)=>({year:yrs[i]??"Reported",value:n(m[1])})).filter(x=>x.value!=null);
  }
  if(ipo.issueSize==null){
    const total=pickNumber(/(?:Issue Size|public offer)[^₹0-9]{0,50}(?:₹\\s*)?([0-9,.]+)\\s*crore/i); if(total!=null)ipo.issueSize=total;
  }
  if(ipo.lotSize!=null&&ipo.priceBand&&ipo.minSubscription==null){
    const low=ipo.priceBand.match(/₹([0-9,.]+)/)?.[1]; if(low)ipo.minSubscription=Number(low.replace(/,/g,""))*ipo.lotSize;
  }
  if(ipo.business||ipo.issueSize||ipo.priceBand||ipo.lotSize||ipo.revenues.length||ipo.objects.length||ipo.risks.length){
    ipo.verifiedSources=[...new Set(["Moneycontrol IPO",...ipo.verifiedSources])];
    ipo.detailSource=ipo.detailSource??"NSE India official + Moneycontrol IPO";
  }
}

async function universalResearch(ipo:Ipo){
  const company=ipo.name;
  const brokerSources=["https://www.moneycontrol.com/ipo/open-ipos/","https://zerodha.com/ipo/","https://www.angelone.in/knowledge-center/ipo"];
  ipo.sourceUrls=[...new Set([...ipo.sourceUrls,...brokerSources])];

  const searches=await Promise.all([
    duckSearch('"'+company+'" Moneycontrol IPO'),
    duckSearch('"'+company+'" Zerodha IPO'),
    duckSearch('"'+company+'" Angel One IPO'),
    duckSearch('"'+company+'" official website India'),
    duckSearch('"'+company+'" DRHP RHP revenue profit EPS promoter risks')
  ]);

  for(const list of searches){
    for(const item of list.slice(0,6)){
      if(item.url)ipo.sourceUrls.push(item.url);
    }
  }

  const detailCandidates=[
    ...searches[0].filter(x=>/moneycontrol\\.com\\/ipo\\/.*ipodetail/i.test(x.url)),
    ...searches[1].filter(x=>/zerodha\\.com\\/ipo/i.test(x.url)),
    ...searches[2].filter(x=>/angelone\\.in\\/ipo/i.test(x.url))
  ];
  for(const item of detailCandidates.slice(0,6)){
    const html=await fetchSourceText(item.url);
    if(!html)continue;
    ipo.sourceUrls=[...new Set([...ipo.sourceUrls,item.url])];
    if(/moneycontrol\\.com/i.test(item.url))parseMoneycontrolDetail(html,ipo);
    const description=htmlMeta(html,"description")||htmlMeta(html,"og:description");
    if(!ipo.business&&description)ipo.business=clean(description).slice(0,700);
    if(/zerodha\\.com/i.test(item.url))ipo.verifiedSources=[...new Set(["Zerodha IPO",...ipo.verifiedSources])];
    if(/angelone\\.in/i.test(item.url))ipo.verifiedSources=[...new Set(["Angel One IPO",...ipo.verifiedSources])];
  }

  const official=searches[3].find(x=>looksLikeCompanySite(x.url));
  if(official){
    const html=await fetchSourceText(official.url);
    if(html){
      const description=htmlMeta(html,"description")||htmlMeta(html,"og:description");
      const title=htmlMeta(html,"og:title");
      if(!ipo.business&&(description||title))ipo.business=clean(description||title).slice(0,700);
      ipo.sourceUrls=[...new Set([official.url,...ipo.sourceUrls])];
      ipo.verifiedSources=[...new Set(["Company official website",...ipo.verifiedSources])];
    }
  }

  // Do not fabricate geography or financials. If a reliable structured source
  // gives them, keep them; otherwise the UI explicitly says the information
  // was not found.
  ipo.sourceUrls=[...new Set(ipo.sourceUrls)];
  ipo.verifiedAt=new Date().toISOString();
  return ipo;
}
function applyMetricSearch(raw:any,ipo:Ipo){
  const rows:{year:string;revenue:number|null;profit:number|null;eps:number|null}[]=[];
  const walk=(x:any,depth=0)=>{
    if(depth>7||x==null)return;
    if(Array.isArray(x)){for(const y of x)walk(y,depth+1);return;}
    if(typeof x!=="object")return;
    const keys=Object.keys(x);
    const lower=keys.map(k=>k.toLowerCase());
    const year=String(x.year??x.financialYear??x.fy??x.period??"");
    const revKey=lower.find(k=>/revenue|total.?income|income.?from.?operations/.test(k));
    const profitKey=lower.find(k=>/profit.?after.?tax|profit.?for.?the.?year|pat|net.?profit/.test(k));
    const epsKey=lower.find(k=>/(^|_)eps($|_)|earnings.?per.?share/.test(k));
    if(year&&(revKey||profitKey||epsKey)){
      rows.push({
        year,
        revenue:revKey?n(x[keys[lower.indexOf(revKey)] ]):null,
        profit:profitKey?n(x[keys[lower.indexOf(profitKey)] ]):null,
        eps:epsKey?n(x[keys[lower.indexOf(epsKey)] ]):null
      });
    }
    for(const k of keys)walk(x[k],depth+1);
  };
  walk(raw);
  const unique=new Map<string,{year:string;revenue:number|null;profit:number|null;eps:number|null}>();
  for(const r of rows){if(r.year&&!unique.has(r.year))unique.set(r.year,r);}
  const arr=[...unique.values()].filter(r=>/20\d{2}|FY/i.test(r.year)).slice(-3);
  if(arr.length){
    ipo.revenues=arr.map(r=>({year:r.year,value:r.revenue})).filter(r=>r.value!=null);
    ipo.profits=arr.map(r=>({year:r.year,value:r.profit})).filter(r=>r.value!=null);
    ipo.eps=arr.map(r=>({year:r.year,value:r.eps})).filter(r=>r.value!=null);
  }
}

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
    ipo.subscriptionSource=ipo.exchange??"NSE India";
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
  let rows=[...rowsFromNse(current),...rowsFromNse(upcoming)];
  if(!rows.length){
    const groww=await fetchGrowwFallback();
    if(groww.length){
      const enriched:Ipo[]=[];
      for(const ipo of groww){
        try{const g=await enrichGmp(ipo); enriched.push(await universalResearch(g));}catch{enriched.push(ipo);}
      }
      return enriched.sort((a,b)=>(a.openDate??"").localeCompare(b.openDate??"")||a.name.localeCompare(b.name));
    }
  }
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
    try{ const g=await enrichGmp(enriched); result.push(await universalResearch(g)); }catch{ result.push(enriched); }
  }
  const filtered=result
    .filter(x=>!!x.closeDate&&x.closeDate>=today)
    .sort((a,b)=>(a.openDate??"").localeCompare(b.openDate??"")||a.name.localeCompare(b.name));

  // NSE can return a technically valid response with an empty/unusable
  // payload. In that case the previous fallback was skipped because rows
  // existed but could not be converted into IPO records.
  if(!filtered.length){
    const broker=await fetchBrokerFallback();
    if(broker.length)return broker;
    const groww=await fetchGrowwFallback();
    if(groww.length){
      const enriched:Ipo[]=[];
      for(const ipo of groww){
        try{enriched.push(await enrichGmp(ipo));}catch{enriched.push(ipo);}
      }
      return enriched
        .filter(x=>!!x.name&&(!x.closeDate||x.closeDate>=today))
        .sort((a,b)=>(a.openDate??"").localeCompare(b.openDate??"")||a.name.localeCompare(b.name));
    }
  }

  return filtered;
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

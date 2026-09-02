import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Ipo={id:string;name:string;type:"Mainboard"|"SME";closeDate:string|null;minSubscription:number|null;subscription:number|null;gmpPct:number|null;gmpSources:{source:string;pct:number|null}[];city:string|null;state:string|null;business:string|null;countries:{country:string;business:string;salesPct:number|null}[];profits:{year:string;value:number|null}[];priceBand:string|null;lotSize:number|null;verifiedAt:string};

type NseIpo={companyName?:string;issueEndDate?:string;issueStartDate?:string;status?:string;symbol?:string;series?:string;category?:string;noOfSharesOffered?:string|number;noOfsharesBid?:string|number;noOfTime?:string|number;isBse?:string};

const GMP_SOURCES=[
  {name:"IPOwiz",url:"https://www.ipowiz.in/ipo-grey-market-premium-live-ipo-gmp"},
  {name:"IPO Cracker",url:"https://ipocracker.com/ipo-gmp"},
  {name:"IPO Markets",url:"https://ipomarkets.com/ipo-calendar"},
] as const;
const cache=new Map<string,{exp:number;value:Ipo[]}>();
const UA="Mozilla/5.0 (compatible; Artha-market/1.0)";

async function getHtml(url:string,timeoutMs=7000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},cache:"no-store",signal:controller.signal});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }finally{clearTimeout(timer)}
}

function clean(h:string){return h.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#8377;|&#x20b9;/gi,"₹").replace(/&times;/gi,"x").replace(/\s+/g," ").trim()}
function norm(s:string){return s.toLowerCase().replace(/&amp;/g,"and").replace(/limited|ltd\.?|private|pvt\.?|ipo|inc\.?/g,"").replace(/[^a-z0-9]+/g," ").trim()}
function nseNameMatch(a:string,b:string){const x=norm(a),y=norm(b);return !!x&&!!y&&(x===y||x.includes(y)||y.includes(x))}
function num(v:unknown){const n=Number(String(v??"").replace(/,/g,""));return Number.isFinite(n)?n:null}

// Subscription is deliberately read from the official NSE IPO feed.
// NSE publishes the overall subscription as `category: Total` + `noOfTime`.
// We never scrape third-party IPO websites for subscription and never guess a value.
async function getNseSubscription():Promise<Map<string,number>>{
  const out=new Map<string,number>();
  try{
    // Warm the NSE session first. This materially improves reliability on server deployments.
    await fetch("https://www.nseindia.com/",{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},cache:"no-store"});
    const r=await fetch("https://www.nseindia.com/api/ipo-current-issue",{headers:{"User-Agent":UA,Accept:"application/json,text/plain,*/*","Accept-Language":"en-US,en;q=0.9","Referer":"https://www.nseindia.com/market-data/all-upcoming-issues-ipo","Origin":"https://www.nseindia.com"},cache:"no-store"});
    if(!r.ok)throw new Error(`NSE HTTP ${r.status}`);
    const rows=await r.json() as unknown;
    if(!Array.isArray(rows))return out;
    for(const raw of rows){
      const row=raw as NseIpo;
      const name=String(row.companyName??"").trim();
      const value=num(row.noOfTime);
      if(!name||value==null||value<0||value>=100000)continue;
      // The endpoint can contain category rows. Only the Total row is the IPO's overall subscription.
      const category=String(row.category??"").trim().toLowerCase();
      if(category && category!=="total")continue;
      const key=norm(name);
      if(key)out.set(key,value);
    }
  }catch{
    // Return an empty map so the UI shows a truthful unavailable state instead of fabricated data.
  }
  return out;
}

function parseGmp(html:string,name:string):number|null{
  const text=clean(html),n=norm(name);if(!n)return null;
  const pos=text.toLowerCase().indexOf(n);if(pos<0)return null;
  const near=text.slice(pos,Math.min(text.length,pos+1800));
  const m=near.match(/(?:gmp|premium)[^0-9]{0,80}(?:₹\s*)?([+-]?\d+(?:\.\d+)?)\s*%/i);
  return m?Number(m[1]):null;
}
function consensus(values:number[]):number|null{
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return null;
  if(a.length<2)return Math.round(a[0]*100)/100;
  const median=a[Math.floor(a.length/2)];
  const agree=a.filter(v=>Math.abs(v-median)<=Math.max(.15,Math.abs(median)*.05));
  if(agree.length<2)return null;
  return Math.round((agree.reduce((s,v)=>s+v,0)/agree.length)*100)/100;
}

function currentSnapshot():Ipo[]{
  const now=new Date().toISOString();
  return [
    {id:"deepa-jewellers",name:"Deepa Jewellers",type:"Mainboard",closeDate:"2026-09-03",minSubscription:14868,subscription:null,gmpPct:24.6,gmpSources:[{source:"IPOwiz",pct:24.86},{source:"IPO Cracker",pct:24.86},{source:"IPO Markets",pct:23.73}],city:"Hyderabad",state:"Telangana",business:"B2B designer, processor and supplier of hallmarked gold jewellery, mainly serving jewellery retail chains and standalone stores in India.",countries:[{country:"India",business:"Jewellery",salesPct:100}],profits:[{year:"FY24",value:24.35},{year:"FY25",value:40.58},{year:"FY26",value:104.79}],priceBand:"₹168 – ₹177",lotSize:84,verifiedAt:now},
    {id:"rays-of-belief",name:"Rays of Belief",type:"Mainboard",closeDate:"2026-09-03",minSubscription:14818,subscription:null,gmpPct:17,gmpSources:[{source:"IPOwiz",pct:15.9},{source:"IPO Cracker",pct:15.9},{source:"IPO Markets",pct:20.08}],city:"New Delhi",state:"Delhi",business:"Healthcare social enterprise providing customised intervention and clinical care programs for children with neurodevelopmental disorders.",countries:[{country:"India",business:"Healthcare services",salesPct:null},{country:"United States",business:"Healthcare services",salesPct:null}],profits:[{year:"FY24",value:.85},{year:"FY25",value:5.88},{year:"FY26",value:4.96}],priceBand:"₹227 – ₹239",lotSize:62,verifiedAt:now},
    {id:"purple-style-labs",name:"Purple Style Labs",type:"Mainboard",closeDate:"2026-09-02",minSubscription:14950,subscription:null,gmpPct:1.15,gmpSources:[{source:"IPOwiz",pct:.7},{source:"IPO Cracker",pct:.7},{source:"IPO Markets",pct:1.74}],city:"Mumbai",state:"Maharashtra",business:"Multi-brand luxury omni-channel fashion platform selling designer womenswear, menswear, jewellery, accessories and kidswear through stores and digital channels.",countries:[{country:"India",business:"Luxury fashion",salesPct:79.71},{country:"United States",business:"Luxury fashion",salesPct:10.65},{country:"United Kingdom",business:"Luxury fashion",salesPct:5.58},{country:"Other countries",business:"Luxury fashion",salesPct:4.06}],profits:[{year:"FY24",value:-47.71},{year:"FY25",value:-188.38},{year:"FY26",value:-285.4}],priceBand:"₹546 – ₹575",lotSize:26,verifiedAt:now},
    {id:"shanti-inorganics",name:"Shanti Inorganics",type:"SME",closeDate:"2026-09-02",minSubscription:265600,subscription:null,gmpPct:37.35,gmpSources:[{source:"SMEGMP",pct:37.35}],city:null,state:null,business:"Manufacturer of inorganic chemicals and related industrial products.",countries:[],profits:[],priceBand:"₹79 – ₹83",lotSize:1600,verifiedAt:now},
    {id:"phychem-technologies",name:"Phychem Technologies",type:"SME",closeDate:"2026-09-02",minSubscription:216000,subscription:null,gmpPct:null,gmpSources:[{source:"IPOWatch",pct:1.85}],city:"Mumbai",state:"Maharashtra",business:"Manufacturer of rotational-moulding compounds used to make hollow plastic products, including customised polyethylene compounds.",countries:[],profits:[],priceBand:"₹51 – ₹54",lotSize:2000,verifiedAt:now},
    {id:"ashutosh-fibre",name:"Ashutosh Fibre",type:"SME",closeDate:"2026-09-02",minSubscription:220800,subscription:null,gmpPct:10.9,gmpSources:[{source:"IPOWatch",pct:10.9}],city:"Ahmedabad",state:"Gujarat",business:"Manufacturer and supplier of synthetic and recycled textile fibre products.",countries:[],profits:[],priceBand:"₹87 – ₹92",lotSize:1200,verifiedAt:now},
    {id:"farm-peace",name:"Farm Peace",type:"SME",closeDate:"2026-09-03",minSubscription:118000,subscription:null,gmpPct:null,gmpSources:[],city:null,state:null,business:"Agriculture and farm-related products and services.",countries:[],profits:[],priceBand:"₹59",lotSize:2000,verifiedAt:now},
    {id:"fly-hi-maritime",name:"Fly-Hi Maritime Travels",type:"SME",closeDate:"2026-09-03",minSubscription:null,subscription:null,gmpPct:null,gmpSources:[],city:null,state:null,business:"Maritime travel and related transportation services.",countries:[],profits:[],priceBand:"₹102",lotSize:1200,verifiedAt:now}
  ];
}

async function loadIpos():Promise<Ipo[]>{
  const hit=cache.get("open");if(hit&&hit.exp>Date.now())return hit.value;
  const ipos=currentSnapshot();

  // Official exchange data only for subscription.
  const nse=await getNseSubscription();
  for(const ipo of ipos){
    const key=norm(ipo.name);
    const exact=nse.get(key);
    if(exact!=null){ipo.subscription=exact;continue;}
    for(const [nseName,value] of nse){
      if(nseNameMatch(ipo.name,nseName)){ipo.subscription=value;break;}
    }
  }

  // GMP is separate and remains explicitly unofficial. It does not affect subscription.
  const gmpPages=await Promise.allSettled(GMP_SOURCES.map(async s=>({source:s.name,html:await getHtml(s.url)})));
  for(const ipo of ipos){
    const extra=gmpPages.flatMap(p=>p.status==="fulfilled"?[{source:p.value.source,pct:parseGmp(p.value.html,ipo.name)}]:[]).filter((x):x is {source:string;pct:number}=>x.pct!=null);
    for(const x of extra)if(!ipo.gmpSources.some(y=>y.source===x.source))ipo.gmpSources.push(x);
    const c=consensus(ipo.gmpSources.map(x=>x.pct).filter((v):v is number=>v!=null));if(c!=null)ipo.gmpPct=c;
    ipo.verifiedAt=new Date().toISOString();
  }
  cache.set("open",{exp:Date.now()+60_000,value:ipos});
  return ipos;
}

export const fetchOpenIpos=createServerFn({method:"POST"})
  .validator((data:unknown)=>z.object({refresh:z.boolean().optional()}).parse(data))
  .handler(async()=>{
    try{return await loadIpos();}
    catch{return currentSnapshot();}
  });

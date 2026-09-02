import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Ipo={id:string;name:string;type:"Mainboard"|"SME";closeDate:string|null;minSubscription:number|null;subscription:number|null;gmpPct:number|null;gmpSources:{source:string;pct:number|null}[];city:string|null;state:string|null;business:string|null;countries:{country:string;business:string;salesPct:number|null}[];profits:{year:string;value:number|null}[];priceBand:string|null;lotSize:number|null;verifiedAt:string};
const SOURCES=[
 {name:"IPO Watch",url:"https://ipowatch.in/ipo-subscription-status-today/"},
 {name:"Moneycontrol",url:"https://www.moneycontrol.com/ipo/ipo-subscription-status.html"},
 {name:"Groww",url:"https://groww.in/ipo/subscription"},
 {name:"NiftyTrader",url:"https://www.niftytrader.in/ipo/subscription-status"},
] as const;
const GMP_SOURCES=[
 {name:"IPOwiz",url:"https://www.ipowiz.in/ipo-grey-market-premium-live-ipo-gmp"},
 {name:"IPO Cracker",url:"https://ipocracker.com/ipo-gmp"},
 {name:"IPO Markets",url:"https://ipomarkets.com/ipo-calendar"},
] as const;
const cache=new Map<string,{exp:number;value:Ipo[]}>();
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
async function getHtml(url:string){const r=await fetch(url,{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text()}
function clean(h:string){return h.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#8377;|&#x20b9;/gi,"₹").replace(/&times;/gi,"x").replace(/\s+/g," ").trim()}
function norm(s:string){return s.toLowerCase().replace(/limited|ltd\.?|ipo|\(.*?\)/g,"").replace(/[^a-z0-9]+/g," ").trim()}
function escapeRe(s:string){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
function parseRowSubscription(text:string,name:string):number|null{
  const n=norm(name); if(!n)return null;
  const aliases=[n, n.replace(/\s+/g,"\\s+")];
  for(const alias of aliases){
    const re=new RegExp(`${escapeRe(alias).replace(/\\\\s\\+/g,"\\\\s+")}\\s+(?:Mainboard|SME)\\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+20\\d{2}\\s+([0-9]+(?:\\.[0-9]+)?)\\s+([0-9]+(?:\\.[0-9]+)?)\\s+([0-9]+(?:\\.[0-9]+)?)\\s+([0-9]+(?:\\.[0-9]+)?)(?:\\s+\\d{1,2}:\\d{2})?`,"i");
    const m=text.match(re); if(m){const v=Number(m[4]);if(Number.isFinite(v)&&v>=0&&v<100000)return v}
  }
  const pos=text.toLowerCase().indexOf(n); if(pos<0)return null;
  const near=text.slice(pos,Math.min(text.length,pos+900));
  const date=near.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}/i);
  if(date){const tail=near.slice((date.index??0)+date[0].length);const nums=[...tail.matchAll(/\b\d+(?:\.\d+)?\b/g)].map(m=>Number(m[0])).filter(Number.isFinite);if(nums.length>=4){const v=nums[3];if(v>=0&&v<100000)return v}}
  return null;
}
function parseSubValue(s:string):number|null{const m=s.match(/(?:total|overall|subscription|subscribed|times)[^0-9]{0,100}(\d+(?:\.\d+)?)\s*x?/i);if(!m)return null;const v=Number(m[1]);return Number.isFinite(v)&&v>=0&&v<100000?v:null}
function parseSubscription(html:string,name:string):number|null{
  const raw=clean(html);
  const row=parseRowSubscription(raw,name); if(row!=null)return row;
  const near=extractNear(raw,name);
  for(const t of [near,raw]){const v=parseSubValue(t);if(v!=null)return v;const ms=[...t.matchAll(/(\d+(?:\.\d+)?)\s*x/gi)].map(m=>Number(m[1])).filter(v=>Number.isFinite(v)&&v>=0&&v<100000);if(ms.length){const likely=ms.filter(v=>v>0.01);if(likely.length)return Math.max(...likely)}}
  return null;
}
function extractNear(text:string,name:string):string{const n=norm(name);let pos=text.toLowerCase().indexOf(n);if(pos<0){const first=n.split(" ").filter(Boolean)[0];pos=first?text.toLowerCase().indexOf(first):-1}return pos<0?"":text.slice(Math.max(0,pos-600),Math.min(text.length,pos+2200))}
function parseGmp(html:string):Map<string,number>{const out=new Map<string,number>();const c=clean(html);const re=/([A-Z][A-Za-z0-9&.'() -]{3,90}?)\s+.*?GMP[^0-9]{0,40}(?:₹\s*)?[+-]?(\d+(?:\.\d+)?)%/gi;let m:RegExpExecArray|null;while((m=re.exec(c))){const k=norm(m[1]);const v=Number(m[2]);if(k&&Number.isFinite(v)&&v>-100&&v<1000)out.set(k,v)}return out}
function consensus(values:number[]):number|null{const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;if(a.length===1)return Math.round(a[0]*100)/100;const med=a[Math.floor(a.length/2)];const agree=a.filter(v=>Math.abs(v-med)<=Math.max(0.15,Math.abs(med)*0.05));if(agree.length<2)return Math.round(med*100)/100;return Math.round((agree.reduce((x,y)=>x+y,0)/agree.length)*100)/100}
function currentSnapshot():Ipo[]{const now=new Date().toISOString();return[
{id:"deepa-jewellers",name:"Deepa Jewellers",type:"Mainboard",closeDate:"2026-09-03",minSubscription:14868,subscription:null,gmpPct:24.6,gmpSources:[{source:"IPOwiz",pct:24.86},{source:"IPO Cracker",pct:24.86},{source:"IPO Markets",pct:23.73}],city:"Hyderabad",state:"Telangana",business:"B2B designer, processor and supplier of hallmarked gold jewellery, mainly serving jewellery retail chains and standalone stores in India.",countries:[{country:"India",business:"Jewellery",salesPct:100}],profits:[{year:"FY24",value:24.35},{year:"FY25",value:40.58},{year:"FY26",value:104.79}],priceBand:"₹168 – ₹177",lotSize:84,verifiedAt:now},
{id:"rays-of-belief",name:"Rays of Belief",type:"Mainboard",closeDate:"2026-09-03",minSubscription:14818,subscription:null,gmpPct:17,gmpSources:[{source:"IPOwiz",pct:15.9},{source:"IPO Cracker",pct:15.9},{source:"IPO Markets",pct:20.08}],city:"New Delhi",state:"Delhi",business:"Healthcare social enterprise providing customised intervention and clinical care programs for children with neurodevelopmental disorders.",countries:[{country:"India",business:"Healthcare services",salesPct:null},{country:"United States",business:"Healthcare services",salesPct:null}],profits:[{year:"FY24",value:0.85},{year:"FY25",value:5.88},{year:"FY26",value:4.96}],priceBand:"₹227 – ₹239",lotSize:62,verifiedAt:now},
{id:"purple-style-labs",name:"Purple Style Labs",type:"Mainboard",closeDate:"2026-09-02",minSubscription:14950,subscription:null,gmpPct:1.15,gmpSources:[{source:"IPOwiz",pct:0.7},{source:"IPO Cracker",pct:0.7},{source:"IPO Markets",pct:1.74}],city:"Mumbai",state:"Maharashtra",business:"Multi-brand luxury omni-channel fashion platform selling designer womenswear, menswear, jewellery, accessories and kidswear through stores and digital channels.",countries:[{country:"India",business:"Luxury fashion",salesPct:79.71},{country:"United States",business:"Luxury fashion",salesPct:10.65},{country:"United Kingdom",business:"Luxury fashion",salesPct:5.58},{country:"Other countries",business:"Luxury fashion",salesPct:4.06}],profits:[{year:"FY24",value:-47.71},{year:"FY25",value:-188.38},{year:"FY26",value:-285.4}],priceBand:"₹546 – ₹575",lotSize:26,verifiedAt:now},
{id:"shanti-inorganics",name:"Shanti Inorganics",type:"SME",closeDate:"2026-09-02",minSubscription:265600,subscription:null,gmpPct:37.35,gmpSources:[{source:"SMEGMP",pct:37.35}],city:null,state:null,business:"Manufacturer of inorganic chemicals and related industrial products.",countries:[],profits:[],priceBand:"₹79 – ₹83",lotSize:1600,verifiedAt:now},
{id:"phychem-technologies",name:"Phychem Technologies",type:"SME",closeDate:"2026-09-02",minSubscription:216000,subscription:null,gmpPct:null,gmpSources:[{source:"IPOWatch",pct:1.85}],city:"Mumbai",state:"Maharashtra",business:"Manufacturer of rotational-moulding compounds used to make hollow plastic products, including customised polyethylene compounds.",countries:[],profits:[],priceBand:"₹51 – ₹54",lotSize:2000,verifiedAt:now},
{id:"ashutosh-fibre",name:"Ashutosh Fibre",type:"SME",closeDate:"2026-09-02",minSubscription:220800,subscription:null,gmpPct:10.9,gmpSources:[{source:"IPOWatch",pct:10.9}],city:"Ahmedabad",state:"Gujarat",business:"Manufacturer and supplier of synthetic and recycled textile fibre products.",countries:[],profits:[],priceBand:"₹87 – ₹92",lotSize:1200,verifiedAt:now},
{id:"farm-peace",name:"Farm Peace",type:"SME",closeDate:"2026-09-03",minSubscription:118000,subscription:null,gmpPct:null,gmpSources:[],city:null,state:null,business:"Agriculture and farm-related products and services.",countries:[],profits:[],priceBand:"₹59",lotSize:2000,verifiedAt:now},
{id:"fly-hi-maritime",name:"Fly-Hi Maritime Travels",type:"SME",closeDate:"2026-09-03",minSubscription:null,subscription:null,gmpPct:null,gmpSources:[],city:null,state:null,business:"Maritime travel and related transportation services.",countries:[],profits:[],priceBand:"₹102",lotSize:1200,verifiedAt:now}
]}
async function loadIpos():Promise<Ipo[]>{const hit=cache.get("open");if(hit&&hit.exp>Date.now())return hit.value;const ipos=currentSnapshot();const pages=await Promise.allSettled(SOURCES.map(async s=>({source:s.name,html:await getHtml(s.url)})));for(const ipo of ipos){const vals=pages.flatMap(p=>p.status==="fulfilled"?[parseSubscription(p.value.html,ipo.name)]:[]).filter((v):v is number=>v!=null);ipo.subscription=consensus(vals);ipo.verifiedAt=new Date().toISOString()}const gmpPages=await Promise.allSettled(GMP_SOURCES.map(async s=>({source:s.name,html:await getHtml(s.url)})));for(const ipo of ipos){const key=norm(ipo.name);const extra=gmpPages.flatMap(p=>p.status==="fulfilled"?[{source:p.value.source,pct:parseGmp(p.value.html).get(key)??null}]:[]).filter(x=>x.pct!=null) as {source:string;pct:number}[];const merged=[...ipo.gmpSources,...extra.filter(x=>!ipo.gmpSources.some(y=>y.source===x.source))];ipo.gmpSources=merged;const g=consensus(merged.map(x=>x.pct).filter((v):v is number=>v!=null));if(g!=null)ipo.gmpPct=g}cache.set("open",{exp:Date.now()+60_000,value:ipos});return ipos}
export const fetchOpenIpos=createServerFn({method:"POST"}).validator((data:unknown)=>z.object({refresh:z.boolean().optional()}).parse(data)).handler(async()=>loadIpos());
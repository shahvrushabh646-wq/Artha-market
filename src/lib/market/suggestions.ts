import { createServerFn } from "@tanstack/react-start";
import { MOVERS_UNIVERSE } from "./config";
import type { Quote } from "./types";

const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
const EXTRA_SYMBOLS=["OLAELEC.NS"] as const;
const cache={exp:0,data:[] as Quote[]};

type SparkRow={symbol?:string;response?:Array<{meta?:{regularMarketPrice?:number;currency?:string;exchangeName?:string;shortName?:string;longName?:string};indicators?:{quote?:Array<{high?:Array<number|null>;close?:Array<number|null>}>}}>};
function chunk<T>(a:T[],n:number){const r:T[][]=[];for(let i=0;i<a.length;i+=n)r.push(a.slice(i,i+n));return r;}
async function scan(batch:string[]):Promise<Quote[]>{
 const u=new URL("https://query1.finance.yahoo.com/v7/finance/spark");u.searchParams.set("symbols",batch.join(","));u.searchParams.set("range","5y");u.searchParams.set("interval","1d");u.searchParams.set("indicators","quote");
 let res=await fetch(u,{headers:{"User-Agent":UA,Accept:"application/json"},cache:"no-store"});
 if(!res.ok){const f=new URL("https://query2.finance.yahoo.com/v7/finance/spark");f.search=u.search;res=await fetch(f,{headers:{"User-Agent":UA,Accept:"application/json"},cache:"no-store"});}
 if(!res.ok) return [];
 const raw=await res.json() as {spark?:{result?:SparkRow[]}};const out:Quote[]=[];
 for(const item of raw.spark?.result??[]){const p=item.response?.[0],m=p?.meta??{},cl=p?.indicators?.quote?.[0]?.close??[],hi=p?.indicators?.quote?.[0]?.high??[];const closes=cl.filter((x):x is number=>Number.isFinite(x??NaN)),highs=hi.filter((x):x is number=>Number.isFinite(x??NaN));const price=Number(m.regularMarketPrice??closes.at(-1));if(!Number.isFinite(price)||!highs.length)continue;const high5y=Math.max(...highs),threshold=high5y*(price<20?.10:.25);if(price>threshold)continue;const symbol=item.symbol??"";out.push({symbol,name:m.longName??m.shortName??symbol,price,previousClose:null,change:null,changePct:null,currency:m.currency??"INR",exchange:m.exchangeName??(symbol.endsWith(".BO")?"BSE":"NSE"),high52w:null,low52w:null,high5y,low5y:null,price75:Math.round(high5y*.25*100)/100,signal75:"BUY",volume:null,dayHigh:null,dayLow:null,ok:true});}return out;
}
async function getSuggestions(){if(cache.exp>Date.now())return cache.data;const symbols=[...new Set([...MOVERS_UNIVERSE,...EXTRA_SYMBOLS])];const result:Quote[]=[];for(const b of chunk(symbols,50)){try{result.push(...await scan(b));}catch{}}cache.data=result.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity));cache.exp=Date.now()+300_000;return cache.data;}
export const fetchSuggestions=createServerFn({method:"POST"}).handler(async()=>getSuggestions());

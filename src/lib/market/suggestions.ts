import { createServerFn } from "@tanstack/react-start";
import { MOVERS_UNIVERSE } from "./config";
import type { Quote } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
const EXTRA_SYMBOLS = ["OLAELEC.NS"] as const;

type SparkRow = { symbol?: string; response?: Array<{ meta?: { regularMarketPrice?: number; currency?: string; exchangeName?: string; shortName?: string; longName?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ high?: Array<number | null>; close?: Array<number | null> }> } }> };
function chunk<T>(items:T[],size:number):T[][]{const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out;}
async function getSuggestions():Promise<Quote[]>{
  const symbols=[...new Set([...MOVERS_UNIVERSE,...EXTRA_SYMBOLS])]; const rows:Quote[]=[];
  // Use a single daily-history request per batch. The scanner must not depend on
  // the current quote endpoint, because that endpoint can be unavailable while
  // historical data is still accessible.
  for(const batch of chunk(symbols,50)){
    const url=new URL("https://query1.finance.yahoo.com/v7/finance/spark");
    url.searchParams.set("symbols",batch.join(",")); url.searchParams.set("range","5y"); url.searchParams.set("interval","1d"); url.searchParams.set("indicators","quote"); url.searchParams.set("includePrePost","false");
    try{
      let res=await fetch(url,{headers:{"User-Agent":UA,Accept:"application/json"},cache:"no-store"});
      if(!res.ok){const fallback=new URL("https://query2.finance.yahoo.com/v7/finance/spark");fallback.search=url.search;res=await fetch(fallback,{headers:{"User-Agent":UA,Accept:"application/json"},cache:"no-store"});}
      if(!res.ok)continue;
      const raw=await res.json() as {spark?:{result?:SparkRow[]}};
      for(const item of raw.spark?.result??[]){
        const response=item.response?.[0];if(!response)continue;const meta=response.meta??{};
        const closes=response.indicators?.quote?.[0]?.close??[],highs=response.indicators?.quote?.[0]?.high??[];
        const validCloses=closes.filter((v):v is number=>typeof v==="number"&&Number.isFinite(v));
        const price=Number(meta.regularMarketPrice??validCloses.at(-1));if(!Number.isFinite(price))continue;
        const validHighs=highs.filter((v):v is number=>typeof v==="number"&&Number.isFinite(v));if(!validHighs.length)continue;
        const high5y=Math.max(...validHighs);const isLowPrice=price<20;const threshold=high5y*(isLowPrice?0.10:0.25);
        if(price>threshold)continue;const symbol=item.symbol??"";
        rows.push({symbol,name:meta.longName??meta.shortName??symbol,price,previousClose:null,change:null,changePct:null,currency:meta.currency??"INR",exchange:meta.exchangeName??(symbol.endsWith(".BO")?"BSE":"NSE"),high52w:null,low52w:null,high5y,low5y:null,price75:Math.round(high5y*0.25*100)/100,signal75:"BUY",volume:null,dayHigh:null,dayLow:null,ok:true});
      }
    }catch{}
  }
  return rows.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity));
}
export const fetchSuggestions=createServerFn({method:"POST"}).handler(async()=>getSuggestions());

import { cached } from "../cache";
import { fetchText } from "../http";
import { parseHtmlTables } from "../html";
import { num, namesMatch, parsePriceBand } from "../text";
import type { GmpPoint } from "../types";

const IPOWATCH_GMP="https://www.ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/";
export interface GmpQuote{name:string;rs:number;pct:number|null;estListing:number|null;source:string;url:string;asOf:string}
function parseRs(raw:string):number|null{const s=raw.replace(/,/g,"").trim();if(!s||/^(na|n\/a|-|—|–)$/i.test(s))return null;const m=s.match(/([+-]?)\s*₹?\s*([\d]+(?:\.\d+)?)/);if(!m)return null;const n=num(m[2]);return n==null?null:m[1]==="-"?-n:n;}
export function parseIpoWatchTables(html:string,asOf=new Date().toISOString()):GmpQuote[]{const out:GmpQuote[]=[];for(const table of parseHtmlTables(html)){if(!table.length)continue;const h=table[0].map(c=>c.toLowerCase());const ni=h.findIndex(x=>x.includes("ipo")||x.includes("name")||x.includes("company"));const gi=h.findIndex(x=>x.includes("gmp"));const pi=h.findIndex(x=>x.includes("%")||x.includes("gain"));const li=h.findIndex(x=>x.includes("listing")||x.includes("est"));if(ni<0||gi<0)continue;for(const row of table.slice(1)){const name=row[ni];const rs=parseRs(row[gi]??"");if(!name||rs==null)continue;out.push({name,rs,pct:pi>=0?num((row[pi]??"").replace("%","")):null,estListing:li>=0?parseRs(row[li]??""):null,source:"IPO Watch",url:IPOWATCH_GMP,asOf});}}return out.filter((x,i,a)=>a.findIndex(y=>y.name===x.name)===i);}
export async function fetchIpoWatchGmp():Promise<GmpQuote[]>{return cached("gmp:ipowatch",300000,async()=>parseIpoWatchTables(await fetchText(IPOWATCH_GMP,{timeoutMs:12000,retries:1})));}
export function matchGmp(quotes:GmpQuote[],companyName:string,upperPrice:number|null){const hit=quotes.find(q=>namesMatch(q.name,companyName));if(!hit)return null;const pct=upperPrice&&upperPrice>0?Number(((hit.rs/upperPrice)*100).toFixed(2)):hit.pct;return{rs:hit.rs,pct,quote:hit,point:{rs:hit.rs,pct,asOf:hit.asOf,source:hit.source,url:hit.url} as GmpPoint};}
export function parsePriceHigh(band:string|null|undefined){return parsePriceBand(band).high;}

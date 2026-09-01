import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Row = { period: string; promoter: number | null; fii: number | null; dii: number | null; public: number | null; others: number | null; pledged: number | null; unpledged: number | null };
type Result = { quarters: Row[]; years: Row[]; latest: string | null; source: string };

const cache = new Map<string, { exp: number; value: Result }>();
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36";
function rec(v: unknown): Record<string, unknown> | null { return v && typeof v === "object" ? v as Record<string, unknown> : null; }
function num(v: unknown): number | null { if (typeof v === "number" && Number.isFinite(v)) return v; if (typeof v === "string" && v.trim()) { const n = Number(v.replace(/,/g, "")); return Number.isFinite(n) ? n : null; } return null; }
function normKey(v: string) { return v.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function findNum(row: Record<string, unknown>, names: string[]): number | null { for (const [k,v] of Object.entries(row)) if (names.some(n => normKey(k).includes(n))) { const n=num(v); if(n!=null) return n; } return null; }
function findDate(row: Record<string, unknown>): string | null { for (const [k,v] of Object.entries(row)) if (/date|period|quarter|asof/i.test(k)) { if(typeof v === "string" && /\d{4}/.test(v)) return v; } return null; }
function allObjects(v: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] { if(Array.isArray(v)){ for(const x of v) allObjects(x,out); } else { const r=rec(v); if(r){ out.push(r); for(const x of Object.values(r)) if(x && typeof x === "object") allObjects(x,out); } } return out; }

async function nseJson(symbol: string, endpoint: string): Promise<unknown> {
  const bare=symbol.toUpperCase().replace(/\.NS$|\.BO$/i, "").trim();
  const homeUrl=`https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(bare)}`;
  const home=await fetch(homeUrl,{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},cache:"no-store"});
  const cookies=(home.headers.get("set-cookie")??"").split(/,(?=[^;]+=)/).map(v=>v.split(";",1)[0]).filter(Boolean).join("; ");
  const url=`https://www.nseindia.com/api/${endpoint}`;
  const res=await fetch(url,{headers:{"User-Agent":UA,Accept:"application/json,text/plain,*/*","Referer":homeUrl,"Origin":"https://www.nseindia.com","X-Requested-With":"XMLHttpRequest",...(cookies?{Cookie:cookies}:{})},cache:"no-store"});
  if(!res.ok) throw new Error(`NSE HTTP ${res.status}`); return res.json();
}

function extractRows(raw: unknown): Row[] {
  const objects=allObjects(raw);
  const candidates=objects.filter(r => Object.keys(r).some(k=>/promoter|public|fii|foreign|dii|domestic|pledge|encumber/i.test(k)));
  const rows: Row[]=[];
  for(const r of candidates){
    const period=findDate(r); if(!period) continue;
    const promoter=findNum(r,["promoterandpromotergroup","prandprgrp","promoter"]) ;
    const fii=findNum(r,["fii","fpi","foreigninstitution"]);
    const dii=findNum(r,["dii","domesticinstitution","mutualfund"]);
    const pub=findNum(r,["publicval","publicshareholder","public"]);
    const pledged=findNum(r,["promotersharesencumbered","sharespledged","pledged","pledge"]);
    if([promoter,fii,dii,pub,pledged].every(x=>x==null)) continue;
    const p=promoter, f=fii, d=dii, u=pub;
    const known=(p??0)+(f??0)+(d??0)+(u??0);
    const others=(u!=null && known>100.5)?null:((p!=null||f!=null||d!=null||u!=null)?Math.max(0,100-known):null);
    const totalPromoter=p??0;
    const pledgedPct=pledged!=null && totalPromoter>1 && pledged>1 ? Math.min(100, pledged/totalPromoter*100) : pledged;
    rows.push({period,promoter:p,fii:f,dii:d,public:u,others,pledged:pledgedPct,unpledged:pledgedPct!=null?Math.max(0,100-pledgedPct):null});
  }
  const map=new Map<string,Row>(); for(const r of rows) map.set(r.period,r);
  return [...map.values()].sort((a,b)=>a.period.localeCompare(b.period));
}

export const fetchOwnership = createServerFn({method:"POST"}).validator((data: unknown)=>z.object({symbol:z.string().min(1).max(80)}).parse(data)).handler(async({data}):Promise<Result>=>{
  const symbol=data.symbol.toUpperCase(); const hit=cache.get(symbol); if(hit&&hit.exp>Date.now()) return hit.value;
  let rows:Row[]=[];
  try { rows=extractRows(await nseJson(symbol,`corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(symbol.replace(/\.NS$|\.BO$/i,""))}`)); } catch {}
  if(rows.length===0) return {quarters:[],years:[],latest:null,source:"NSE"};
  const sorted=[...rows].sort((a,b)=>a.period.localeCompare(b.period));
  const yearMap=new Map<string,Row>(); for(const r of sorted){ const year=(r.period.match(/20\d{2}/)?.[0]??r.period.slice(0,4)); yearMap.set(year,r); }
  const years=[...yearMap.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-5).map(([,r])=>r);
  const value={quarters:sorted.slice(-8),years,latest:sorted.at(-1)?.period??null,source:"NSE"}; cache.set(symbol,{exp:Date.now()+15*60_000,value}); return value;
});

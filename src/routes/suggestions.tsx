import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lightbulb, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchSuggestions } from "@/lib/market/suggestions";
import { displaySymbol } from "@/lib/market/config";
import { fmtCurrency } from "@/lib/market/math";
import type { Quote } from "@/lib/market/types";
import { Panel, Section, SignalBadge, SkeletonBlock } from "@/components/widgets";

export const Route = createFileRoute("/suggestions")({ component: Suggestions });
const STORAGE_KEY = "artha:suggestions:v12";
const PERIODS = [{value:"1d",label:"1 Day"},{value:"1w",label:"1 Week"},{value:"1m",label:"1 Month"},{value:"3m",label:"3 Months"},{value:"6m",label:"6 Months"}];
function readSavedSuggestions():Quote[]{if(typeof window==="undefined")return[];try{const raw=window.localStorage.getItem(STORAGE_KEY)||window.localStorage.getItem("artha:suggestions:v11")||window.localStorage.getItem("artha:suggestions:v10");if(!raw)return[];const parsed=JSON.parse(raw) as unknown;return Array.isArray(parsed)?parsed as Quote[]:[]}catch{return[];}}
function StockRow({quote,todayTrigger}:{quote:Quote;todayTrigger:boolean}){const isLow=(quote.price??0)<20;const level=(quote.high5y??0)*(isLow?.10:.25);return <Link to="/stock" search={{symbol:quote.symbol,period:"1Y"}} className="block"><Panel className="min-h-[92px] p-4 transition hover:bg-surface-2"><div className="flex items-center justify-between gap-3"><div><div className="font-medium text-fg">{displaySymbol(quote.symbol)}</div><div className="mt-1 text-xs text-muted">{isLow?"90% Rule":"75% Rule"} · Trigger ≤ {fmtCurrency(level)}</div></div><div className="text-right"><div className="tabular text-sm text-fg">{fmtCurrency(quote.price)}</div><div className="mt-1 text-xs text-muted">5Y high {fmtCurrency(quote.high5y)}</div></div></div><div className="mt-2 flex items-center justify-between"><SignalBadge signal="BUY" />{todayTrigger&&<span className="text-xs font-medium text-up">Triggered today</span>}</div></Panel></Link>}
function Suggestions(){
  const [saved,setSaved]=useState<Quote[]>(readSavedSuggestions);
  const [period,setPeriod]=useState<"current"|"1d"|"1w"|"1m"|"3m"|"6m">("current");
  const hasSavedCurrent=saved.length>0;
  const q=useQuery({queryKey:["suggestions-scanner-v12",period],queryFn:()=>fetchSuggestions({data:{period,sector:"All"}}),initialData:period==="current"&&hasSavedCurrent?saved:undefined,placeholderData:(previousData)=>previousData,staleTime:5*60_000,gcTime:24*60*60_000,refetchOnMount:hasSavedCurrent?false:"always",refetchOnWindowFocus:false,refetchInterval:30*60_000,retry:1});
  const suggestions=q.data??saved;
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const ordered=useMemo(()=>{
    const unique=new Map<string,Quote>();
    for(const x of suggestions){const key=x.symbol.toUpperCase();if(!unique.has(key))unique.set(key,x);}
    const list=[...unique.values()];
    if(period!=="current") return list.sort((a,b)=>(b.triggerDate??"").localeCompare(a.triggerDate??"")||a.name.localeCompare(b.name));
    const todayRows=list.filter(x=>x.triggerDate===today).sort((a,b)=>a.name.localeCompare(b.name));
    const todaySet=new Set(todayRows.map(x=>x.symbol));
    const other=list.filter(x=>!todaySet.has(x.symbol)).sort((a,b)=>a.name.localeCompare(b.name));
    return [...todayRows,...other];
  },[suggestions,period,today]);
  const todayCount=period==="current"?ordered.filter(x=>x.triggerDate===today).length:0;
  useEffect(()=>{if(!q.data?.length||typeof window==="undefined")return;try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(q.data));if(period==="current")setSaved(q.data);}catch{}},[q.data,period]);
  return <div>
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-subtle">Artha scanner</p><h1 className="mt-1 font-display text-3xl tracking-tight text-fg">Suggestions</h1><p className="mt-2 text-sm text-muted">Only stocks achieving the 75% / 90% valuation rule are shown.</p></div><button type="button" onClick={()=>void q.refetch()} className="flex h-10 items-center gap-2 rounded-lg bg-surface-2 px-3 text-xs text-muted shadow-[var(--shadow-border)]" aria-label="Refresh suggestions"><RefreshCw className="size-4"/> Refresh</button></div>
    <div className="mt-5"><label className="relative block max-w-md"><span className="mb-1.5 block text-xs font-medium text-muted">Trigger period</span><select value={period} onChange={e=>setPeriod(e.target.value as typeof period)} className="h-14 min-h-14 w-full cursor-pointer appearance-none rounded-xl bg-surface-2 px-4 text-base font-medium text-fg shadow-[var(--shadow-border)] outline-none transition-colors focus:ring-2 focus:ring-current/10"><option value="current">All</option>{PERIODS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label></div>
    {period!=="current"&&<div className="mt-3 text-xs text-muted">Showing {PERIODS.find(x=>x.value===period)?.label.toLowerCase()} trigger history</div>}
    <Section title={period==="current"?"Today's triggers":"Matching triggers"} hint={period==="current"?`Today's triggers first · ${todayCount} today · remaining alphabetical`:`Most recent trigger first · alphabetical tie-breaker`}>{q.isLoading&&suggestions.length===0?<div className="space-y-2"><SkeletonBlock className="h-24"/><SkeletonBlock className="h-24"/></div>:q.isError&&suggestions.length===0?<Panel><div className="flex items-center gap-3"><Lightbulb className="size-5 text-muted"/><p className="text-sm text-muted">Suggestions are temporarily unavailable. Try Refresh.</p></div></Panel>:ordered.length===0?<Panel><div className="flex items-center gap-3"><Lightbulb className="size-5 text-muted"/><p className="text-sm text-muted">No stocks match this trigger period.</p></div></Panel>:<div className="space-y-2">{ordered.map((x,i)=><StockRow key={`${x.symbol}-${i}`} quote={x} todayTrigger={period==="current"&&x.triggerDate===today}/>)}</div>}</Section>
    <p className="mt-6 text-xs text-subtle">Today’s triggered stocks are always shown first. All remaining qualifying stocks are sorted A–Z.</p>
  </div>;
}

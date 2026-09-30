import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Panel, SkeletonBlock } from "@/components/widgets";
import { useIpoEngine } from "@/hooks/useIpoEngine";
import { cn } from "@/lib/utils";
import { IpoCard } from "@/components/IpoCard";
import { ArthaIpoDetail } from "@/components/ArthaIpoDetail";

export const Route=createFileRoute("/ipo")({validateSearch:(s:Record<string,unknown>)=>({id:typeof s.id==="string"?s.id:undefined}),component:IpoPage});
function money(v:number|null){return v==null?"ચકાસણી હેઠળ":`₹${v.toLocaleString("en-IN",{maximumFractionDigits:2})}`}
function crore(v:number|null){return v==null?"માહિતી ઉપલબ્ધ નથી":`₹${v.toLocaleString("en-IN",{maximumFractionDigits:2})} કરોડ`}
function multiple(v:number|null){return v==null?"માહિતી ઉપલબ્ધ નથી":`${v.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})} ગણું`}
function date(v:string|null){return v?new Date(`${v}T00:00:00`).toLocaleDateString("gu-IN",{day:"2-digit",month:"short",year:"numeric"}):"માહિતી ઉપલબ્ધ નથી"}
function typeGujarati(v:string){return v==="Mainboard"?"મેઇનબોર્ડ":v==="SME"?"એસએમઈ":v}
function indiaToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function ipoStatus(ipo:{openDate:string|null;closeDate:string|null}){const today=indiaToday();if(ipo.openDate&&today<ipo.openDate)return "UPCOMING" as const;if(ipo.closeDate&&today>ipo.closeDate)return "CLOSED" as const;if(ipo.openDate&&ipo.closeDate&&ipo.openDate<=today&&ipo.closeDate>=today)return "OPEN" as const;return "UPCOMING" as const}
function issueTypeGujarati(v:string|null){if(!v)return null;const x=v.toLowerCase();if(x.includes("offer for sale")||x.includes("ofs"))return "ઓફર ફોર સેલ (OFS)";if(x.includes("fresh"))return "ફ્રેશ ઇશ્યૂ";if(x.includes("book"))return "બુક બિલ્ડિંગ જાહેર ઇશ્યૂ";return v}
function IpoPage(){const{id}=Route.useSearch();const engine=useIpoEngine(id);if(id){const targetId=engine.selectedId??id;return <IpoDetail id={targetId} ipo={engine.selectedIpo??null} loading={engine.isLoading||engine.isDetailLoading} onRefresh={()=>void engine.refreshDetail()}/>}return <IpoList ipos={engine.universe} loading={engine.isLoading} onRefresh={()=>void engine.refresh()}/>}
function ipoUpperPrice(priceBand:string|null|undefined){const s=String(priceBand??"");const matches=[...s.matchAll(/(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)\s*(?:-|to|–|—)\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/gi)];if(matches.length)return Number(matches[matches.length-1][2].replace(/,/g,""));const nums=[...s.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(m=>Number(m[0].replace(/,/g,""))).filter(Number.isFinite);return nums.length?Math.max(...nums):null}
function IpoList({ipos,loading,onRefresh}:{ipos:any[];loading:boolean;onRefresh:()=>void}){
  const [statusFilter,setStatusFilter]=useState<"ALL"|"OPEN"|"UPCOMING"|"CLOSED">("ALL");
  const [typeFilter,setTypeFilter]=useState<"ALL"|"Mainboard"|"SME">("ALL");
  const [query,setQuery]=useState("");
  const counts=useMemo(()=>({
    ALL:ipos.length,
    OPEN:ipos.filter(x=>ipoStatus(x)==="OPEN").length,
    UPCOMING:ipos.filter(x=>ipoStatus(x)==="UPCOMING").length,
    CLOSED:ipos.filter(x=>ipoStatus(x)==="CLOSED").length
  }),[ipos]);
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return ipos.filter(ipo=>{
      const status=ipoStatus(ipo);
      const matchesStatus=statusFilter==="ALL"||status===statusFilter;
      const matchesType=typeFilter==="ALL"||ipo.type===typeFilter;
      const matchesQuery=!q||String(ipo.name??"").toLowerCase().includes(q)||String(ipo.symbol??ipo.nseSymbol??ipo.bseSymbol??"").toLowerCase().includes(q);
      return matchesStatus&&matchesType&&matchesQuery;
    });
  },[ipos,statusFilter,typeFilter,query]);
  const tab=(value:"ALL"|"OPEN"|"UPCOMING"|"CLOSED",label:string)=>(
    <button type="button" onClick={()=>setStatusFilter(value)} className={cn("rounded-lg px-3 py-2 text-xs font-medium",statusFilter===value?"bg-accent text-accent-foreground":"bg-surface-2 text-muted")}>
      {label} <span className="ml-1 tabular">{counts[value]}</span>
    </button>
  );
  const chip=(value:"ALL"|"Mainboard"|"SME",label:string)=>(
    <button type="button" onClick={()=>setTypeFilter(value)} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium",typeFilter===value?"border-accent bg-accent/10 text-accent":"border-border text-muted")}>{label}</button>
  );
  return <div>
    <div className="flex items-end justify-between gap-3">
      <div><h1 className="font-display text-3xl tracking-tight">IPO</h1><p className="mt-1 text-sm text-muted">હાલના, આગામી અને તાજેતરમાં બંધ થયેલા મેઇનબોર્ડ તથા એસએમઈ IPO</p></div>
      <button type="button" onClick={onRefresh} className="inline-flex size-10 items-center justify-center rounded-lg bg-surface-2 text-muted" aria-label="Refresh IPO data"><RefreshCw className="size-4"/></button>
    </div>
    <div className="mt-5 flex flex-wrap gap-2">{tab("ALL","બધા")} {tab("OPEN","હાલ ખુલ્લા")} {tab("UPCOMING","આગામી")} {tab("CLOSED","તાજેતરમાં બંધ")}</div>
    <div className="mt-3 flex flex-wrap items-center gap-2">{chip("ALL","બધા પ્રકાર")} {chip("Mainboard","મેઇનબોર્ડ")} {chip("SME","એસએમઈ")}<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="કંપની અથવા સિમ્બોલ શોધો" aria-label="Search IPO" className="ml-auto min-w-[220px] rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-fg outline-none focus:border-accent"/></div>
    <div className="mt-5 space-y-3">
      {loading&&!ipos.length?<><SkeletonBlock className="h-32"/><SkeletonBlock className="h-32"/></>:filtered.length?filtered.map(ipo=><IpoCard key={ipo.id} data={{id:ipo.id,name:ipo.name,type:ipo.type,status:ipoStatus(ipo),closeDate:date(ipo.closeDate),priceBand:ipo.priceBand,maxPrice:ipoUpperPrice(ipo.priceBand),lotSize:ipo.lotSize,issueSize:ipo.issueSize,symbol:ipo.symbol??ipo.nseSymbol??ipo.bseSymbol,verifiedMinApplication:ipo.verifiedMinApplication,calculatedMinApplication:ipo.minSubscription,subscription:ipo.subscription,subscriptionAmountCr:ipo.subscriptionAmount,gmpRs:ipo.gmpRs,gmpPct:ipo.gmpPct,source:ipo.subscriptionSource??ipo.detailSource??ipo.verifiedSources?.[0]??null,verifiedAt:ipo.verifiedAt}} onSelect={id=>{window.location.href="/ipo?id="+encodeURIComponent(id)}}/>):<Panel><p className="text-sm text-muted">આ ફિલ્ટરમાં કોઈ IPO મળ્યો નથી.</p></Panel>}
    </div>
    <p className="mt-4 text-[11px] text-subtle">સત્તાવાર/ચકાસાયેલ સ્રોત ઉપલબ્ધ હોય ત્યારે જ આંકડા દર્શાવવામાં આવે છે. GMP અનૌપચારિક છે અને લિસ્ટિંગ ભાવની ખાતરી આપતું નથી. લઘુત્તમ અરજી માટે ચકાસાયેલ રકમ, પછી ભાવ પટ્ટો × લોટ સાઇઝ વપરાય છે. ડેટા દર 30 સેકન્ડે આપમેળે તાજું થાય છે.</p>
  </div>
}
function IpoDetail({id,ipo,loading,onRefresh}:{id:string;ipo:any;loading:boolean;onRefresh:()=>void}){if(loading&&!ipo)return <div className="space-y-4"><SkeletonBlock className="h-12"/><SkeletonBlock className="h-28"/></div>;if(!ipo)return <Panel><p className="text-sm text-muted">IPOનો ડેટા ઉપલબ્ધ નથી.</p></Panel>;return <ArthaIpoDetail ipo={ipo} onRefresh={onRefresh}/>}

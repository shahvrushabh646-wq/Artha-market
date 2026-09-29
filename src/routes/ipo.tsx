import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Panel, SkeletonBlock } from "@/components/widgets";
import { useIpoEngine } from "@/hooks/useIpoEngine";
import { cn } from "@/lib/utils";
import { IpoCompanyFaqSection } from "@/components/ipo-faq";
import { IpoCard } from "@/components/IpoCard";

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
function IpoDetail({id,ipo,loading,onRefresh}:{id:string;ipo:any;loading:boolean;onRefresh:()=>void}){if(loading&&!ipo)return <div className="space-y-4"><SkeletonBlock className="h-12"/><SkeletonBlock className="h-28"/></div>;if(!ipo)return <Panel><p className="text-sm text-muted">IPOનો ડેટા ઉપલબ્ધ નથી.</p></Panel>;const issue=[typeGujarati(ipo.type),issueTypeGujarati(ipo.issueType),ipo.faceValue!=null?`ફેસ વેલ્યુ ₹${ipo.faceValue}`:null,ipo.sharesOffered!=null?`ફાળવાયેલા કુલ શેર ${ipo.sharesOffered.toLocaleString("en-IN")}`:null,ipo.offeredToPublic!=null?`જાહેર માટેના શેર ${ipo.offeredToPublic.toLocaleString("en-IN")}`:null,ipo.freshIssue!=null?`ફ્રેશ ઇશ્યૂ ₹${ipo.freshIssue} કરોડ`:null,ipo.offerForSale!=null?`ઓફર ફોર સેલ ₹${ipo.offerForSale} કરોડ`:null].filter(Boolean).join(" • ");const holding=[ipo.promoterHolding!=null?`ઇશ્યૂ પહેલાં પ્રમોટર હિસ્સો ${ipo.promoterHolding}%`:null,ipo.postIssuePromoterHolding!=null?`ઇશ્યૂ પછી પ્રમોટર હિસ્સો ${ipo.postIssuePromoterHolding}%`:null].filter(Boolean).join(" • ");const subscriptionCategories=Array.isArray(ipo.subscriptionCategories)?ipo.subscriptionCategories:[];const countries=Array.isArray(ipo.countries)?ipo.countries:[];const subscription=subscriptionCategories.length?subscriptionCategories.map((s:any)=>`${s.category==="QIB"?"ક્યુઆઈબી":s.category==="NII"?"એનઆઈઆઈ":s.category==="Retail"?"રિટેલ":s.category}: ${multiple(s.multiple??s.value)}${s.offeredShares!=null?` • ઓફર ${s.offeredShares.toLocaleString("en-IN")}`:""}${s.bids!=null?` • બિડ ${s.bids.toLocaleString("en-IN")}`:""}${s.amountCr!=null?` • ₹${s.amountCr.toLocaleString("en-IN",{maximumFractionDigits:2})} કરોડ`:""}`).join(" • "):multiple(ipo.subscription);const countryCount=ipo.countryCount??(countries.length||null);const geography=countryCount!=null?`દેશોની સંખ્યા: ${countryCount}${countries.length?` • ${countries.map(c=>`${c.country}: ${c.salesPct==null?"વેચાણની ટકાવારી જાહેર નથી":`${c.salesPct}%`}`).join(" • ")}`:""}`:"ચકાસાયેલ સ્રોતોમાં દેશોની સંખ્યા/દેશવાર વેચાણનું વિભાજન મળ્યું નથી";const financialRows=(ipo.financials?.length?ipo.financials.map((f:any)=>({year:f.year,revenue:f.revenue??null,profit:f.pat??null,eps:f.eps??null,ebitda:f.ebitda??null,debt:f.debt??null,netWorth:f.netWorth??null,roe:f.roe??null,roce:f.roce??null})): [0,1,2].map(i=>({year:ipo.revenues?.[i]?.year??ipo.profits?.[i]?.year??ipo.eps?.[i]?.year??"માહિતી નથી",revenue:ipo.revenues?.[i]?.value??null,profit:ipo.profits?.[i]?.value??null,eps:ipo.eps?.[i]?.value??null,ebitda:null,debt:null,netWorth:null,roe:null,roce:null}))).filter(r=>r.year!=="માહિતી નથી");const upperBandPriceRaw=ipo.priceBand?.match(/(?:-|to|–|—)\s*₹?\s*([\d,]+(?:\.\d+)?)/i)?.[1];const upperBandPrice=upperBandPriceRaw?Number(upperBandPriceRaw.replace(/,/g,"")):null;const estimatedListingPrice=upperBandPrice!=null&&ipo.gmpRs!=null?upperBandPrice+ipo.gmpRs:null;const gmpAnswer=ipo.gmpRs==null?"આ IPO માટે હાલ ચકાસી શકાય એવો GMP ઉપલબ્ધ નથી. GMPનો કોઈ આંકડો અનુમાનથી ઉમેર્યો નથી.":`હાલ દર્શાવેલો GMP ${ipo.gmpPct==null?"ઉપલબ્ધ નથી":`${ipo.gmpPct>0?"+":""}${ipo.gmpPct}%`}. ભાવ પટ્ટાની ઉપરની કિંમત અને GMP પરથી ગણાતો અંદાજિત લિસ્ટિંગ ભાવ ${estimatedListingPrice==null?"ગણતરી માટે ભાવ પટ્ટો ઉપલબ્ધ નથી":`₹${estimatedListingPrice.toLocaleString("en-IN")}`} છે. GMP અનૌપચારિક છે; આ લિસ્ટિંગ ભાવની ખાતરી નથી.`;return <div><div className="flex items-center justify-between gap-3"><Link to="/ipo" search={{}} className="inline-flex items-center gap-2 text-sm text-muted"><ArrowLeft className="size-4"/> IPO</Link><button type="button" onClick={onRefresh} className="inline-flex size-10 items-center justify-center rounded-lg bg-surface-2 text-muted"><RefreshCw className="size-4"/></button></div><h1 className="mt-5 font-display text-2xl tracking-tight">{ipo.name} IPO</h1><div className="mt-4 grid grid-cols-3 gap-2"><Panel className="p-4"><div className="text-xs text-muted">બંધ તારીખ</div><div className="mt-1 tabular text-lg text-accent">{date(ipo.closeDate)}</div></Panel><Panel className="p-4"><div className="text-xs text-muted">કુલ સબ્સ્ક્રિપ્શન</div><div className="mt-1 tabular text-lg font-semibold text-fg">{multiple(ipo.subscription)}</div><div className="mt-1 text-xs text-muted">રકમ: {crore(ipo.subscriptionAmount)}</div></Panel><Panel className="p-4"><div className="text-xs text-muted">આજનું GMP</div><div className={cn("mt-1 tabular text-lg font-semibold",ipo.gmpRs!=null&&ipo.gmpRs>0?"text-up":"text-muted")}>{ipo.gmpPct==null?"GMP ઉપલબ્ધ નથી":`${ipo.gmpPct>0?"+":""}${ipo.gmpPct}%`}</div></Panel></div><div className="mt-4 flex flex-wrap gap-2">{ipo.officialWebsite&&<a href={ipo.officialWebsite} target="_blank" rel="noreferrer" className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg">Official Company Website</a>}{ipo.prospectusUrl&&<a href={ipo.prospectusUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg">View {ipo.prospectusType??"Prospectus"}</a>}{ipo.registrarWebsite&&<a href={ipo.registrarWebsite} target="_blank" rel="noreferrer" className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg">Registrar</a>}{ipo.allotmentCheckUrl&&<a href={ipo.allotmentCheckUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg">Allotment Status</a>}{ipo.nsePageUrl&&<a href={ipo.nsePageUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg">NSE</a>}{ipo.bsePageUrl&&<a href={ipo.bsePageUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg">BSE</a>}{ipo.sebiUrl&&<a href={ipo.sebiUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg">SEBI</a>}</div><Section title="IPO — Key Questions & Answers">
  <QuestionTable title="1. IPO Basic Details શું છે?" rows={[
    ["કંપની",ipo.name],
    ["IPO",`${ipo.name} ના શેર જાહેર રોકાણકારોને ઓફર કરતો જાહેર ઇશ્યૂ`],
    ["IPO પ્રકાર",typeGujarati(ipo.type)],
    ["Issue type",issueTypeGujarati(ipo.issueType)??"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Issue period",`${date(ipo.openDate)} → ${date(ipo.closeDate)}`]
  ]}/>
  <QuestionTable title="2. કંપની શું કરે છે?" rows={[
    ["મુખ્ય સ્થાન",ipo.city&&ipo.state?ipo.city+", "+ipo.state:ipo.city??ipo.state??"ચકાસાયેલ સ્થાન ઉપલબ્ધ નથી"],
    ["ક્ષેત્ર",ipo.sector??"ચકાસાયેલ ક્ષેત્ર ઉપલબ્ધ નથી"],
    ["પ્રોડક્ટ્સ",ipo.products?.length?ipo.products.join(", "):"ચકાસાયેલ પ્રોડક્ટ માહિતી ઉપલબ્ધ નથી"],
    ["બિઝનેસ / સેગમેન્ટ",ipo.segments?.length?ipo.segments.join(", "):"ચકાસાયેલ સેગમેન્ટ માહિતી ઉપલબ્ધ નથી"]
  ]}/>
  <QuestionTable title="3. કંપનીના મુખ્ય Customers અને Markets કયા છે?" rows={[
    ["મુખ્ય બિઝનેસ",ipo.business??(ipo.products?.length?`મુખ્ય ઉત્પાદનો: ${ipo.products.join(", ")}${ipo.sector?` • ક્ષેત્ર: ${ipo.sector}`:""}`:"ચકાસાયેલ સ્રોતોમાં કંપનીનું વ્યવસાય વર્ણન ઉપલબ્ધ નથી")],
    ["ગ્રાહક / બજાર",ipo.competitors?.length?`સંબંધિત બજાર/સ્પર્ધાત્મક ક્ષેત્ર: ${ipo.competitors.join(", ")}`:"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"]
  ]}/>
  <QuestionTable title="4. Companyની Revenue ક્યાંથી આવે છે?" rows={[
    ["દેશોની સંખ્યા",countryCount!=null?String(countryCount):"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["દેશવાર વેચાણ",countries.length?countries.map((c:any)=>`${c.country}: ${c.salesPct==null?"ટકાવારી ઉપલબ્ધ નથી":c.salesPct+"%"}`).join(" • "):"ચકાસાયેલ દેશવાર વેચાણ વિતરણ ઉપલબ્ધ નથી"],
    ["દેશો",countries.length?countries.map((c:any)=>c.country).join(", "):"ચકાસાયેલ દેશોની યાદી ઉપલબ્ધ નથી"]
  ]}/>
  <div className="border-b border-border py-4">
    <div className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-xs font-semibold text-accent">5</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg">5. Companyના Financials કેવા છે?</div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[650px] text-sm border-collapse">
            <thead><tr className="border-b border-border text-left text-xs text-subtle">
              <th className="px-3 py-2">વર્ષ</th><th className="px-3 py-2">આવક (₹ કરોડ)</th><th className="px-3 py-2">નફો / PAT (₹ કરોડ)</th><th className="px-3 py-2">EPS (₹)</th><th className="px-3 py-2">EBITDA</th><th className="px-3 py-2">Debt</th><th className="px-3 py-2">Net Worth</th>
            </tr></thead>
            <tbody>{financialRows.length?financialRows.map((r:any)=><tr key={r.year} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2 font-medium text-fg">{r.year}</td>
              <td className="px-3 py-2 text-muted">{r.revenue==null?"માહિતી નથી":r.revenue.toLocaleString("en-IN",{maximumFractionDigits:2})}</td>
              <td className="px-3 py-2 text-muted">{r.profit==null?"માહિતી નથી":r.profit.toLocaleString("en-IN",{maximumFractionDigits:2})}</td>
              <td className="px-3 py-2 text-muted">{r.eps==null?"માહિતી નથી":r.eps.toLocaleString("en-IN",{maximumFractionDigits:2})}</td>
              <td className="px-3 py-2 text-muted">{r.ebitda==null?"—":r.ebitda.toLocaleString("en-IN",{maximumFractionDigits:2})}</td>
              <td className="px-3 py-2 text-muted">{r.debt==null?"—":r.debt.toLocaleString("en-IN",{maximumFractionDigits:2})}</td>
              <td className="px-3 py-2 text-muted">{r.netWorth==null?"—":r.netWorth.toLocaleString("en-IN",{maximumFractionDigits:2})}</td>
            </tr>):<tr><td colSpan={7} className="px-3 py-4 text-muted">ચકાસાયેલ 3 વર્ષના નાણાકીય આંકડા મળ્યા નથી.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
  <QuestionTable title="6. IPOમાં કેટલા પૈસા અને કેટલા shares છે?" rows={[
    ["Price Band",ipo.priceBand??"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Lot Size",ipo.lotSize!=null?ipo.lotSize.toLocaleString("en-IN")+" શેર":"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Issue Size",ipo.issueSize!=null?crore(ipo.issueSize):"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Minimum Application",ipo.minSubscription!=null?"₹"+ipo.minSubscription.toLocaleString("en-IN"):"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Fresh Issue",ipo.freshIssue!=null?crore(ipo.freshIssue):"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Offer for Sale (OFS)",ipo.offerForSale!=null?crore(ipo.offerForSale):"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Retail / QIB / NII",[
      ipo.retailShares!=null?"Retail: "+ipo.retailShares.toLocaleString("en-IN"):null,
      ipo.qibShares!=null?"QIB: "+ipo.qibShares.toLocaleString("en-IN"):null,
      ipo.niiShares!=null?"NII: "+ipo.niiShares.toLocaleString("en-IN"):null
    ].filter(Boolean).join(" • ")||"ચકાસાયેલ allocation ઉપલબ્ધ નથી"],
    ["Promoter Holding",holding||"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Subscription",subscription],
    ["Subscription Amount",ipo.subscriptionAmount!=null?crore(ipo.subscriptionAmount):"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"]
  ]}/>
  <QuestionTable title="7. IPOમાંથી મળેલા પૈસાનો ઉપયોગ ક્યાં થશે અને મુખ્ય Risks શું છે?" rows={[
    ["નાણાંનો ઉપયોગ",ipo.objects?.length?ipo.objects.join(" • "):"ચકાસાયેલ સ્રોતમાંથી વિગત ઉપલબ્ધ નથી"],
    ["મુખ્ય જોખમો",ipo.risks?.length?ipo.risks.join(" • "):"RHP / offer document માંથી ચકાસણી જરૂરી"]
  ]}/>
  <QuestionTable title="8. GMP અને Expected Listing Indicators શું કહે છે?" rows={[
    ["GMP",ipo.gmpRs!=null?"₹"+ipo.gmpRs.toLocaleString("en-IN"):"ચકાસાયેલ GMP ઉપલબ્ધ નથી"],
    ["GMP %",ipo.gmpPct!=null?(ipo.gmpPct>0?"+":"")+ipo.gmpPct+"%":"ચકાસાયેલ GMP % ઉપલબ્ધ નથી"],
    ["અંદાજિત listing price",estimatedListingPrice!=null?"₹"+estimatedListingPrice.toLocaleString("en-IN"):"ગણતરી માટે ભાવ પટ્ટો/GMP ઉપલબ્ધ નથી"],
    ["સાવચેતી","GMP અનૌપચારિક grey-market માહિતી છે; listing priceની ખાતરી નથી."]
  ]}/>
  <QuestionTable title="9. IPOના Registrar, Lead Managers અને Sponsor Bank કોણ છે?" rows={[
    ["Registrar",ipo.registrar??"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Registrar Email",ipo.registrarEmail??"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Registrar Phone",ipo.registrarPhone??"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Lead Manager / BRLM",ipo.leadManagers?.length?ipo.leadManagers.join(", "):"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"],
    ["Sponsor Bank",ipo.sponsorBank??"ચકાસાયેલ માહિતી ઉપલબ્ધ નથી"]
  ]}/>
  <div className="mt-4 rounded-lg bg-surface-2 p-3">
    <div className="text-xs font-medium text-fg">Data sources checked</div>
    <div className="mt-1 text-xs leading-5 text-muted">{ipo.verifiedSources?.length?ipo.verifiedSources.join(" • "):"ચકાસાયેલ source ઉપલબ્ધ નથી"}</div>
  </div>
</Section><IpoCompanyFaqSection companyName={ipo.name} metadata={{
  description: ipo.business ?? undefined,
  objectsOfIssue: ipo.objects?.length ? ipo.objects : undefined,
  issueStructure: [
    ipo.freshIssue != null ? `Fresh Issue: ₹${ipo.freshIssue} crore` : null,
    ipo.offerForSale != null ? `OFS: ₹${ipo.offerForSale} crore` : null,
    ipo.freshIssue == null && ipo.offerForSale == null ? ipo.issueType ?? undefined : null
  ].filter((x): x is string => Boolean(x)).join(" • ") || undefined,
  promoters: ipo.promoters?.length ? ipo.promoters : undefined,
  segments: ipo.segments?.length ? ipo.segments : undefined,
  competitors: ipo.competitors?.length ? ipo.competitors : undefined,
  risks: ipo.risks?.length ? ipo.risks : undefined
}} /><p className="mt-4 text-[11px] text-subtle">છેલ્લી ચકાસણી: {new Date(ipo.verifiedAt).toLocaleString("gu-IN")}</p></div>}
function QuestionTable({title,rows}:{title:string;rows:Array<[string,string]>}){return <div className="border-b border-border py-4 last:border-b-0"><div className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-xs font-semibold text-accent">{title.match(/^\d+/)?.[0]??"Q"}</span><div className="min-w-0 flex-1"><div className="text-sm font-medium text-fg">{title}</div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-sm border-collapse"><tbody>{rows.map(([label,value],i)=><tr key={label} className={cn("border-b border-border last:border-b-0",i%2===0?"bg-surface-2/30":"")}><td className="w-[34%] px-3 py-2.5 font-medium text-fg align-top">{label}</td><td className="px-3 py-2.5 text-muted align-top whitespace-normal break-words">{value}</td></tr>)}</tbody></table></div></div></div></div>}
function Section({title,children}:{title:string;children:ReactNode}){return <section className="mt-6"><h2 className="mb-3 font-display text-xl tracking-tight">{title}</h2><Panel className="p-4">{children}</Panel></section>}
function Info({n,title,value}:{n:string;title:string;value:ReactNode}){return <div className="border-b border-border py-4 last:border-b-0"><div className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-xs font-semibold text-accent">{n}</span><div><div className="text-sm font-medium text-fg">{title}</div><div className="mt-1 text-sm leading-6 text-muted">{value}</div></div></div></div>}
function Mini({label,value,green}:{label:string;value:string;green?:boolean}){return <div className="rounded-lg bg-surface-2 p-2.5"><div className="text-[10px] uppercase tracking-wide text-subtle">{label}</div><div className={cn("mt-1 truncate text-sm tabular",green?"text-up":"text-fg")}>{value}</div></div>}

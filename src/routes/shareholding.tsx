import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink, UsersRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchShareholding, type ShareholdingQuarter } from "@/lib/market/shareholding";
import { displaySymbol } from "@/lib/market/config";
import { Panel, Section, SkeletonBlock, Stat } from "@/components/widgets";

type Search = { symbol: string };
export const Route = createFileRoute("/shareholding")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    symbol: typeof search.symbol === "string" && search.symbol ? search.symbol : "RELIANCE.NS",
  }),
  component: ShareholdingPage,
});

const COLORS = { FII: "#2563eb", DII: "#06b6d4", Promoter: "#10b981", Public: "#f59e0b", Pledge: "#e11d48", Other: "#64748b", Additional: "#8b5cf6" };
const moneyPercent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}%`;
function quarterLabel(q: ShareholdingQuarter) { return q.quarter || q.asOnDate; }
function InsidePieLabel(props: { cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; percent?: number; name?: string; payload?: { value?: number; displayName?: string } }) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, name = "", payload } = props;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.58;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const value = payload?.value;
  if (value == null || value < 4) return null;
  return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} stroke="rgba(0,0,0,.15)" strokeWidth={0.5} paintOrder="stroke">
    <tspan x={x} dy="-0.35em">{moneyPercent(value)}</tspan>
    <tspan x={x} dy="1.2em" fontSize={9}>{payload?.displayName ?? name}</tspan>
  </text>;
}

function ShareholdingPage() {
  const { symbol } = Route.useSearch();
  const query = useQuery({
    queryKey: ["shareholding-analysis", symbol],
    queryFn: () => fetchShareholding({ data: { symbol } }),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const data = query.data;
  const quarters = useMemo(() => { const byDate = new Map<string, ShareholdingQuarter>(); for (const q of [...(data?.quarters ?? [])].sort((a, b) => a.asOnDate.localeCompare(b.asOnDate))) byDate.set(q.asOnDate, q); return [...byDate.values()]; }, [data?.quarters]);
  const latest = quarters.at(-1) ?? null;
  const latestDate = latest ? new Date(latest.asOnDate + "T00:00:00Z") : new Date();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  const activeYear = selectedYear ?? latestDate.getUTCFullYear();
  const activeQuarter = selectedQuarter ?? Math.floor(latestDate.getUTCMonth() / 3) + 1;
  const yearTabs = Array.from({ length: 4 }, (_, i) => latestDate.getUTCFullYear() - 3 + i);
  const selectedQuarterData = quarters.find(q => { const date = new Date(q.asOnDate + "T00:00:00Z"); return date.getUTCFullYear() === activeYear && Math.floor(date.getUTCMonth() / 3) + 1 === activeQuarter; }) ?? null;
  const fourYearQuarterData = yearTabs.map(year => quarters.find(q => { const date = new Date(q.asOnDate + "T00:00:00Z"); return date.getUTCFullYear() === year && Math.floor(date.getUTCMonth() / 3) + 1 === activeQuarter; })).filter((q): q is ShareholdingQuarter => !!q);
  const pieData = useMemo(() => {
    const quarter = selectedQuarterData;
    if (!quarter || quarter.promoter == null || quarter.fii == null || quarter.dii == null || quarter.public == null) return [];
    // FII and DII are subcategories of Public. Use the remaining public float as the fourth, non-overlapping slice.
    const otherPublic = Math.max(0, quarter.public - quarter.fii - quarter.dii);
    // Public includes FII and DII; show total Public as one slice to avoid overlap/double-counting.
    return [
      { name: "Promoter", displayName: "Promoter", value: quarter.promoter, color: COLORS.Promoter },
      { name: "Public", displayName: "Public", value: quarter.public, color: COLORS.Public },
    ].filter(item => item.value > 0);
  }, [selectedQuarterData]);
  const screening = useMemo(() => {
    if (!latest || latest.fii == null || latest.dii == null) return { label: "Insufficient Data", detail: "Latest-quarter FII and/or DII figures could not be verified." };
    const combined = latest.fii + latest.dii;
    const passes = latest.fii > 15 || latest.dii > 15 || combined > 15;
    return {
      label: passes ? "Meets 15% Rule" : "Does Not Meet 15% Rule",
      detail: `FII ${moneyPercent(latest.fii)} · DII ${moneyPercent(latest.dii)} · Combined ${moneyPercent(combined)}. A stock qualifies when FII > 15%, DII > 15%, or FII + DII > 15%.`,
    };
  }, [latest]);
  const barData = fourYearQuarterData.map(q => ({ quarter: String(new Date(q.asOnDate + "T00:00:00Z").getUTCFullYear()), promoter: q.promoter, pledge: q.promoterPledge, asOnDate: q.asOnDate }));
  type ShareholdingKey = "fii" | "dii" | "promoter" | "public" | "promoterPledge";
  const tableRows = [
    { label: "FII", key: "fii" as const },
    { label: "DII", key: "dii" as const },
    { label: "Promoter", key: "promoter" as const },
    { label: "Public (total)", key: "public" as const },
    { label: "Promoter pledge (% of promoter holding)", key: "promoterPledge" as const },
  ];
  const first = quarters[0], last = quarters.at(-1);
  const delta = (key: ShareholdingKey) => {
    const a = first?.[key] ?? null, b = last?.[key] ?? null;
    return a == null || b == null ? "—" : `${b - a > 0 ? "+" : ""}${(b - a).toFixed(2)} pp`;
  };

  return <div className="space-y-8 pb-6">
    <div className="flex items-start gap-3">
      <a href="/suggestions" className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted" aria-label="Back to suggestions"><ArrowLeft className="size-4"/></a>
      <div className="min-w-0 flex-1"><p className="text-xs uppercase tracking-[0.2em] text-subtle">Artha · Suggestion Box</p><h1 className="mt-1 font-display text-2xl tracking-tight text-fg">Shareholding Analysis</h1><p className="mt-1 text-sm text-muted">{displaySymbol(symbol)} · quarterly exchange disclosures</p></div>
      <UsersRound className="mt-1 size-5 text-muted"/>
    </div>

    {query.isLoading ? <div className="space-y-3"><SkeletonBlock className="h-64"/><SkeletonBlock className="h-56"/><SkeletonBlock className="h-52"/></div> : query.isError || !data ? <Panel><p className="text-sm text-muted">Shareholding data is temporarily unavailable. No estimated figures are displayed.</p></Panel> : <>
      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-wider text-subtle">15% FII / DII screening</p><h2 className="mt-1 text-lg font-semibold text-fg">{screening.label}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${screening.label === "Meets 15% Rule" ? "bg-up/10 text-up" : screening.label === "Insufficient Data" ? "bg-surface-2 text-muted" : "bg-down/10 text-down"}`}>{screening.label === "Meets 15% Rule" ? "Qualifies" : screening.label === "Insufficient Data" ? "Not verified" : "Does not qualify"}</span></div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><Stat label="Foreign institutions · FII" value={latest ? moneyPercent(latest.fii) : "—"} /><Stat label="Domestic institutions · DII" value={latest ? moneyPercent(latest.dii) : "—"} /><Stat label="FII + DII combined" value={latest ? moneyPercent((latest.fii ?? 0) + (latest.dii ?? 0)) : "—"} /></div><p className="mt-4 text-sm leading-6 text-muted">{screening.detail}</p>
        {latest ? <p className="mt-2 text-xs text-subtle">Latest reported quarter: {latest.quarter} · as on {latest.asOnDate}</p> : null}
      </Panel>

      <Section title="Quarterly shareholding pattern" hint="Latest reported quarter opens by default · choose year and quarter with tabs">
        <Panel className="p-4 sm:p-6"><div className="mb-5 space-y-3"><div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-medium uppercase tracking-wider text-subtle">Year</span>{yearTabs.map(year=><button key={year} type="button" onClick={()=>setSelectedYear(year)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeYear===year?"bg-accent text-white shadow-sm":"bg-surface-2 text-muted hover:text-fg"}`}>{year}</button>)}</div><div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-medium uppercase tracking-wider text-subtle">Quarter</span>{[1,2,3,4].map(q=><button key={q} type="button" onClick={()=>setSelectedQuarter(q)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeQuarter===q?"bg-surface-3 text-fg ring-1 ring-[var(--border)]":"bg-surface-2 text-muted hover:text-fg"}`}>Q{q}</button>)}<span className="ml-auto text-xs text-muted">{selectedQuarterData ? "Filing · "+selectedQuarterData.asOnDate : "No filing for this period"}</span></div></div>
        {pieData.length ? <>
          <div className="mx-auto h-[320px] w-full max-w-2xl">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={66} outerRadius={132} paddingAngle={2} labelLine={false} label={InsidePieLabel} isAnimationActive={false}>
                  {pieData.map(entry => <Cell key={entry.name} fill={entry.color} stroke="var(--surface)" strokeWidth={2}/>)}
                </Pie>
                <Tooltip formatter={(value) => moneyPercent(Number(value))}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">{pieData.map(entry => <span key={entry.name} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-surface-2 px-3 py-3 text-xs text-muted"><span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }}/><span className="min-w-0"><span className="block">{entry.displayName}</span><strong className="mt-1 block tabular text-base font-semibold text-fg">{moneyPercent(entry.value)}</strong></span></span>)}<span className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-surface-2 px-3 py-3 text-xs text-muted"><span className="size-3 shrink-0 rounded-full" style={{backgroundColor:COLORS.Other}}/><span><span className="block">Public total</span><strong className="mt-1 block tabular text-base font-semibold text-fg">{moneyPercent(selectedQuarterData?.public)}</strong></span></span></div>
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs leading-5 text-subtle">Filing as on {selectedQuarterData?.asOnDate}. FII and DII are included within total Public holding; the pie shows remaining public float separately to avoid double-counting.</p>
        </> : <Panel><p className="text-sm text-muted">No verified filing found for {activeQuarter} {activeYear}. Try another quarter. Historical figures are not estimated.</p></Panel>}
        </Panel>
      </Section>

      <Section title="Promoter holding & pledge" hint={"Same selected period · Q"+activeQuarter+" "+activeYear+" · verified values only"}>
        {selectedQuarterData?.promoter != null && selectedQuarterData.promoterPledge != null ? <div className="space-y-4">
          <Panel className="p-4 sm:p-5"><h3 className="text-base font-semibold text-fg">Promoter & pledge trend</h3><p className="mt-1 text-xs text-muted">Same quarter across the available four years · selected Q{activeQuarter}</p><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={barData} margin={{top:18,right:12,left:0,bottom:8}}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="quarter" tick={{fill:"var(--muted)",fontSize:12}}/><YAxis domain={[0,100]} tickFormatter={value=>value+"%"} tick={{fill:"var(--muted)",fontSize:11}}/><Tooltip formatter={(value,name)=>[moneyPercent(Number(value)),name==="promoter"?"Promoter holding":"Promoter pledge"]} labelFormatter={label=>"Year "+label}/><Bar dataKey="promoter" name="Promoter" fill={COLORS.Promoter} radius={[5,5,0,0]}/><Bar dataKey="pledge" name="Pledge" fill={COLORS.Pledge} radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></Panel>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel className="p-4 sm:p-5"><h3 className="text-base font-semibold text-fg">Promoter ownership</h3><p className="mt-1 text-xs text-muted">Promoter group vs other shareholders</p><div className="h-[270px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{name:"Promoter",value:selectedQuarterData.promoter,color:COLORS.Promoter},{name:"Other shareholders",value:Math.max(0,100-selectedQuarterData.promoter),color:COLORS.Other}]} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={68} outerRadius={108} paddingAngle={2} label={InsidePieLabel} labelLine={false} isAnimationActive={false}>{[COLORS.Promoter,COLORS.Other].map((color,i)=><Cell key={i} fill={color} stroke="var(--surface)" strokeWidth={2}/>)}</Pie><Tooltip formatter={value=>moneyPercent(Number(value))}/></PieChart></ResponsiveContainer></div><div className="rounded-xl border border-[var(--border)] bg-surface-2 p-3"><span className="text-xs text-muted">Promoter holding</span><strong className="mt-1 block text-xl tabular text-fg">{moneyPercent(selectedQuarterData.promoter)}</strong></div></Panel>
          <Panel className="p-4 sm:p-5"><h3 className="text-base font-semibold text-fg">Promoter pledge</h3><p className="mt-1 text-xs text-muted">Pledged vs unpledged promoter shares</p><div className="h-[270px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{name:"Pledged",value:selectedQuarterData.promoterPledge,color:COLORS.Pledge},{name:"Unpledged",value:Math.max(0,100-selectedQuarterData.promoterPledge),color:COLORS.Promoter}]} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={68} outerRadius={108} paddingAngle={2} label={InsidePieLabel} labelLine={false} isAnimationActive={false}>{[COLORS.Pledge,COLORS.Promoter].map((color,i)=><Cell key={i} fill={color} stroke="var(--surface)" strokeWidth={2}/>)}</Pie><Tooltip formatter={value=>moneyPercent(Number(value))}/></PieChart></ResponsiveContainer></div><div className="rounded-xl border border-[var(--border)] bg-surface-2 p-3"><span className="text-xs text-muted">Pledged of promoter holding</span><strong className="mt-1 block text-xl tabular text-fg">{moneyPercent(selectedQuarterData.promoterPledge)}</strong></div><p className="mt-3 text-xs text-subtle">The pledge pie shows pledged vs unpledged promoter shares, based on the filing's pledge percentage.</p></Panel>
          </div>
        </div> : <Panel><p className="text-sm text-muted">Promoter holding or pledge data is not verified for {activeQuarter} {activeYear}. No estimated pie is shown.</p></Panel>}
      </Section>

      <Section title="Quarterly comparison" hint="Reported filings · change is latest minus oldest, in percentage points (pp)">
        {quarters.length ? <div className="overflow-x-auto rounded-xl shadow-[var(--shadow-border)]">
          <table className="w-full min-w-[860px] border-collapse text-left text-xs">
            <thead className="bg-surface-2 text-muted"><tr><th className="sticky left-0 z-10 bg-surface-2 p-3 font-medium">Category</th>{quarters.map(q => <th key={q.asOnDate} className="whitespace-nowrap p-3 font-medium"><span className="block">{quarterLabel(q)}</span><span className="mt-1 block text-[10px] text-subtle">{q.asOnDate}</span></th>)}<th className="p-3 font-medium">Change</th></tr></thead>
            <tbody>{tableRows.map(row => <tr key={row.key} className="border-t border-[var(--border)] hover:bg-surface-2/50"><th className="sticky left-0 z-10 bg-surface p-3 font-medium text-fg">{row.label}</th>{quarters.map(q => <td key={q.asOnDate} className="whitespace-nowrap p-3 tabular text-fg">{moneyPercent(q[row.key])}</td>)}<td className="p-3 tabular text-fg">{delta(row.key)}</td></tr>)}</tbody>
          </table>
        </div> : <Panel><p className="text-sm text-muted">No verified quarterly comparison is available.</p></Panel>}
      </Section>

      {data.note ? <Panel className="flex items-start gap-2 p-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted"/><p className="text-xs text-muted">{data.note}</p></Panel> : null}
      <Panel className="mt-6 p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-subtle">Data source</p><p className="mt-1 text-sm text-fg">{data.sourceName || "Exchange filing"} · Shareholding Pattern</p></div><a href={data.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted underline">Open source <ExternalLink className="size-3"/></a></div><p className="mt-2 text-xs text-subtle">Only verified values are shown. FII/DII screening uses the same latest reported quarter; exactly 15.00% does not pass the strict above-15% threshold.</p></Panel>
    </>}
  </div>;
}

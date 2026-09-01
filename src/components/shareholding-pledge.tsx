import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { fetchAnalysis } from "@/lib/market/server";
import { fetchOwnership } from "@/lib/market/ownership";
import { cn } from "@/lib/utils";

type Tab = "Q1" | "Q2" | "Q3" | "Q4" | "5 YEARS";
const TABS: Tab[] = ["Q1", "Q2", "Q3", "Q4", "5 YEARS"];
const MONTH: Record<Exclude<Tab, "5 YEARS">, string> = { Q1: "Jun", Q2: "Sep", Q3: "Dec", Q4: "Mar" };

function pct(v: number) { return `${v.toFixed(2)}%`; }
function latestQuarterTab(rows: any[]): Tab {
  const last = rows.at(-1)?.period?.toLowerCase() ?? "";
  if (last.includes("sep")) return "Q2";
  if (last.includes("dec")) return "Q3";
  if (last.includes("mar")) return "Q4";
  return "Q1";
}
function selectedQuarter(rows: any[], tab: Tab) {
  if (tab === "5 YEARS") return null;
  return rows.filter(r => r.period.toLowerCase().includes(MONTH[tab].toLowerCase())).at(-1) ?? null;
}

export function ShareholdingPledge({ symbol }: { symbol: string }) {
  const [shareTab, setShareTab] = useState<Tab | null>(null);
  const [pledgeTab, setPledgeTab] = useState<Tab | null>(null);
  const analysis = useQuery({ queryKey: ["ownership-company", symbol], queryFn: () => fetchAnalysis({ data: { symbol, period: "1Y" } }), staleTime: 15 * 60_000 });
  const companyName = analysis.data?.quote?.name ?? symbol.replace(/\.NS$|\.BO$/i, "");
  const q = useQuery({ queryKey: ["ownership", symbol, companyName], queryFn: () => fetchOwnership({ data: { symbol, companyName } }), staleTime: 30 * 60_000 });
  const data = q.data;
  const latest = data?.quarters.at(-1);
  const effectiveShareTab = shareTab ?? latestQuarterTab(data?.quarters ?? []);
  const effectivePledgeTab = pledgeTab ?? latestQuarterTab(data?.quarters ?? []);

  const shareRows = effectiveShareTab === "5 YEARS" ? (data?.years ?? []) : (() => { const r = selectedQuarter(data?.quarters ?? [], effectiveShareTab); return r ? [r] : []; })();
  const pledgeRow = effectivePledgeTab === "5 YEARS" ? (data?.years.filter(r => r.pledged != null) ?? []).at(-1) : selectedQuarter(data?.quarters ?? [], effectivePledgeTab);
  const latestPledge = data?.quarters.slice().reverse().find(r => r.pledged != null);
  const pledge = pledgeRow?.pledged ?? latestPledge?.pledged ?? null;

  const bars = shareRows.map(r => ({ period: r.period, Promoter: r.promoter ?? 0, "FII / FPI": r.fii ?? 0, DII: r.dii ?? 0, Public: r.public ?? 0, Others: r.others ?? 0 }));
  const pie = pledge == null ? [] : [{ name: "Pledged Shares", value: pledge }, { name: "Unpledged Shares", value: Math.max(0, 100 - pledge) }];

  return <section className="mt-8 space-y-7 border-t border-border pt-7">
    <div>
      <div className="mb-3 flex items-end justify-between gap-3"><h2 className="font-display text-2xl tracking-tight text-fg">Shareholding</h2><span className="text-right text-xs text-subtle">NSE · Latest: {latest?.period ?? "—"}</span></div>
      <Tabs value={effectiveShareTab} onChange={setShareTab} />
      {bars.length ? <div className="mt-3 rounded-xl bg-black px-1 py-4">
        <div className="mb-1 flex justify-between px-3 text-xs text-subtle"><span>{effectiveShareTab === "5 YEARS" ? "5-year annual comparison" : shareRows[0]?.period}</span><span>Percentage of total shares</span></div>
        <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={bars} margin={{ top: 25, right: 5, left: 0, bottom: 20 }}>
          <CartesianGrid vertical={false} stroke="#2a2b30" strokeDasharray="2 4" />
          <XAxis dataKey="period" tick={{ fill: "#a7a9b0", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#a7a9b0" }} />
          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fill: "#a7a9b0", fontSize: 10 }} tickLine={false} axisLine={false} width={38} />
          {(["Promoter", "FII / FPI", "DII", "Public", "Others"] as const).map(k => <Bar key={k} dataKey={k} fill="#ffffff" radius={[3, 3, 0, 0]} maxBarSize={50} label={{ position: "top", fill: "#fff", fontSize: 10, formatter: (v: any) => pct(Number(v)) }} />)}
        </BarChart></ResponsiveContainer></div>
      </div> : <Empty />}
    </div>

    <div className="border-t border-border pt-7">
      <div className="mb-3 flex items-end justify-between gap-3"><h2 className="font-display text-2xl tracking-tight text-fg">Promoter Pledge</h2><span className="text-right text-xs text-subtle">NSE · Latest: {latestPledge?.period ?? "—"}</span></div>
      <Tabs value={effectivePledgeTab} onChange={setPledgeTab} />
      {pie.length ? <div className="mt-3 rounded-xl bg-black px-2 py-5">
        <div className="text-center text-xs text-subtle">{effectivePledgeTab === "5 YEARS" ? "Latest annual pledge comparison" : (pledgeRow?.period ?? latestPledge?.period)}</div>
        <div className="mx-auto h-72 max-w-sm"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="48%" innerRadius={70} outerRadius={112} label={({ value }) => pct(Number(value))} labelLine={false}><Cell fill="#2563eb" /><Cell fill="#f97316" /></Pie></PieChart></ResponsiveContainer></div>
        <div className="flex flex-wrap justify-center gap-5 text-xs text-fg"><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-blue-600" />Pledged ({pct(pledge ?? 0)})</span><span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-orange-500" />Unpledged ({pct(100 - (pledge ?? 0))})</span></div>
        <div className="mt-3 text-center text-xs text-subtle">360° promoter-share split</div>
      </div> : <Empty label="Pledge data is not available from the source right now." />}
    </div>
  </section>;
}

function Tabs({ value, onChange }: { value: Tab; onChange: (v: Tab) => void }) { return <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{TABS.map(tab => <button key={tab} type="button" onClick={() => onChange(tab)} className={cn("h-12 rounded-xl px-2 text-sm font-semibold", value === tab ? "bg-white text-black" : "bg-surface-2 text-fg")}>{tab}</button>)}</div>; }
function Empty({ label = "Shareholding data is not available from the source right now." }: { label?: string }) { return <div className="mt-3 rounded-xl bg-surface-2 px-4 py-8 text-center text-sm text-muted">{label}</div>; }

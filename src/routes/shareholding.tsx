import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink, UsersRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchShareholding, type ShareholdingQuarter } from "@/lib/market/shareholding";
import { displaySymbol } from "@/lib/market/config";
import { Panel, Section, SkeletonBlock } from "@/components/widgets";

type Search = { symbol: string };
export const Route = createFileRoute("/shareholding")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    symbol: typeof search.symbol === "string" && search.symbol ? search.symbol : "RELIANCE.NS",
  }),
  component: ShareholdingPage,
});

const COLORS = { FII: "#ef4444", DII: "#eab308", Promoter: "#22c55e", Public: "#a855f7", Additional: "#3b82f6" };
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
  const quarters = useMemo(() => [...(data?.quarters ?? [])].sort((a, b) => a.asOnDate.localeCompare(b.asOnDate)), [data?.quarters]);
  const latest = quarters.at(-1) ?? null;
  const pieData = useMemo(() => {
    if (!latest || latest.promoter == null || latest.fii == null || latest.dii == null || latest.public == null) return [];
    // FII and DII are subcategories of Public. Use the remaining public float as the fourth, non-overlapping slice.
    const otherPublic = Math.max(0, latest.public - latest.fii - latest.dii);
    return [
      { name: "FII", displayName: "FII", value: latest.fii, color: COLORS.FII },
      { name: "DII", displayName: "DII", value: latest.dii, color: COLORS.DII },
      { name: "Promoter", displayName: "Promoter", value: latest.promoter, color: COLORS.Promoter },
      { name: "Public", displayName: "Public*", value: otherPublic, color: COLORS.Public },
    ].filter(item => item.value > 0);
  }, [latest]);
  const screening = useMemo(() => {
    if (!latest || latest.fii == null || latest.dii == null) return { label: "Insufficient Data", detail: "Latest-quarter FII and/or DII figures could not be verified." };
    const combined = latest.fii + latest.dii;
    const passes = latest.fii > 15 || latest.dii > 15 || combined > 15;
    return {
      label: passes ? "Meets 15% Rule" : "Does Not Meet 15% Rule",
      detail: `FII ${moneyPercent(latest.fii)} · DII ${moneyPercent(latest.dii)} · Combined ${moneyPercent(combined)}. A stock qualifies when FII > 15%, DII > 15%, or FII + DII > 15%.`,
    };
  }, [latest]);
  const barData = quarters.map(q => ({ quarter: quarterLabel(q), promoter: q.promoter, pledge: q.promoterPledge }));
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

  return <div className="space-y-5">
    <div className="flex items-start gap-3">
      <a href="/suggestions" className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted" aria-label="Back to suggestions"><ArrowLeft className="size-4"/></a>
      <div className="min-w-0 flex-1"><p className="text-xs uppercase tracking-[0.2em] text-subtle">Artha · Suggestion Box</p><h1 className="mt-1 font-display text-2xl tracking-tight text-fg">Shareholding Analysis</h1><p className="mt-1 text-sm text-muted">{displaySymbol(symbol)} · quarterly exchange disclosures</p></div>
      <UsersRound className="mt-1 size-5 text-muted"/>
    </div>

    {query.isLoading ? <div className="space-y-3"><SkeletonBlock className="h-64"/><SkeletonBlock className="h-56"/><SkeletonBlock className="h-52"/></div> : query.isError || !data ? <Panel><p className="text-sm text-muted">Shareholding data is temporarily unavailable. No estimated figures are displayed.</p></Panel> : <>
      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs uppercase tracking-wider text-subtle">15% FII / DII screening</p><h2 className="mt-1 text-lg font-semibold text-fg">{screening.label}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${screening.label === "Meets 15% Rule" ? "bg-up/10 text-up" : screening.label === "Insufficient Data" ? "bg-surface-2 text-muted" : "bg-down/10 text-down"}`}>{screening.label === "Meets 15% Rule" ? "Qualifies" : screening.label === "Insufficient Data" ? "Not verified" : "Does not qualify"}</span></div>
        <p className="mt-2 text-sm text-muted">{screening.detail}</p>
        {latest ? <p className="mt-2 text-xs text-subtle">Latest reported quarter: {latest.quarter} · as on {latest.asOnDate}</p> : null}
      </Panel>

      <Section title="Latest-quarter shareholding" hint={latest ? `Reported as on ${latest.asOnDate}` : "Latest verified filing"}>
        {pieData.length ? <>
          <div className="h-[290px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={112} labelLine={false} label={InsidePieLabel} isAnimationActive={false}>
                  {pieData.map(entry => <Cell key={entry.name} fill={entry.color}/>)}
                </Pie>
                <Tooltip formatter={(value) => moneyPercent(Number(value))}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted">{pieData.map(entry => <span key={entry.name} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: entry.color }}/>{entry.displayName}: {moneyPercent(entry.value)}</span>)}</div>
          <p className="mt-3 text-xs text-subtle">* Public slice excludes FII and DII so the pie does not double-count them. Public (total) remains available in the comparison table. White labels appear inside segments where there is enough room.</p>
        </> : <Panel><p className="text-sm text-muted">Insufficient Data: verified latest-quarter FII, DII, promoter and public percentages are not all available.</p></Panel>}
      </Section>

      <Section title="Promoter holding & pledge" hint="Four reported quarters · Q1 oldest to Q4 latest">
        {barData.length ? <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 22, right: 8, left: -16, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.45}/>
              <XAxis dataKey="quarter" tick={{ fill: "var(--muted)", fontSize: 10 }} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} unit="%" />
              <Tooltip formatter={(value) => moneyPercent(typeof value === "number" ? value : null)}/>
              <Bar dataKey="promoter" name="Promoter holding" fill={COLORS.Promoter} radius={[4,4,0,0]} maxBarSize={28}>
                <LabelList dataKey="promoter" position="insideTop" fill="#fff" fontSize={10} formatter={(value) => typeof value === "number" ? `${value.toFixed(1)}%` : "—"}/>
              </Bar>
              <Bar dataKey="pledge" name="Promoter pledge (% of promoter holding)" fill={COLORS.FII} radius={[4,4,0,0]} maxBarSize={28}>
                <LabelList dataKey="pledge" position="insideTop" fill="#fff" fontSize={10} formatter={(value) => typeof value === "number" ? `${value.toFixed(1)}%` : ""}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div> : <Panel><p className="text-sm text-muted">Insufficient Data: no quarterly promoter figures were verified.</p></Panel>}
        <p className="mt-2 text-xs text-subtle">Pledge is expressed as pledged shares divided by promoter-group shares. If the filing does not provide enough information to calculate it, the value is left blank.</p>
      </Section>

      <Section title="Four-quarter comparison" hint="Change is latest minus oldest, in percentage points (pp)">
        {quarters.length ? <div className="overflow-x-auto rounded-xl shadow-[var(--shadow-border)]">
          <table className="w-full min-w-[680px] border-collapse text-left text-xs">
            <thead className="bg-surface-2 text-muted"><tr><th className="p-3 font-medium">Category</th>{quarters.map(q => <th key={q.asOnDate} className="p-3 font-medium">{quarterLabel(q)}</th>)}<th className="p-3 font-medium">Change</th></tr></thead>
            <tbody>{tableRows.map(row => <tr key={row.key} className="border-t border-[var(--border)]"><th className="p-3 font-medium text-fg">{row.label}</th>{quarters.map(q => <td key={q.asOnDate} className="p-3 tabular text-fg">{moneyPercent(q[row.key])}</td>)}<td className="p-3 tabular text-fg">{delta(row.key)}</td></tr>)}</tbody>
          </table>
        </div> : <Panel><p className="text-sm text-muted">No verified quarterly comparison is available.</p></Panel>}
      </Section>

      {data.note ? <Panel className="flex items-start gap-2 p-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted"/><p className="text-xs text-muted">{data.note}</p></Panel> : null}
      <Panel className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-subtle">Data source</p><p className="mt-1 text-sm text-fg">NSE India · Corporate Filings · Shareholding Pattern</p></div><a href={data.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted underline">Open source <ExternalLink className="size-3"/></a></div><p className="mt-2 text-xs text-subtle">Only verified values are shown. FII/DII screening uses the same latest reported quarter; exactly 15.00% does not pass the strict above-15% threshold.</p></Panel>
    </>}
  </div>;
}

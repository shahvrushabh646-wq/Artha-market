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

const COLORS = { FII: "#ef4444", DII: "#eab308", Promoter: "#10b981", Public: "#f8fafc", Pledge: "#e11d48", Other: "#3b82f6", Additional: "#8b5cf6" };
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
    queryKey: ["shareholding-analysis-v6", symbol],
    queryFn: () => fetchShareholding({ data: { symbol } }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const data = query.data;
  const quarters = useMemo(() => { const byDate = new Map<string, ShareholdingQuarter>(); for (const q of [...(data?.quarters ?? [])].sort((a, b) => a.asOnDate.localeCompare(b.asOnDate))) byDate.set(q.asOnDate, q); return [...byDate.values()]; }, [data?.quarters]);
  const latest = quarters.at(-1) ?? null;
  const latestDate = latest ? new Date(latest.asOnDate + "T00:00:00Z") : new Date();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  const [promoterYear, setPromoterYear] = useState<number | null>(null);
  const [promoterQuarter, setPromoterQuarter] = useState<number | null>(null);
  const activeYear = selectedYear ?? latestDate.getUTCFullYear();
  const activeQuarter = selectedQuarter ?? Math.floor(latestDate.getUTCMonth() / 3) + 1;
  const currentYear = new Date().getUTCFullYear();
  const yearTabs = [...new Set([
    ...Array.from({ length: Math.max(0, currentYear - 2018 + 1) }, (_, i) => 2018 + i),
    ...quarters.map(q => new Date(q.asOnDate + "T00:00:00Z").getUTCFullYear()),
  ])].sort((a, b) => a - b);
  const selectedQuarterData = quarters.find(q => { const date = new Date(q.asOnDate + "T00:00:00Z"); return date.getUTCFullYear() === activeYear && Math.floor(date.getUTCMonth() / 3) + 1 === activeQuarter; }) ?? null;
  const pieData = useMemo(() => {
    const quarter = selectedQuarterData;
    if (!quarter || quarter.promoter == null) return [];
    const promoter = quarter.promoter;
    const fii = quarter.fii;
    const dii = quarter.dii;
    const slices: Array<{ name: string; displayName: string; value: number; color: string }> = [
      { name: "Promoter", displayName: "Promoter", value: promoter, color: COLORS.Promoter },
    ];
    if (fii != null && Number.isFinite(fii) && fii >= 0) slices.push({ name: "FII", displayName: "FII", value: fii, color: COLORS.FII });
    if (dii != null && Number.isFinite(dii) && dii >= 0) slices.push({ name: "DII", displayName: "DII", value: dii, color: COLORS.DII });
    let residual: number | null = null;
    if (quarter.public != null && Number.isFinite(quarter.public)) {
      residual = quarter.public - ((fii ?? 0) + (dii ?? 0));
    } else if (fii != null && dii != null) {
      residual = 100 - promoter - fii - dii;
    } else if (fii == null && dii == null && quarter.public != null) {
      residual = quarter.public;
    }
    if (residual != null && Number.isFinite(residual) && residual > 0.05) {
      slices.push({ name: "Others", displayName: fii != null || dii != null ? "Other Public" : "Public / Others", value: residual, color: COLORS.Other });
    }
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (total <= 0 || total > 100.5 || slices.some(x => x.value < 0)) return [];
    return slices.filter(item => item.value > 0);
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

  const trendData = useMemo(() => {
    return quarters
      .filter(q => q.fii != null || q.dii != null)
      .slice(-12)
      .map(q => ({
        label: quarterLabel(q).replace(" ", "\n") || q.asOnDate.slice(2),
        FII: q.fii ?? null,
        DII: q.dii ?? null,
        asOn: q.asOnDate,
      }));
  }, [quarters]);

  const pledgeImpact = useMemo(() => {
    const rate = latest?.promoterPledge;
    if (rate == null || !Number.isFinite(rate)) {
      return {
        level: "Not verified",
        color: "text-muted",
        summary: "No verified promoter pledge rate is available for the latest filing. Pledge impact cannot be assessed.",
        points: [
          "High promoter pledge is generally viewed as a risk signal because it can lead to forced selling if collateral value falls.",
          "Without a verified number we do not estimate or invent a pledge percentage.",
        ],
      };
    }
    if (rate >= 50) {
      return {
        level: "High risk",
        color: "text-down",
        summary: `Promoter pledge is ${rate.toFixed(2)}% of promoter holding — elevated. Markets often price in higher downside risk and volatility when a large share of promoter equity is pledged.`,
        points: [
          "Pledge above 50% has historically correlated with sharper drawdowns during market stress for many mid/small-cap names.",
          "Watch for any reduction in pledge in upcoming filings; a sustained decline is usually taken as a positive signal.",
          "This is a qualitative assessment only — not a price prediction or investment recommendation.",
        ],
      };
    }
    if (rate >= 20) {
      return {
        level: "Moderate attention",
        color: "text-amber-500",
        summary: `Promoter pledge is ${rate.toFixed(2)}% of promoter holding. Moderately elevated; worth monitoring but not extreme.`,
        points: [
          "Pledge in the 20–50% band is common and does not by itself imply immediate stress.",
          "Sudden large increases in pledge or simultaneous price decline can amplify negative sentiment.",
          "This is a qualitative assessment only — not a price prediction or investment recommendation.",
        ],
      };
    }
    return {
      level: "Low / comfortable",
      color: "text-up",
      summary: `Promoter pledge is ${rate.toFixed(2)}% of promoter holding — relatively low. Lower pledge levels are generally viewed more favourably by institutional investors.`,
      points: [
        "Low pledge reduces the risk of margin-call driven selling by promoters.",
        "Many quality large-caps maintain near-zero or single-digit pledge ratios.",
        "This is a qualitative assessment only — not a price prediction or investment recommendation.",
      ],
    };
  }, [latest]);

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
        {latest ? <p className="mt-2 text-xs text-subtle">Latest reported quarter: {latest.quarter} · as on {latest.asOnDate} · {quarters.length} verified filings loaded</p> : null}
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
          <div className="mt-3 grid grid-cols-2 gap-3">{pieData.map(entry => <span key={entry.name} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-surface-2 px-3 py-3 text-xs text-muted"><span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }}/><span className="min-w-0"><span className="block">{entry.displayName}</span><strong className="mt-1 block tabular text-base font-semibold text-fg">{moneyPercent(entry.value)}</strong></span></span>)}</div>
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs leading-5 text-subtle">Filing as on {selectedQuarterData?.asOnDate}. Pie shows Promoter, FII, DII and Other Public. FII and DII are part of total Public, so Other Public is calculated as total Public minus FII and DII to avoid double-counting.</p>
        </> : <Panel><p className="text-sm text-muted">No verified filing found for Q{activeQuarter} {activeYear}. Try another quarter. Historical figures are not estimated. {quarters.length ? `${quarters.length} other filings are available — try the latest year.` : ""}</p></Panel>}
        </Panel>
      </Section>

      <Section title="Promoter holding & pledge" hint="Independent year and quarter tabs · pledge split within promoter holding only">
        {(() => {
          const latestWithPromoter = [...quarters].reverse().find(q => q.promoter != null) ?? latest;
          const promoterDefaultDate = latestWithPromoter ? new Date(latestWithPromoter.asOnDate + "T00:00:00Z") : latestDate;
          const promoterActiveYear = promoterYear ?? promoterDefaultDate.getUTCFullYear();
          const promoterActiveQuarter = promoterQuarter ?? Math.floor(promoterDefaultDate.getUTCMonth() / 3) + 1;
          const inSelectedPromoterQuarter = (q: ShareholdingQuarter) => {
            const date = new Date(q.asOnDate + "T00:00:00Z");
            return date.getUTCFullYear() === promoterActiveYear && Math.floor(date.getUTCMonth() / 3) + 1 === promoterActiveQuarter;
          };
          const promoterQuarterRows = quarters.filter(inSelectedPromoterQuarter);
          const promoterQuarterData = [...promoterQuarterRows].reverse().find(q => q.promoter != null) ?? promoterQuarterRows.at(-1) ?? null;
          const promoterPledgeQuarterData = [...promoterQuarterRows].reverse().find(q => q.promoterPledge != null) ?? null;
          let pledgeFallbackNote: string | null = null;
          const holding = promoterQuarterData?.promoter;
          const pledgeRate = promoterPledgeQuarterData?.promoterPledge ?? null;
          if (pledgeRate == null && holding != null) {
            pledgeFallbackNote = "No verified pledge rate for the selected quarter. The pie is withheld rather than displaying an assumed 0%.";
          }
          const pledgeVerified = pledgeRate != null && Number.isFinite(pledgeRate) && pledgeRate >= 0 && pledgeRate <= 100;
          const pledged = pledgeVerified ? pledgeRate! : null;
          const unpledged = pledgeVerified ? Math.max(0, 100 - pledgeRate!) : null;
          const pieSlices = pledgeVerified ? [
            { name: "Promoter Pledged", displayName: "Promoter Pledged", value: Math.max(0, pledged as number), color: COLORS.Pledge },
            { name: "Promoter Not Pledged", displayName: "Promoter Not Pledged", value: Math.max(0, unpledged as number), color: COLORS.Promoter },
          ] : [];
          const availableYears = [...new Set(quarters.filter(q => q.promoter != null).map(q => new Date(q.asOnDate + "T00:00:00Z").getUTCFullYear()))].sort((a,b)=>a-b);
          return <Panel className="p-4 sm:p-6">
            <div className="mb-5 space-y-3">
              <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-medium uppercase tracking-wider text-subtle">Year</span>{yearTabs.map(year => <button key={year} type="button" onClick={() => setPromoterYear(year)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${promoterActiveYear===year?"bg-accent text-white shadow-sm":"bg-surface-2 text-muted hover:text-fg"}`}>{year}</button>)}</div>
              <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-medium uppercase tracking-wider text-subtle">Quarter</span>{[1,2,3,4].map(q => <button key={q} type="button" onClick={() => setPromoterQuarter(q)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${promoterActiveQuarter===q?"bg-surface-3 text-fg ring-1 ring-[var(--border)]":"bg-surface-2 text-muted hover:text-fg"}`}>Q{q}</button>)}<span className="ml-auto text-xs text-muted">{promoterQuarterData || promoterPledgeQuarterData ? "Filing · "+(promoterPledgeQuarterData?.asOnDate ?? promoterQuarterData?.asOnDate) : "No filing for this period"}</span></div>
            </div>
            {holding != null ? <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Stat label="Promoter holding" value={moneyPercent(holding)} />
              <Stat label="Pledge (% of promoter holding)" value={pledgeRate != null ? moneyPercent(pledgeRate) : "Not verified"} />
            </div> : null}
            {pledgeVerified ? <>
              <div className="mx-auto h-[320px] w-full max-w-2xl"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieSlices} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={66} outerRadius={132} paddingAngle={2} labelLine={false} label={InsidePieLabel} isAnimationActive={false}>{pieSlices.map(item => <Cell key={item.name} fill={item.color} stroke="var(--surface)" strokeWidth={2}/>)}</Pie><Tooltip formatter={value => moneyPercent(Number(value))}/></PieChart></ResponsiveContainer></div>
              <div className="mt-3 grid grid-cols-2 gap-3">{pieSlices.map(item => <div key={item.name} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-surface-2 px-3 py-3 text-xs text-muted"><span className="size-3 shrink-0 rounded-full" style={{backgroundColor:item.color}}/><span className="min-w-0"><span className="block">{item.name}</span><strong className="mt-1 block tabular text-base font-semibold text-fg">{moneyPercent(item.value)}</strong></span></div>)}</div>
              <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs leading-5 text-subtle">Pledge filing as on {promoterPledgeQuarterData?.asOnDate ?? "n/a"}. Pie is normalized to promoter holding only: Promoter Pledged + Promoter Not Pledged = 100% of promoter shares.{pledgeFallbackNote ? ` ${pledgeFallbackNote}` : ""}</p>
            </> : <Panel><p className="text-sm text-muted">{holding != null ? `Promoter holding ${moneyPercent(holding)} is verified for Q${promoterActiveQuarter} ${promoterActiveYear}, but no verified promoter pledge rate was found.` : `Promoter holding data is not verified for Q${promoterActiveQuarter} ${promoterActiveYear}. ${availableYears.length ? `Verified promoter filings exist for: ${availableYears.join(", ")}.` : ""}`}</p></Panel>}
          </Panel>;
        })()}
      </Section>

      <Section title="FII & DII holding trends" hint="Last up to 12 verified quarters · institutional ownership over time">
        {trendData.length >= 2 ? (
          <Panel className="p-4 sm:p-6">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} unit="%" domain={[0, "auto"]} />
                  <Tooltip formatter={(value: number) => moneyPercent(value)} labelFormatter={(_, payload) => payload?.[0]?.payload?.asOn ?? ""} />
                  <Bar dataKey="FII" name="FII" fill={COLORS.FII} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="DII" name="DII" fill={COLORS.DII} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs leading-5 text-subtle">Bars show foreign institutional (FII) and domestic institutional (DII) ownership as % of total equity for each verified filing. Rising FII/DII is often interpreted as increasing institutional confidence; sustained declines can signal the opposite. Only verified exchange filings are plotted — no estimates.</p>
          </Panel>
        ) : (
          <Panel><p className="text-sm text-muted">Insufficient verified FII/DII history to plot a trend (need at least two quarters).</p></Panel>
        )}
      </Section>

      <Section title="Pledge impact on stock price" hint="Qualitative risk assessment based on latest verified promoter pledge">
        <Panel className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-subtle">Promoter pledge risk signal</p>
              <h2 className={`mt-1 text-lg font-semibold ${pledgeImpact.color}`}>{pledgeImpact.level}</h2>
            </div>
            {latest?.promoterPledge != null && Number.isFinite(latest.promoterPledge) ? (
              <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold tabular text-fg">
                {moneyPercent(latest.promoterPledge)} pledged
              </span>
            ) : null}
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">{pledgeImpact.summary}</p>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-muted">
            {pledgeImpact.points.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-subtle" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs leading-5 text-subtle">
            This section is informational only. It does not predict future price movement and is not investment advice. Always cross-check with the latest exchange filings and your own research.
          </p>
        </Panel>
      </Section>

      <Section title="Quarterly comparison" hint="Reported filings · change is latest minus oldest, in percentage points (pp)">
        {quarters.length ? <div className="overflow-x-auto rounded-xl shadow-[var(--shadow-border)]">
          <table className="w-full min-w-[860px] border-collapse text-left text-xs">
            <thead className="bg-surface-2 text-muted"><tr><th className="sticky left-0 z-10 bg-surface-2 p-3 font-medium">Category</th>{quarters.map(q => <th key={q.asOnDate} className="whitespace-nowrap p-3 font-medium"><span className="block">{quarterLabel(q)}</span><span className="mt-1 block text-[10px] text-subtle">{q.asOnDate}</span></th>)}<th className="p-3 font-medium">Change</th></tr></thead>
            <tbody>{tableRows.map(row => <tr key={row.key} className="border-t border-[var(--border)] hover:bg-surface-2/50"><th className="sticky left-0 z-10 bg-surface p-3 font-medium text-fg">{row.label}</th>{quarters.map(q => <td key={q.asOnDate} className="whitespace-nowrap p-3 tabular text-fg">{moneyPercent(q[row.key])}</td>)}<td className="p-3 tabular text-muted">{delta(row.key)}</td></tr>)}</tbody>
          </table>
        </div> : <Panel><p className="text-sm text-muted">No quarterly comparison available yet.</p></Panel>}
      </Section>

      {data.note ? <Panel><p className="text-xs leading-5 text-subtle">{data.note}</p></Panel> : null}
      {data.source ? <p className="text-xs text-subtle">Source: <a className="underline" href={data.source} target="_blank" rel="noreferrer">{data.sourceName || "Exchange filing"} <ExternalLink className="ml-1 inline size-3"/></a></p> : null}
    </>}
  </div>;
}

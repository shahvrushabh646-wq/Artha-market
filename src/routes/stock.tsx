import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BellPlus, Eye, PieChart as PieChartIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CandleChart } from "@/components/candle-chart";
import { CompanyGujarati } from "@/components/company-gujarati";
import { SymbolSearch } from "@/components/symbol-search";
import { TopSignal } from "@/components/top-signal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, QuoteHeader, Section, SignalBadge, SkeletonBlock, Stat } from "@/components/widgets";
import { CHART_PERIODS, DATA_NOTE, DISCLAIMER, displaySymbol, type ChartPeriod } from "@/lib/market/config";
import { customValuation, fmtCurrency, fmtDate, fmtNumber, fmtPercent, lastValid, optionalBelowHighLevels, parseMetric, pctAboveLow, pctBelowHigh, periodHighLow, priceVsSma, rsi, rsiInterpretation, sma, stockScore, supportResistance, technicalSummary } from "@/lib/market/math";
import { fetchAnalysis } from "@/lib/market/server";
import { fetchShareholding, type ShareholdingQuarter } from "@/lib/market/shareholding";
import { useDesk } from "@/lib/store";
import { cn } from "@/lib/utils";

type Search = { symbol: string; period: ChartPeriod };
export const Route = createFileRoute("/stock")({ validateSearch: (s: Record<string, unknown>): Search => ({ symbol: typeof s.symbol === "string" && s.symbol ? s.symbol : "RELIANCE.NS", period: CHART_PERIODS.includes(s.period as ChartPeriod) ? (s.period as ChartPeriod) : "1Y" }), component: StockPage });
function StockPage() {
  const { symbol, period } = Route.useSearch(); const navigate = Route.useNavigate();
  const addWatch = useDesk((s) => s.addWatch); const addAlert = useDesk((s) => s.addAlert); const watched = useDesk((s) => s.watchlist.includes(symbol));
  const [target, setTarget] = useState(""); const [cond, setCond] = useState(">=" as ">=" | "<="); const [showLevels, setShowLevels] = useState(false); const [showRules, setShowRules] = useState(false); const [showHoldings, setShowHoldings] = useState(false);
  const q = useQuery({ queryKey: ["analysis", symbol, period], queryFn: () => fetchAnalysis({ data: { symbol, period } }) }); const data = q.data; const quote = data?.quote;
  const holdingsQ = useQuery({
    queryKey: ["stock-holdings-pies", symbol],
    queryFn: () => fetchShareholding({ data: { symbol } }),
    enabled: showHoldings,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const derived = useMemo(() => { if (!data) return null; const closes = data.bars1y.map((b) => b.c); const s20=lastValid(sma(closes,20)), s50=lastValid(sma(closes,50)), s200=lastValid(sma(closes,200)), r=lastValid(rsi(closes,14)); const hl1=periodHighLow(data.bars1y), hl5=periodHighLow(data.bars5y), price=data.quote.price, tech=technicalSummary(price,s20,s50,s200,r), val=customValuation(hl5.high,price); const pe=parseMetric(data.fundamentals.find(f=>/P\/E/i.test(f.name))?.value??null), eps=parseMetric(data.fundamentals.find(f=>/^EPS/i.test(f.name))?.value??null), de=parseMetric(data.fundamentals.find(f=>/Debt/i.test(f.name))?.value??null), score=stockScore(tech,pe,eps,de,val), sr=supportResistance(data.bars1y); return {s20,s50,s200,r,hl1,hl5,tech,val,score,sr}; },[data]);
  const timeDrop = derived?.val && derived.val.high5y ? fmtPercent(pctBelowHigh(derived.val.currentPrice, derived.val.high5y)) : "—";
  if (q.isLoading) return <div className="space-y-4"><SkeletonBlock className="h-28"/><SkeletonBlock className="h-64"/><SkeletonBlock className="h-40"/></div>;
  if (q.isError || !quote) return <Panel><p className="text-sm text-muted">Could not load this symbol. Try another NSE/BSE code.</p></Panel>;
  return <div className="space-y-6 pb-8">
    <SymbolSearch value={symbol} onSelect={(s)=>navigate({ search: (prev)=>({ ...prev, symbol: s }) })} />
    <QuoteHeader quote={quote} /><TopSignal quote={quote} /><CompanyGujarati symbol={symbol} name={quote.name} />
    <div className="mt-4 grid grid-cols-3 gap-2"><Button variant="secondary" size="sm" className="h-11" onClick={()=>{const added=addWatch(symbol);toast(added?`Watching ${displaySymbol(symbol)}`:"Already on your watchlist");}}><Eye className="size-4"/>{watched?"Watching":"Watch"}</Button><Button variant={showHoldings?"default":"secondary"} size="sm" className="h-11" onClick={()=>setShowHoldings(v=>!v)} aria-pressed={showHoldings}><PieChartIcon className="size-4"/>Holdings</Button><Button variant="secondary" size="sm" className="h-11" onClick={()=>{const t=Number(target||quote.price||0);try{addAlert({symbol,targetPrice:t,condition:cond});toast(`Alert on ${displaySymbol(symbol)}`);}catch(err){toast(err instanceof Error?err.message:"Could not create alert");}}}><BellPlus className="size-4"/>Alert</Button></div>
    <div className="mt-2 grid grid-cols-2 gap-2"><div className="flex gap-1"><select value={cond} onChange={e=>setCond(e.target.value as ">="|"<=")} className="h-11 rounded-lg bg-surface-2 px-1 text-xs text-fg shadow-[var(--shadow-border)]" aria-label="Alert condition"><option value=">=">≥</option><option value="<=">≤</option></select><Input inputMode="decimal" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Alert target" aria-label="Alert target" className="min-w-0"/></div><p className="flex items-center text-xs text-muted">Holdings shows shareholding & pledge pies for this company.</p></div>
    {showHoldings ? <StockHoldingsSection symbol={symbol} query={holdingsQ} /> : null}
    <Section title="Valuation rule" hint="Personal rule: buy only at or below 25% of the 5-year high. Not advice.">{derived?.val?<><div className="mb-3"><SignalBadge signal={derived.val.signal}/></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Stat label="5Y high" value={fmtCurrency(derived.val.high5y)}/><Stat label="75% level" value={fmtCurrency(derived.val.price75)}/><Stat label="80% level" value={fmtCurrency(derived.val.price80)}/><Stat label="85% level" value={fmtCurrency(derived.val.price85)}/><Stat label="90% level" value={fmtCurrency(derived.val.price90)}/><Stat label="Time Drop" value={timeDrop}/><Stat label="Last" value={fmtCurrency(derived.val.currentPrice)}/><Stat label="Gap to 25%" value={fmtCurrency(derived.val.currentPrice-derived.val.price75)}/></div><button type="button" className="mt-3 text-xs text-muted underline-offset-2 hover:text-fg hover:underline" onClick={()=>setShowLevels(v=>!v)}>{showLevels?"Hide optional % levels":"Optional levels (% below 5Y high)"}</button>{showLevels?<div className="mt-2 grid grid-cols-2 gap-2">{optionalBelowHighLevels(derived.val.high5y).map(row=><Stat key={row.label} label={row.label} value={fmtCurrency(row.price)}/>)}</div>:null}</>:<Panel><p className="text-sm text-muted">Need five-year history to run the rule.</p></Panel>}</Section>
    <Section title="Price range" hint="1Y and 5Y extremes from exchange history"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="1Y high" value={fmtCurrency(derived?.hl1.high??null)}/><Stat label="1Y low" value={fmtCurrency(derived?.hl1.low??null)}/><Stat label="5Y high" value={fmtCurrency(derived?.hl5.high??null)}/><Stat label="5Y low" value={fmtCurrency(derived?.hl5.low??null)}/></div>{derived?<div className="mt-2 grid grid-cols-2 gap-2"><Stat label="% below 1Y high" value={fmtPercent(pctBelowHigh(quote.price,derived.hl1.high))}/><Stat label="% above 1Y low" value={fmtPercent(pctAboveLow(quote.price,derived.hl1.low))}/></div>:null}</Section>
    <Section title="Chart" hint={`${period} · OHLC`}><div className="mb-3 flex flex-wrap gap-1">{CHART_PERIODS.map(p=><button key={p} type="button" onClick={()=>navigate({ search: (prev)=>({ ...prev, period: p }) })} className={cn("rounded-lg px-2.5 py-1.5 text-xs font-medium",period===p?"bg-accent text-white":"bg-surface-2 text-muted")}>{p}</button>)}</div><CandleChart bars={data?.bars??[]} height={280}/></Section>
    <Section title="Technicals" hint="SMA / RSI from daily closes"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="SMA 20" value={fmtCurrency(derived?.s20??null)}/><Stat label="SMA 50" value={fmtCurrency(derived?.s50??null)}/><Stat label="SMA 200" value={fmtCurrency(derived?.s200??null)}/><Stat label="RSI 14" value={derived?.r!=null?derived.r.toFixed(1):"—"}/></div><div className="mt-3 flex flex-wrap items-center gap-2"><BadgeTone verdict={derived?.tech.verdict??"Neutral"}/><span className="text-sm text-muted">{derived?.tech.summary??""}</span></div>{derived?.r!=null?<p className="mt-2 text-xs text-subtle">{rsiInterpretation(derived.r)}</p>:null}{derived?<div className="mt-3 grid grid-cols-2 gap-2"><Stat label="Price vs SMA20" value={priceVsSma(quote.price,derived.s20)}/><Stat label="Support / Resistance" value={derived.sr?`${fmtCurrency(derived.sr.support)} / ${fmtCurrency(derived.sr.resistance)}`:"—"}/></div>:null}</Section>
    <Section title="Score" hint="Transparent 0–100 from technicals, fundamentals and the valuation rule"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Technical /40" value={derived?.score.technical??0}/><Stat label="Fundamental /30" value={derived?.score.fundamental??0}/><Stat label="Valuation /30" value={derived?.score.valuation??0}/><Stat label="Total /100" value={derived?.score.total??0}/></div><ScoreBar value={derived?.score.total??0}/></Section>
    <Section title="Fundamentals" hint="As reported by the data provider"><dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{(data?.fundamentals??[]).slice(0,12).map(f=><Info key={f.name} label={f.name} value={f.value}/>)}</dl></Section>
    <Section title="Financials" hint="Consolidated figures as reported">{data?.statements.length?data.statements.map(row=>{const series=row.yearly;const keys=Object.keys(series);if(!keys.length)return null;return <Panel key={row.title} className="mb-2 overflow-x-auto p-3"><div className="text-[11px] uppercase tracking-[0.14em] text-subtle">{row.title}</div><div className="mt-2 flex min-w-max gap-4">{keys.map(k=><div key={k}><div className="text-[11px] text-subtle">{k}</div><div className="tabular text-sm text-fg">{fmtNumber(series[k],0)}</div></div>)}</div></Panel>}) : <Panel><p className="text-sm text-muted">Statements unavailable.</p></Panel>}</Section>
    <Section title="Dividends">{data?.dividends.length?<Panel className="p-2">{data.dividends.slice(0,8).map(d=><div key={d.t} className="flex items-center justify-between px-2 py-2 text-sm"><span className="text-muted">{fmtDate(d.t)}</span><span className="tabular text-fg">{fmtCurrency(d.amount)}</span></div>)}</Panel>:<p className="text-sm text-muted">No dividend history in the last five years.</p>}</Section><p className="mt-8 text-xs text-subtle">{DATA_NOTE}</p><p className="mt-2 text-xs text-subtle">{DISCLAIMER}</p></div>;
}

function moneyPercent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}%`;
}
const HOLDINGS_COLORS = { FII: "#ef4444", DII: "#eab308", Promoter: "#10b981", Other: "#3b82f6", Pledge: "#e11d48" };

function StockHoldingsSection({ symbol, query }: { symbol: string; query: { isLoading: boolean; isError: boolean; data?: { quarters: ShareholdingQuarter[]; note: string | null } | undefined } }) {
  const quarters = useMemo(() => {
    const byDate = new Map<string, ShareholdingQuarter>();
    for (const q of [...(query.data?.quarters ?? [])].sort((a, b) => a.asOnDate.localeCompare(b.asOnDate))) byDate.set(q.asOnDate, q);
    return [...byDate.values()];
  }, [query.data?.quarters]);
  const latest = quarters.at(-1) ?? null;

  const pieData = useMemo(() => {
    if (!latest || latest.promoter == null) return [];
    const slices: Array<{ name: string; displayName: string; value: number; color: string }> = [
      { name: "Promoter", displayName: "Promoter", value: latest.promoter, color: HOLDINGS_COLORS.Promoter },
    ];
    if (latest.fii != null && latest.fii >= 0) slices.push({ name: "FII", displayName: "FII", value: latest.fii, color: HOLDINGS_COLORS.FII });
    if (latest.dii != null && latest.dii >= 0) slices.push({ name: "DII", displayName: "DII", value: latest.dii, color: HOLDINGS_COLORS.DII });
    let residual: number | null = null;
    if (latest.public != null) residual = latest.public - ((latest.fii ?? 0) + (latest.dii ?? 0));
    else if (latest.fii != null && latest.dii != null) residual = 100 - latest.promoter - latest.fii - latest.dii;
    if (residual != null && residual > 0.05) slices.push({ name: "Others", displayName: "Public / Others", value: residual, color: HOLDINGS_COLORS.Other });
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (total <= 0 || total > 100.5) return [];
    return slices.filter((x) => x.value > 0);
  }, [latest]);

  const pledgeSlices = useMemo(() => {
    const rate = latest?.promoterPledge;
    if (rate == null || !Number.isFinite(rate) || rate < 0 || rate > 100) return null;
    return [
      { name: "Promoter Pledged", displayName: "Promoter Pledged", value: rate, color: HOLDINGS_COLORS.Pledge },
      { name: "Promoter Not Pledged", displayName: "Promoter Not Pledged", value: Math.max(0, 100 - rate), color: HOLDINGS_COLORS.Promoter },
    ];
  }, [latest]);

  return (
    <Section title="Holdings" hint={`Shareholding & promoter pledge · ${displaySymbol(symbol)}`}>
      {query.isLoading ? (
        <Panel className="p-4"><p className="text-sm text-muted">Loading verified shareholding…</p></Panel>
      ) : query.isError || !query.data ? (
        <Panel className="p-4"><p className="text-sm text-muted">Shareholding data is temporarily unavailable. No estimated figures are shown.</p></Panel>
      ) : (
        <div className="space-y-4">
          <Panel className="p-4">
            <p className="text-xs uppercase tracking-wider text-subtle">Quarterly shareholding</p>
            {latest ? <p className="mt-1 text-xs text-muted">{latest.quarter} · as on {latest.asOnDate}</p> : null}
            {pieData.length ? (
              <>
                <div className="mx-auto mt-3 h-[260px] w-full max-w-md">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={100} paddingAngle={2} isAnimationActive={false}>
                        {pieData.map((entry) => <Cell key={entry.name} fill={entry.color} stroke="var(--surface)" strokeWidth={2} />)}
                      </Pie>
                      <Tooltip formatter={(v) => moneyPercent(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {pieData.map((entry) => (
                    <span key={entry.name} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-surface-2 px-3 py-2 text-xs text-muted">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="min-w-0"><span className="block">{entry.displayName}</span><strong className="mt-0.5 block tabular text-sm text-fg">{moneyPercent(entry.value)}</strong></span>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">Not verified / No filing available for shareholding categories.</p>
            )}
          </Panel>

          <Panel className="p-4">
            <p className="text-xs uppercase tracking-wider text-subtle">Promoter holding & pledge</p>
            {latest?.promoter != null ? (
              <p className="mt-1 text-sm text-fg">Promoter holding <strong className="tabular">{moneyPercent(latest.promoter)}</strong>
                {latest.promoterPledge != null ? <> · Pledge <strong className="tabular">{moneyPercent(latest.promoterPledge)}</strong> of promoter</> : <> · Pledge not verified</>}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">Promoter holding not verified for the latest filing.</p>
            )}
            {pledgeSlices ? (
              <>
                <div className="mx-auto mt-3 h-[260px] w-full max-w-md">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pledgeSlices} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={100} paddingAngle={2} isAnimationActive={false}>
                        {pledgeSlices.map((entry) => <Cell key={entry.name} fill={entry.color} stroke="var(--surface)" strokeWidth={2} />)}
                      </Pie>
                      <Tooltip formatter={(v) => moneyPercent(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {pledgeSlices.map((entry) => (
                    <span key={entry.name} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-surface-2 px-3 py-2 text-xs text-muted">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="min-w-0"><span className="block">{entry.displayName}</span><strong className="mt-0.5 block tabular text-sm text-fg">{moneyPercent(entry.value)}</strong></span>
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-subtle">Pie normalized to promoter holding only. Missing pledge is never shown as zero.</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">Not verified / No filing available for promoter pledge on this quarter.</p>
            )}
          </Panel>

          <a href={`/shareholding?symbol=${encodeURIComponent(symbol)}`} className="inline-flex text-xs font-medium text-accent hover:underline">
            Open full Shareholding Analysis →
          </a>
          {query.data.note ? <p className="text-xs text-subtle">{query.data.note}</p> : null}
        </div>
      )}
    </Section>
  );
}

function BadgeTone({verdict}:{verdict:"Bullish"|"Bearish"|"Neutral"}){const cls=verdict==="Bullish"?"bg-up/15 text-up":verdict==="Bearish"?"bg-down/15 text-down":"bg-surface-2 text-muted";return <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",cls)}>{verdict}</span>}
function ScoreBar({value}:{value:number}){return <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{width:`${Math.min(100,Math.max(0,value))}%`}}/></div>}
function Info({label,value}:{label:string;value:string|null}){return <div><dt className="text-[11px] uppercase tracking-[0.14em] text-subtle">{label}</dt><dd className="mt-1 text-fg">{value||"N/A"}</dd></div>}

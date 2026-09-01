import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { displaySymbol } from "@/lib/market/config";
import { fmtCurrency } from "@/lib/market/math";
import type { Quote } from "@/lib/market/types";
import { fetchShareholding } from "@/lib/market/shareholding";
import { cn } from "@/lib/utils";
import { PriceBlock, Signed } from "./price";
import { Badge } from "./ui/badge";

export function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="mt-8"><div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="font-display text-xl tracking-tight text-fg">{title}</h2>{hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}</div>{action}</div>{children}{title === "Financials" ? <ShareholdingPledge /> : null}</section>;
}
export function Panel({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn("rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]", className)}>{children}</div>; }
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) { return <div className="rounded-lg bg-surface-2 p-3"><div className="text-[11px] uppercase tracking-[0.14em] text-subtle">{label}</div><div className="mt-1 tabular text-base text-fg">{value}</div>{hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}</div>; }
export function IndexCard({ name, quote }: { name: string; quote: Quote }) { return <div className="min-w-[9.5rem] flex-1 rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]"><div className="text-[11px] uppercase tracking-[0.16em] text-subtle">{name}</div><div className="mt-2 tabular text-lg text-fg">{fmtCurrency(quote.price, "", 2)}</div><div className="mt-1"><Signed value={quote.changePct} as="percent" className="text-xs" /></div></div>; }
export function MoverRow({ quote }: { quote: Quote }) { return <Link to="/stock" search={{ symbol: quote.symbol, period: "1Y" }} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors duration-[var(--motion-quick)] hover:bg-surface-2"><div className="min-w-0"><div className="truncate text-sm font-medium text-fg">{displaySymbol(quote.symbol)}</div><div className="truncate text-xs text-muted">{quote.name}</div></div><div className="text-right"><div className="tabular text-sm text-fg">{fmtCurrency(quote.price)}</div><Signed value={quote.changePct} as="percent" className="text-xs" /></div></Link>; }
export function QuoteHeader({ quote }: { quote: Quote }) { return <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="font-display text-2xl tracking-tight text-fg sm:text-3xl">{quote.name}</h1><p className="mt-1 text-sm text-muted">{quote.symbol}{quote.exchange ? ` · ${quote.exchange}` : ""}</p></div><PriceBlock price={quote.price} change={quote.change} changePct={quote.changePct} size="lg" /></div>; }
export function SignalBadge({ signal }: { signal: "BUY" | "WAIT" | string }) { const buy = signal.includes("BUY"); return <Badge tone={buy ? "buy" : "wait"}>{signal.includes("RULE") ? signal : buy ? "Buy zone" : "Wait"}</Badge>; }
export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) { return <Panel className="px-5 py-10 text-center"><h3 className="font-display text-lg text-fg">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm text-muted">{body}</p>{action ? <div className="mt-5">{action}</div> : null}</Panel>; }
export function SkeletonBlock({ className }: { className?: string }) { return <div className={cn("animate-pulse rounded-xl bg-surface-2", className)} />; }

function ShareholdingPledge() {
  const [symbol, setSymbol] = useState("");
  const [tab, setTab] = useState<"q1" | "q2" | "q3" | "q4" | "5y">("q4");
  useEffect(() => { const s = new URLSearchParams(window.location.search).get("symbol"); if (s) setSymbol(s); }, []);
  const q = useQuery({ queryKey: ["shareholding", symbol], queryFn: () => fetchShareholding({ data: { symbol } }), enabled: !!symbol, staleTime: 15 * 60_000 });
  const data = q.data;
  const quarter = (points: any[]) => {
    if (!points.length || tab === "5y") return points;
    const wanted = ({ q1: "Jun", q2: "Sep", q3: "Dec", q4: "Mar" } as Record<string, string>)[tab];
    return points.filter(p => new RegExp(`^${wanted}\\s*\\d{4}$`, "i").test(p.label)).slice(-1);
  };
  const shareBars = (tab === "5y" ? (data?.yearly ?? []) : quarter(data?.quarterly ?? [])).map(p => ({ label: p.label, Promoter: p.promoter, FII: p.fii, DII: p.dii, Public: p.public, Others: p.others }));
  const pledgeBars = (tab === "5y" ? (data?.pledgeYearly ?? []) : quarter(data?.pledgeQuarterly ?? [])).map(p => ({ label: p.label, Pledged: p.pledged, Unpledged: p.unpledged }));
  return <div className="mt-8 space-y-8">
    <div><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl tracking-tight text-fg">Shareholding</h2><span className="text-xs uppercase tracking-[0.14em] text-subtle">QUARTERLY / 5 YEAR</span></div><Tabs tab={tab} setTab={setTab} /><ChartBlock bars={shareBars} empty={!shareBars.length} labels={["Promoter", "FII", "DII", "Public", "Others"]} />{data?.yearly?.length && tab === "5y" ? <p className="mt-2 text-[10px] text-subtle">Annual view uses the latest five reported financial years available.</p> : null}</div>
    <div><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl tracking-tight text-fg">Promoter Pledge</h2><span className="text-xs uppercase tracking-[0.14em] text-subtle">QUARTERLY / 5 YEAR</span></div><Tabs tab={tab} setTab={setTab} /><ChartBlock bars={pledgeBars} empty={!pledgeBars.length} labels={["Pledged", "Unpledged"]} pledge />{data?.updatedAt ? <p className="mt-2 text-[10px] text-subtle">Updated {new Date(data.updatedAt).toLocaleString("en-IN")} · {data.source}</p> : null}</div>
    {q.isError ? <p className="text-xs text-muted">Shareholding data could not be loaded right now. Refresh the stock page to retry.</p> : null}
  </div>;
}
function Tabs({ tab, setTab }: { tab: string; setTab: (t: "q1" | "q2" | "q3" | "q4" | "5y") => void }) { const tabs = ["q1", "q2", "q3", "q4", "5y"] as const; return <div className="mb-3 grid grid-cols-5 gap-1 rounded-xl bg-surface-2 p-1">{tabs.map(t => <button key={t} type="button" onClick={() => setTab(t)} className={cn("h-9 rounded-lg text-xs font-semibold", tab === t ? "bg-surface text-fg shadow-[var(--shadow-border)]" : "text-muted hover:text-fg")}>{t === "5y" ? "5 YEARS" : t.toUpperCase()}</button>)}</div>; }
function ChartBlock({ bars, empty, labels, pledge = false }: { bars: any[]; empty: boolean; labels: string[]; pledge?: boolean }) { return <Panel className="overflow-hidden p-3 sm:p-4"><div className="h-64 w-full">{empty ? <div className="flex h-full items-center justify-center text-sm text-muted">Data not available</div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={bars} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}><XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} /><Tooltip formatter={(v) => `${Number(v ?? 0).toFixed(2)}%`} /><Legend wrapperStyle={{ fontSize: 10 }} />{labels.map(label => <Bar key={label} dataKey={label} name={`${label} %`} stackId={pledge ? "pledge" : "holding"} fill={label === "Promoter" ? "#22c55e" : label === "FII" ? "#3b82f6" : label === "DII" ? "#a855f7" : label === "Public" ? "#f59e0b" : label === "Pledged" ? "#ef4444" : "#94a3b8"} radius={[2,2,0,0]} />)}</BarChart></ResponsiveContainer>}</div></Panel>; }

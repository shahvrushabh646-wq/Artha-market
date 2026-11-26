import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Panel, SkeletonBlock } from "@/components/widgets";
import { displaySymbol } from "@/lib/market/config";
import { fetchShareholding } from "@/lib/market/shareholding";

const COLORS = ["#10b981", "#ef4444", "#eab308", "#3b82f6", "#8b5cf6"];
type Slice = { name: string; value: number; color: string };

export function StockHoldingsTab({ symbol, company }: { symbol: string; company: string }) {
  const query = useQuery({
    queryKey: ["stock-detail-holdings", symbol],
    queryFn: () => fetchShareholding({ data: { symbol } }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const latest = useMemo(() => [...(query.data?.quarters ?? [])].sort((a, b) => a.asOnDate.localeCompare(b.asOnDate)).at(-1) ?? null, [query.data?.quarters]);
  const sharePie = useMemo<Slice[]>(() => {
    if (!latest || latest.promoter == null || !Number.isFinite(latest.promoter)) return [];
    const promoter = latest.promoter, fii = latest.fii, dii = latest.dii;
    const items: Slice[] = [{ name: "Promoter", value: promoter, color: COLORS[0] }];
    if (fii != null && Number.isFinite(fii) && fii >= 0) items.push({ name: "FII", value: fii, color: COLORS[1] });
    if (dii != null && Number.isFinite(dii) && dii >= 0) items.push({ name: "DII", value: dii, color: COLORS[2] });
    let residual: number | null = null;
    if (latest.public != null && Number.isFinite(latest.public) && fii != null && dii != null) residual = latest.public - fii - dii;
    else if (fii != null && dii != null) residual = 100 - promoter - fii - dii;
    else if (latest.public != null && fii == null && dii == null) residual = latest.public;
    if (residual != null && residual > 0.05 && residual <= 100) items.push({ name: "Other Public", value: residual, color: COLORS[3] });
    const total = items.reduce((sum, item) => sum + item.value, 0);
    return total > 0 && total <= 100.5 && items.every(item => item.value >= 0) ? items : [];
  }, [latest]);
  const pledgePie = useMemo<Slice[]>(() => {
    const rate = latest?.promoterPledge;
    if (rate == null || !Number.isFinite(rate) || rate < 0 || rate > 100) return [];
    return [{ name: "Pledged", value: rate, color: COLORS[4] }, { name: "Not pledged", value: 100 - rate, color: COLORS[0] }];
  }, [latest]);
  const format = (value: number) => value.toFixed(2) + "%";
  const chart = (items: Slice[]) => <div className="mx-auto h-56 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart><Pie data={items} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={2}>
        {items.map(item => <Cell key={item.name} fill={item.color} stroke="var(--surface)" strokeWidth={2} />)}
      </Pie><Tooltip formatter={(value) => format(Number(value))} /></PieChart>
    </ResponsiveContainer>
  </div>;
  const legend = (items: Slice[]) => <div className="grid grid-cols-2 gap-2">{items.map(item => <div key={item.name} className="flex items-center gap-2 text-xs text-muted"><span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} /><span>{item.name}: <strong className="tabular text-fg">{format(item.value)}</strong></span></div>)}</div>;
  return <Panel className="mt-3 p-4 sm:p-5">
    <div className="mb-4"><p className="text-xs uppercase tracking-wider text-subtle">Shareholding · {displaySymbol(symbol)}</p><h2 className="mt-1 text-lg font-semibold text-fg">{company}</h2><p className="mt-1 text-xs text-muted">{latest ? "Latest filing · " + latest.quarter + " · As on " + latest.asOnDate : "No verified quarterly filing available"}</p></div>
    {query.isLoading ? <SkeletonBlock className="h-40" /> : query.isError ? <p className="text-sm text-muted">Shareholding data could not be loaded. Please retry.</p> : <div className="grid gap-5 md:grid-cols-2">
      <div className="rounded-xl bg-surface-2 p-3"><h3 className="text-sm font-semibold text-fg">Shareholding pattern</h3><p className="mt-1 text-xs text-muted">Latest verified quarter</p>{sharePie.length ? <>{chart(sharePie)}{legend(sharePie)}</> : <p className="mt-4 text-sm text-muted">No complete verified shareholding breakdown for this quarter.</p>}</div>
      <div className="rounded-xl bg-surface-2 p-3"><h3 className="text-sm font-semibold text-fg">Promoter holding & pledge</h3><p className="mt-1 text-xs text-muted">Pledge as % of promoter shares</p>{latest?.promoter != null ? <p className="mt-2 text-xs text-muted">Promoter holding: <strong className="text-fg">{format(latest.promoter)}</strong></p> : null}{pledgePie.length ? <>{chart(pledgePie)}{legend(pledgePie)}</> : <Panel className="mt-4 p-3"><p className="text-sm text-muted">Promoter pledge is not separately verified for the latest filing. No pledge pie is estimated.</p></Panel>}</div>
    </div>}
    {query.data?.note ? <p className="mt-3 text-xs text-subtle">{query.data.note}</p> : null}
  </Panel>;
}

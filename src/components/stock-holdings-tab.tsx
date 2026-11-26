import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ExternalLink } from "lucide-react";
import { Panel, SkeletonBlock, Stat } from "@/components/widgets";
import { displaySymbol } from "@/lib/market/config";
import { fetchShareholding, type ShareholdingQuarter } from "@/lib/market/shareholding";

const COLORS = {
  Promoter: "#10b981",
  FII: "#ef4444",
  DII: "#eab308",
  Other: "#3b82f6",
  Pledge: "#e11d48",
};

type Slice = { name: string; displayName: string; value: number; color: string };

function moneyPercent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}%`;
}

function buildSharePie(quarter: ShareholdingQuarter | null): Slice[] {
  if (!quarter) return [];
  const items: Slice[] = [];
  if (quarter.promoter != null && Number.isFinite(quarter.promoter) && quarter.promoter >= 0) {
    items.push({ name: "Promoter", displayName: "Promoter", value: quarter.promoter, color: COLORS.Promoter });
  }
  if (quarter.fii != null && Number.isFinite(quarter.fii) && quarter.fii >= 0) {
    items.push({ name: "FII", displayName: "FII", value: quarter.fii, color: COLORS.FII });
  }
  if (quarter.dii != null && Number.isFinite(quarter.dii) && quarter.dii >= 0) {
    items.push({ name: "DII", displayName: "DII", value: quarter.dii, color: COLORS.DII });
  }
  const promoter = quarter.promoter ?? 0;
  const fii = quarter.fii;
  const dii = quarter.dii;
  let residual: number | null = null;
  if (quarter.public != null && Number.isFinite(quarter.public) && fii != null && dii != null) {
    residual = quarter.public - fii - dii;
  } else if (fii != null && dii != null && quarter.promoter != null) {
    residual = 100 - promoter - fii - dii;
  } else if (quarter.public != null && fii == null && dii == null) {
    residual = quarter.public;
  }
  if (residual != null && Number.isFinite(residual) && residual > 0.05 && residual <= 100) {
    items.push({ name: "Other Public", displayName: "Other Public", value: residual, color: COLORS.Other });
  }
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0 || total > 100.5 || items.some(item => item.value < 0)) return [];
  return items.filter(item => item.value > 0);
}

export function StockHoldingsTab({ symbol, company }: { symbol: string; company: string }) {
  const query = useQuery({
    queryKey: ["stock-detail-holdings-v3", symbol],
    queryFn: () => fetchShareholding({ data: { symbol } }),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const quarters = useMemo(() => {
    const byDate = new Map<string, ShareholdingQuarter>();
    for (const q of [...(query.data?.quarters ?? [])].sort((a, b) => a.asOnDate.localeCompare(b.asOnDate))) {
      byDate.set(q.asOnDate, q);
    }
    return [...byDate.values()];
  }, [query.data?.quarters]);

  // Prefer a quarter that can actually build a pie (has promoter or FII/DII)
  const bestShareQuarter = useMemo(() => {
    const usable = [...quarters].reverse().find(q => buildSharePie(q).length > 0);
    return usable ?? quarters.at(-1) ?? null;
  }, [quarters]);

  const latest = quarters.at(-1) ?? null;
  const defaultDate = bestShareQuarter
    ? new Date(bestShareQuarter.asOnDate + "T00:00:00Z")
    : latest
      ? new Date(latest.asOnDate + "T00:00:00Z")
      : new Date();

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<number | null>(null);
  const [promoterYear, setPromoterYear] = useState<number | null>(null);
  const [promoterQuarter, setPromoterQuarter] = useState<number | null>(null);

  const currentYear = new Date().getUTCFullYear();
  const yearTabs = useMemo(() => {
    return [...new Set([
      ...Array.from({ length: Math.max(0, currentYear - 2018 + 1) }, (_, i) => 2018 + i),
      ...quarters.map(q => new Date(q.asOnDate + "T00:00:00Z").getUTCFullYear()),
    ])].sort((a, b) => a - b);
  }, [quarters, currentYear]);

  const activeYear = selectedYear ?? defaultDate.getUTCFullYear();
  const activeQuarter = selectedQuarter ?? Math.floor(defaultDate.getUTCMonth() / 3) + 1;

  const selectedQuarterData = useMemo(() => {
    return quarters.find(q => {
      const date = new Date(q.asOnDate + "T00:00:00Z");
      return date.getUTCFullYear() === activeYear && Math.floor(date.getUTCMonth() / 3) + 1 === activeQuarter;
    }) ?? null;
  }, [quarters, activeYear, activeQuarter]);

  // If user picked an empty period, still show the best available pie so the chart is never blank when data exists
  const shareSource = selectedQuarterData && buildSharePie(selectedQuarterData).length
    ? selectedQuarterData
    : bestShareQuarter;
  const sharePie = useMemo(() => buildSharePie(shareSource), [shareSource]);
  const usingFallbackShare = shareSource !== selectedQuarterData && shareSource != null;

  // Promoter section
  const latestWithPromoter = [...quarters].reverse().find(q => q.promoter != null) ?? latest;
  const promoterDefaultDate = latestWithPromoter
    ? new Date(latestWithPromoter.asOnDate + "T00:00:00Z")
    : defaultDate;
  const promoterActiveYear = promoterYear ?? promoterDefaultDate.getUTCFullYear();
  const promoterActiveQuarter = promoterQuarter ?? Math.floor(promoterDefaultDate.getUTCMonth() / 3) + 1;

  const promoterQuarterRows = quarters.filter(q => {
    const date = new Date(q.asOnDate + "T00:00:00Z");
    return date.getUTCFullYear() === promoterActiveYear && Math.floor(date.getUTCMonth() / 3) + 1 === promoterActiveQuarter;
  });
  const promoterQuarterData = [...promoterQuarterRows].reverse().find(q => q.promoter != null) ?? promoterQuarterRows.at(-1) ?? null;

  let promoterPledgeQuarterData = [...promoterQuarterRows].reverse().find(q => q.promoterPledge != null) ?? null;
  let pledgeFallbackNote: string | null = null;
  if (!promoterPledgeQuarterData) {
    const target = promoterQuarterData?.asOnDate ?? `${promoterActiveYear}-${String(promoterActiveQuarter * 3).padStart(2, "0")}-28`;
    const withPledge = quarters.filter(q => q.promoterPledge != null && Number.isFinite(q.promoterPledge));
    if (withPledge.length) {
      const past = withPledge.filter(q => q.asOnDate <= target).sort((a, b) => b.asOnDate.localeCompare(a.asOnDate));
      const future = withPledge.filter(q => q.asOnDate > target).sort((a, b) => a.asOnDate.localeCompare(b.asOnDate));
      promoterPledgeQuarterData = past[0] ?? future[0] ?? null;
      if (promoterPledgeQuarterData) {
        pledgeFallbackNote = `Exact-quarter pledge not found. Nearest verified: ${promoterPledgeQuarterData.asOnDate}.`;
      }
    }
  }

  const holding = promoterQuarterData?.promoter ?? null;
  let pledgeRate = promoterPledgeQuarterData?.promoterPledge ?? null;
  if (pledgeRate == null && holding != null) {
    pledgeRate = 0;
    pledgeFallbackNote = "No verified pledge for this period. Showing 0% pledged for display only — treat as unverified.";
  }
  const pledgeVerified = pledgeRate != null && Number.isFinite(pledgeRate) && pledgeRate >= 0 && pledgeRate <= 100;
  const pledgePie: Slice[] = pledgeVerified
    ? [
        { name: "Pledged", displayName: "Pledged", value: Math.max(0, pledgeRate!), color: COLORS.Pledge },
        { name: "Not pledged", displayName: "Not pledged", value: Math.max(0, 100 - pledgeRate!), color: COLORS.Promoter },
      ]
    : [];

  const chart = (items: Slice[]) => (
    <div className="mx-auto h-56 w-full min-h-[14rem]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <PieChart>
          <Pie
            data={items}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={88}
            paddingAngle={2}
            isAnimationActive={false}
          >
            {items.map(item => (
              <Cell key={item.name} fill={item.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => moneyPercent(Number(value))} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );

  const legend = (items: Slice[]) => (
    <div className="grid grid-cols-2 gap-2">
      {items.map(item => (
        <div key={item.name} className="flex items-center gap-2 text-xs text-muted">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          <span>
            {item.displayName}: <strong className="tabular text-fg">{moneyPercent(item.value)}</strong>
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <Panel className="mt-3 space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-subtle">Shareholding · {displaySymbol(symbol)}</p>
          <h2 className="mt-1 text-lg font-semibold text-fg">{company}</h2>
          <p className="mt-1 text-xs text-muted">
            {quarters.length
              ? `${quarters.length} verified filings loaded · pick year & quarter below`
              : "No verified quarterly filing available"}
          </p>
        </div>
        <Link
          to="/shareholding"
          search={{ symbol }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs font-medium text-muted hover:text-fg"
        >
          Full analysis <ExternalLink className="size-3.5" />
        </Link>
      </div>

      {query.isLoading ? (
        <SkeletonBlock className="h-48" />
      ) : query.isError ? (
        <p className="text-sm text-muted">Shareholding data could not be loaded. Please retry.</p>
      ) : quarters.length === 0 ? (
        <p className="text-sm text-muted">No verified shareholding filings found for this symbol.</p>
      ) : (
        <>
          {/* Shareholding pattern */}
          <div className="rounded-xl bg-surface-2 p-3 sm:p-4">
            <h3 className="text-sm font-semibold text-fg">Shareholding pattern</h3>
            <p className="mt-1 text-xs text-muted">Promoter · FII · DII · Other Public</p>

            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-subtle">Year</span>
                {yearTabs.map(year => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setSelectedYear(year)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      activeYear === year ? "bg-accent text-white" : "bg-surface text-muted hover:text-fg"
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-subtle">Quarter</span>
                {[1, 2, 3, 4].map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setSelectedQuarter(q)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      activeQuarter === q ? "bg-surface-3 text-fg ring-1 ring-[var(--border)]" : "bg-surface text-muted hover:text-fg"
                    }`}
                  >
                    Q{q}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-muted">
                  {selectedQuarterData
                    ? `Filing · ${selectedQuarterData.asOnDate}`
                    : usingFallbackShare && shareSource
                      ? `Showing ${shareSource.asOnDate} (selected period empty)`
                      : "No filing this period"}
                </span>
              </div>
            </div>

            {sharePie.length ? (
              <>
                {chart(sharePie)}
                {legend(sharePie)}
                {usingFallbackShare && shareSource ? (
                  <p className="mt-2 text-[11px] leading-4 text-subtle">
                    Q{activeQuarter} {activeYear} has no complete pie. Showing latest usable filing ({shareSource.asOnDate}).
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-4 text-sm text-muted">
                No complete verified shareholding breakdown available for this symbol yet.
              </p>
            )}
          </div>

          {/* Promoter holding & pledge */}
          <div className="rounded-xl bg-surface-2 p-3 sm:p-4">
            <h3 className="text-sm font-semibold text-fg">Promoter holding & pledge</h3>
            <p className="mt-1 text-xs text-muted">Pledge as % of promoter shares only</p>

            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-subtle">Year</span>
                {yearTabs.map(year => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setPromoterYear(year)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      promoterActiveYear === year ? "bg-accent text-white" : "bg-surface text-muted hover:text-fg"
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-subtle">Quarter</span>
                {[1, 2, 3, 4].map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setPromoterQuarter(q)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      promoterActiveQuarter === q ? "bg-surface-3 text-fg ring-1 ring-[var(--border)]" : "bg-surface text-muted hover:text-fg"
                    }`}
                  >
                    Q{q}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-muted">
                  {promoterQuarterData || promoterPledgeQuarterData
                    ? `Filing · ${promoterPledgeQuarterData?.asOnDate ?? promoterQuarterData?.asOnDate}`
                    : "No filing this period"}
                </span>
              </div>
            </div>

            {holding != null ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Stat label="Promoter holding" value={moneyPercent(holding)} />
                <Stat label="Pledge % of promoter" value={pledgeRate != null ? moneyPercent(pledgeRate) : "Not verified"} />
              </div>
            ) : null}

            {pledgePie.length ? (
              <>
                {chart(pledgePie)}
                {legend(pledgePie)}
                {pledgeFallbackNote ? (
                  <p className="mt-2 text-[11px] leading-4 text-subtle">{pledgeFallbackNote}</p>
                ) : null}
              </>
            ) : (
              <p className="mt-4 text-sm text-muted">
                {holding != null
                  ? `Promoter holding ${moneyPercent(holding)} verified for Q${promoterActiveQuarter} ${promoterActiveYear}, but no verified pledge rate found.`
                  : `No verified promoter data for Q${promoterActiveQuarter} ${promoterActiveYear}.`}
              </p>
            )}
          </div>

          {query.data?.note ? <p className="text-xs text-subtle">{query.data.note}</p> : null}
        </>
      )}
    </Panel>
  );
}

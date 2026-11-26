import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSuggestedHoldings, fetchSuggestedHoldingsBatch } from "@/lib/market/suggested-holdings";
import { fetchHoldingsDrawdowns, type DrawdownRow } from "@/lib/market/drawdown";
import { Panel } from "@/components/widgets";

export const Route = createFileRoute("/portfolio")({ component: HoldingsPage });

type SortMode = "institutional" | "alphabetical";

function savedSuggestionFallback(): Array<{ symbol: string; name: string }> {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("artha.suggestions.cache") : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const rows = parsed.map((item: unknown) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { symbol?: unknown; name?: unknown };
      const symbol = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
      if (!symbol) return null;
      return { symbol, name: typeof row.name === "string" ? row.name : symbol };
    }).filter((item): item is { symbol: string; name: string } => !!item);
    return rows;
  } catch {
    return [];
  }
}

function percent(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}%`;
}

function publicResidual(q: { public: number | null; fii: number | null; dii: number | null } | null) {
  // Screener reports FIIs/DIIs separately from its non-institutional Public row.
  if (!q || q.public === null) return null;
  if (q.fii === null && q.dii === null) return q.public;
  const residual = q.public - ((q.fii ?? 0) + (q.dii ?? 0));
  return Number.isFinite(residual) ? residual : null;
}

function othersOutsidePublic(q: { promoter: number | null; fii: number | null; dii: number | null; public: number | null } | null) {
  // Screener reports FIIs, DIIs and non-institutional Public separately; the balance
  // is the Government/other category, and should not include promoter holdings.
  if (!q || q.promoter === null) return null;
  const used = (q.promoter ?? 0) + (q.fii ?? 0) + (q.dii ?? 0) + (q.public ?? 0);
  const residual = 100 - used;
  return Number.isFinite(residual) && residual > 0.05 ? residual : null;
}

function HoldingsPage() {
  const queryClient = useQueryClient();
  const [sortMode, setSortMode] = useState<SortMode>("institutional");
  const [drawdownBySymbol, setDrawdownBySymbol] = useState<Record<string, DrawdownRow>>({});
  const [search, setSearch] = useState("");
  const [hydrateKey, setHydrateKey] = useState(0);
  const [hydrating, setHydrating] = useState(false);
  const processedRef = useRef(false);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  const queryKey = ["suggested-holdings-all-v3", today];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        return await fetchSuggestedHoldings({ data: { refresh: false } });
      } catch {
        // The live NSE universe/provider can fail at the server boundary. Keep Holdings
        // usable from the Suggestions cache when available.
        const fallback = savedSuggestionFallback();
        // render the exact cached Suggestions symbols client-side so the page
        // remains usable and can still request each symbol's verified filing.
        const unique = new Map<string, { symbol: string; name: string }>();
        for (const item of fallback) {
          const symbol = item.symbol.trim().toUpperCase();
          if (symbol && !unique.has(symbol)) unique.set(symbol, { symbol, name: item.name || symbol });
        }
        const holdings = [...unique.values()].map((item) => ({
          ...item,
          quarter: null,
        }));
        return { holdings, checked: 0, unavailable: 0, totalSuggested: holdings.length };
      }
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    processedRef.current = false;
  }, [hydrateKey]);

  const data = query.data;
  useEffect(() => {
    if (!query.data || processedRef.current) return;
    processedRef.current = true;
    let completed = false;
    setHydrating(true);
    (async () => {
      const symbols = query.data!.holdings.map((item) => item.symbol);
      const resultsBySymbol = new Map<string, { quarter: typeof query.data.holdings[number]["quarter"]; note: string | null }>();

      const requestBatches: string[][] = [];
      for (let start = 0; start < symbols.length; start += 8) {
        requestBatches.push(symbols.slice(start, start + 8));
      }

      for (let i = 0; i < requestBatches.length; i += 2) {
        const group = requestBatches.slice(i, i + 2);
        const settled = await Promise.allSettled(group.map((batch) =>
          fetchSuggestedHoldingsBatch({ data: { symbols: batch, refresh: true } })
        ));
        for (let g = 0; g < settled.length; g++) {
          const outcome = settled[g];
          const batch = group[g];
          if (outcome.status === "fulfilled") {
            for (const item of outcome.value) {
              resultsBySymbol.set(item.symbol.toUpperCase(), { quarter: item.quarter, note: item.note });
            }
            const returned = new Set(outcome.value.map((item) => item.symbol.toUpperCase()));
            for (const symbol of batch) {
              if (!returned.has(symbol.toUpperCase())) {
                try {
                  const solo = await fetchSuggestedHoldingsBatch({ data: { symbols: [symbol], refresh: true } });
                  for (const item of solo) resultsBySymbol.set(item.symbol.toUpperCase(), { quarter: item.quarter, note: item.note });
                } catch {
                  resultsBySymbol.set(symbol.toUpperCase(), { quarter: null, note: "Shareholding provider request failed." });
                }
              }
            }
          } else {
            for (const symbol of batch) {
              try {
                const solo = await fetchSuggestedHoldingsBatch({ data: { symbols: [symbol], refresh: true } });
                for (const item of solo) resultsBySymbol.set(item.symbol.toUpperCase(), { quarter: item.quarter, note: item.note });
              } catch {
                resultsBySymbol.set(symbol.toUpperCase(), { quarter: null, note: "Shareholding provider request failed." });
              }
            }
          }
        }
      }

      const holdings = query.data!.holdings.map((holding) => {
        const hit = resultsBySymbol.get(holding.symbol.toUpperCase());
        return {
          ...holding,
          quarter: hit?.quarter ?? holding.quarter,
          note: hit?.note ?? null,
        };
      });
      const checked = holdings.length;
      const unavailable = holdings.filter((h) => !h.quarter).length;
      queryClient.setQueryData(queryKey, (previous: typeof query.data) => previous ? {
        ...previous,
        holdings,
        checked,
        unavailable,
        totalSuggested: holdings.length,
      } : previous);
      completed = true;
      setHydrating(false);
      if (!completed) processedRef.current = false;
    })();
  }, [query.data?.totalSuggested, query.data?.holdings.length, query.dataUpdatedAt, hydrateKey]);

  // 5Y high drawdown labels for each holdings card (price vs 5-year high).
  useEffect(() => {
    const holdings = query.data?.holdings ?? [];
    if (!holdings.length) {
      setDrawdownBySymbol({});
      return;
    }
    let cancelled = false;
    (async () => {
      const symbols = holdings.map((h) => h.symbol);
      const map: Record<string, DrawdownRow> = {};
      try {
        for (let start = 0; start < symbols.length; start += 40) {
          const batch = symbols.slice(start, start + 40);
          const rows = await fetchHoldingsDrawdowns({ data: { symbols: batch } });
          for (const row of rows) {
            const bare = row.symbol.toUpperCase().replace(/\.NS$/i, "").replace(/\.BO$/i, "");
            map[bare] = row;
            map[`${bare}.NS`] = row;
            map[row.symbol.toUpperCase()] = row;
          }
        }
      } catch {
        // Partial map is fine; cards without verified price/high stay without a label.
      }
      if (!cancelled) setDrawdownBySymbol(map);
    })();
    return () => { cancelled = true; };
  }, [query.data?.holdings]);

  const rows = useMemo(() => {
    if (!data?.holdings) return [];
    const q = search.trim().toLowerCase();
    let list = data.holdings;
    if (q) {
      list = list.filter((h) =>
        h.symbol.toLowerCase().includes(q) || (h.name || "").toLowerCase().includes(q),
      );
    }
    if (sortMode === "alphabetical") {
      return [...list].sort((a, b) => (a.name || a.symbol).localeCompare(b.name || b.symbol));
    }
    return [...list].sort((a, b) => {
      const sa = (a.quarter?.fii ?? -1) + (a.quarter?.dii ?? -1);
      const sb = (b.quarter?.fii ?? -1) + (b.quarter?.dii ?? -1);
      if (sb !== sa) return sb - sa;
      return (a.name || a.symbol).localeCompare(b.name || b.symbol);
    });
  }, [data?.holdings, search, sortMode]);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-subtle">Artha · Suggestion Box</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-fg">Holdings</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Suggested shares with latest verified institutional shareholding. Each card shows FII, DII and public categories from exchange filings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            processedRef.current = false;
            void queryClient.fetchQuery({ queryKey, queryFn: async () => fetchSuggestedHoldings({ data: { refresh: true } }) }).then(() => setHydrateKey((k) => k + 1));
          }}
          className="flex h-10 items-center gap-2 rounded-lg bg-surface-2 px-3 text-xs text-muted shadow-[var(--shadow-border)]"
          aria-label="Refresh holdings"
        >
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>

      {query.isLoading ? (
        <Panel className="p-6"><p className="text-sm text-muted">Loading suggested holdings…</p></Panel>
      ) : query.isError || !data ? (
        <Panel className="p-6"><p className="text-sm text-muted">Holdings data is temporarily unavailable.</p></Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Panel className="p-3"><p className="text-xs text-muted">Suggested shares</p><p className="mt-1 text-xl font-semibold tabular text-fg">{data.totalSuggested}</p></Panel>
            <Panel className="p-3"><p className="text-xs text-muted">Verified latest filing</p><p className="mt-1 text-xl font-semibold tabular text-fg">{hydrating ? "Checking…" : data.checked - data.unavailable}</p></Panel>
            <Panel className="col-span-2 p-3 sm:col-span-1"><p className="text-xs text-muted">Data unavailable</p><p className="mt-1 text-xl font-semibold tabular text-fg">{hydrating ? "Checking…" : data.unavailable}</p></Panel>
          </div>

          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company or symbol…"
                className="h-11 w-full rounded-xl bg-surface-2 pl-10 pr-4 text-sm text-fg shadow-[var(--shadow-border)] outline-none focus:ring-2 focus:ring-current/10" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex rounded-xl bg-surface-2 p-1 shadow-[var(--shadow-border)]">
                <button type="button" onClick={() => setSortMode("institutional")} aria-pressed={sortMode === "institutional"}
                  className={`rounded-lg px-3 py-2 text-xs font-medium ${sortMode === "institutional" ? "bg-surface text-fg shadow-sm" : "text-muted"}`}>FII + DII leaders</button>
                <button type="button" onClick={() => setSortMode("alphabetical")} aria-pressed={sortMode === "alphabetical"}
                  className={`rounded-lg px-3 py-2 text-xs font-medium ${sortMode === "alphabetical" ? "bg-surface text-fg shadow-sm" : "text-muted"}`}>A–Z alphabetical</button>
              </div>
              <span className="text-xs text-muted">{rows.length} shares · {sortMode === "alphabetical" ? "A–Z" : "highest institutional ownership first"}</span>
            </div>
          </div>

          {rows.length === 0 ? (
            <Panel className="mt-4 p-6 text-center"><p className="text-sm text-muted">No matching suggested shares.</p></Panel>
          ) : (
            <div className="mt-4 max-h-[68vh] space-y-3 overflow-y-auto overscroll-contain pr-1">
              {rows.map((share, index) => {
                const q = share.quarter;
                const publicValue = publicResidual(q);
                const others = othersOutsidePublic(q);
                const score = q?.fii !== null && q?.fii !== undefined && q?.dii !== null && q?.dii !== undefined
                  ? q.fii + q.dii : null;
                return (
                  <Panel key={share.symbol} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <span className="mt-0.5 w-7 shrink-0 text-xs tabular text-subtle">{index + 1}</span>
                        <div className="min-w-0">
                          <Link to="/shareholding" search={{ symbol: share.symbol }} className="text-left font-semibold text-fg hover:underline">{share.name}</Link>
                          <div className="mt-1 text-xs text-muted">{share.symbol}{q ? ` · ${q.quarter} · As on ${q.asOnDate}` : " · Filing unavailable"}</div>
                          {score !== null && <div className="mt-2 inline-flex items-center rounded-lg border border-up/30 bg-up/10 px-3 py-1.5 text-sm font-bold tabular text-up sm:text-base">FII + DII: {score.toFixed(2)}%</div>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {(() => {
                          const key = share.symbol.trim().toUpperCase();
                          const dd = drawdownBySymbol[key] ?? drawdownBySymbol[key.replace(/\.NS$|\.BO$/i, "")] ?? drawdownBySymbol[`${key.replace(/\.NS$|\.BO$/i, "")}.NS`];
                          const pct = dd?.downFrom5yHighPct;
                          if (pct == null || !Number.isFinite(pct)) return null;
                          return (
                            <span className="max-w-[9.5rem] text-right text-xs font-bold leading-tight tabular text-down sm:text-sm">
                              ↓ {pct.toFixed(2)}% FROM 5Y HIGH
                            </span>
                          );
                        })()}
                        {q?.sourceUrl && <a href={q.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open source filing for ${share.name}`}
                          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted hover:text-fg"><ExternalLink className="size-4" /></a>}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted">FII</div><div className="mt-1 text-base font-semibold tabular text-fg">{percent(q?.fii)}</div></div>
                      <div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted">DII</div><div className="mt-1 text-base font-semibold tabular text-fg">{percent(q?.dii)}</div></div>
                      <div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted">Public*</div><div className="mt-1 text-base font-semibold tabular text-fg">{percent(publicValue)}</div></div>
                      <div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted">Promoter</div><div className="mt-1 text-base font-semibold tabular text-fg">{percent(q?.promoter)}</div></div>
                    </div>
                    {others != null && (
                      <p className="mt-2 text-xs text-subtle">Others** {percent(others)}</p>
                    )}
                  </Panel>
                );
              })}
            </div>
          )}

          <p className="mt-5 text-xs text-subtle">* NSE Public is its aggregate public bucket less FII/DII; Screener.in Public is its separate non-institutional Public row. ** Others is the remaining source-reported balance. Categories are source-specific to avoid double counting. Latest disclosed quarterly data only; missing or inconsistent values show —, never estimated. Sorted by FII + DII percentage; A–Z mode is scrollable.</p>
        </>
      )}
    </div>
  );
}

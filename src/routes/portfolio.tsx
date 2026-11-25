import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSuggestedHoldings, fetchSuggestedHoldingsBatch } from "@/lib/market/suggested-holdings";
import { Panel } from "@/components/widgets";

export const Route = createFileRoute("/portfolio")({ component: HoldingsPage });

type SortMode = "institutional" | "alphabetical";
const SUGGESTIONS_STORAGE_KEYS = ["artha:suggestions:v13", "artha:suggestions:v12", "artha:suggestions:v11", "artha:suggestions:v10"];
function savedSuggestionFallback(): Array<{ symbol: string; name: string }> {
  if (typeof window === "undefined") return [];
  for (const key of SUGGESTIONS_STORAGE_KEYS) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
      if (!Array.isArray(parsed)) continue;
      const rows = parsed.map((item: unknown) => {
        if (!item || typeof item !== "object") return null;
        const row = item as { symbol?: unknown; name?: unknown };
        const symbol = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
        if (!symbol) return null;
        return { symbol, name: typeof row.name === "string" ? row.name : symbol };
      }).filter((item): item is { symbol: string; name: string } => !!item);
      if (rows.length) return rows;
    } catch { /* Try the older Suggestions cache key. */ }
  }
  return [];
}
function percent(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}%`;
}
function publicResidual(quarter: { public: number | null; fii: number | null; dii: number | null; sourceName: string } | null) {
  if (!quarter || quarter.public === null) return null;
  // Screener reports FIIs/DIIs separately from its non-institutional Public row.
  if (quarter.sourceName === "Screener.in") return quarter.public;
  if (quarter.fii === null || quarter.dii === null) return null;
  const value = quarter.public - quarter.fii - quarter.dii;
  return value >= -0.05 ? Math.max(0, value) : null;
}
function othersOutsidePublic(quarter: { public: number | null; promoter: number | null; fii: number | null; dii: number | null; sourceName: "NSE" | "Screener.in" } | null) {
  if (!quarter || quarter.public === null || quarter.promoter === null) return null;
  // On NSE, Public is the aggregate non-promoter block. "Others" is the remaining
  // government/other bucket after promoter and aggregate public are accounted for.
  if (quarter.sourceName === "NSE" || quarter.sourceName === "NSE XBRL historical dataset") {
    const value = 100 - quarter.promoter - quarter.public;
    return value >= -0.05 ? Math.max(0, value) : null;
  }
  // Screener reports FIIs, DIIs and non-institutional Public separately; the balance
  // is the Government/other category, and should not include promoter holdings.
  if (quarter.fii === null || quarter.dii === null) return null;
  const value = 100 - quarter.promoter - quarter.fii - quarter.dii - quarter.public;
  return value >= -0.05 ? Math.max(0, value) : null;
}

function HoldingsPage() {
  const queryClient = useQueryClient();
  const [sortMode, setSortMode] = useState<SortMode>("institutional");
  const [search, setSearch] = useState("");
  const [hydrateKey, setHydrateKey] = useState(0);
  const [hydrating, setHydrating] = useState(false);
  const processedRef = useRef(false);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const queryKey = ["suggested-holdings-all-v3", today];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      processedRef.current = false;
      const fallback = savedSuggestionFallback();
      try {
        return await fetchSuggestedHoldings({ data: { fallback } });
      } catch (error) {
        // If the server function itself fails (e.g. deployment/server boundary),
        // render the exact cached Suggestions symbols client-side so the page
        // remains usable and can still request each symbol's verified filing.
        if (!fallback.length) throw error;
        const unique = new Map<string, { symbol: string; name: string }>();
        for (const item of fallback) {
          const symbol = item.symbol.trim().toUpperCase();
          if (symbol && !unique.has(symbol)) unique.set(symbol, { symbol, name: item.name || symbol });
        }
        const holdings = [...unique.values()].map((item) => ({
          ...item, quarter: null, note: "Holdings list recovered from your saved current Suggestions list; checking verified filing data.",
        }));
        return { holdings, checked:  0, unavailable: 0, totalSuggested: holdings.length };
      }
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 6 * 60 * 60_000,
    retry: 1,
  });
  const data = query.data;
  useEffect(() => {
    if (!query.data || processedRef.current) return;
    processedRef.current = true;
    let cancelled = false;
    let completed = false;
    setHydrating(true);
    const hydrate = async () => {
      const symbols = query.data!.holdings.map((item) => item.symbol);
      const resultsBySymbol = new Map<string, { quarter: typeof query.data.holdings[number]["quarter"]; note: string | null }>();
      // Request the complete Suggestions universe in one hydration run. Each API
      // call is bounded, while several calls run together to avoid showing only
      // the first few companies as the final result.
      const requestBatches: string[][] = [];
      for (let start = 0; start < symbols.length; start += 8) {
        requestBatches.push(symbols.slice(start, start + 8));
      }
      const concurrency = 4;
      for (let start = 0; start < requestBatches.length; start += concurrency) {
        if (cancelled) return;
        const group = requestBatches.slice(start, start + concurrency);
        const settled = await Promise.allSettled(group.map((batch) =>
          fetchSuggestedHoldingsBatch({ data: { symbols: batch, refresh: true } })
        ));
        for (let i = 0; i < settled.length; i++) {
          if (cancelled) return;
          const batch = group[i];
          const outcome = settled[i];
          if (outcome.status === "fulfilled") {
            for (const item of outcome.value) {
              resultsBySymbol.set(item.symbol.toUpperCase(), { quarter: item.quarter, note: item.note });
            }
            // If a response unexpectedly omits a symbol, retry that symbol alone.
            const returned = new Set(outcome.value.map((item) => item.symbol.toUpperCase()));
            for (const symbol of batch.filter((s) => !returned.has(s.toUpperCase()))) {
              try {
                const single = await fetchSuggestedHoldingsBatch({ data: { symbols: [symbol], refresh: false } });
                const item = single[0];
                resultsBySymbol.set(symbol.toUpperCase(), { quarter: item?.quarter ?? null, note: item?.note ?? "No verified latest-quarter filing returned." });
              } catch {
                resultsBySymbol.set(symbol.toUpperCase(), { quarter: null, note: "Individual filing retry failed." });
              }
            }
          } else {
            // Recover a failed batch per company instead of discarding all rows.
            for (const symbol of batch) {
              try {
                const single = await fetchSuggestedHoldingsBatch({ data: { symbols: [symbol], refresh: false } });
                const item = single[0];
                resultsBySymbol.set(symbol.toUpperCase(), { quarter: item?.quarter ?? null, note: item?.note ?? "No verified latest-quarter filing returned." });
              } catch (error) {
                resultsBySymbol.set(symbol.toUpperCase(), { quarter: null, note: error instanceof Error ? error.message : "Individual filing retry failed." });
              }
            }
          }
        }
      }
      if (cancelled) return;
      const holdings = query.data!.holdings.map((holding) => {
        const result = resultsBySymbol.get(holding.symbol.toUpperCase());
        return result ? { ...holding, quarter: result.quarter, note: result.note } : {
          ...holding, quarter: null, note: "No verified latest-quarter filing returned."
        };
      });
      const unavailable = holdings.filter((item) => !item.quarter).length;
      // Publish the full set together so the page doesn't appear to contain only
      // the first 3 companies while the rest are still being fetched.
      queryClient.setQueryData(queryKey, (previous: typeof query.data) => previous ? {
        ...previous, checked: holdings.length, unavailable, holdings,
      } : previous);
      completed = true;
      setHydrating(false);
    };
    void hydrate();
    return () => {
      cancelled = true;
      // React StrictMode runs an effect setup/cleanup/setup cycle in development.
      // Reset the guard only when this hydration was cancelled before finishing,
      // otherwise the second setup skips hydration and leaves both counters at 0.
      if (!completed) processedRef.current = false;
    };
  }, [query.data?.totalSuggested, query.data?.holdings.length, query.dataUpdatedAt, hydrateKey]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = (data?.holdings ?? []).filter((share) =>
      !needle || share.name.toLowerCase().includes(needle) || share.symbol.toLowerCase().includes(needle)
    );
    if (sortMode === "alphabetical") return [...list].sort((a, b) => a.name.localeCompare(b.name) || a.symbol.localeCompare(b.symbol));
    return [...list].sort((a, b) => {
      const aScore = (a.quarter?.fii ?? 0) + (a.quarter?.dii ?? 0);
      const bScore = (b.quarter?.fii ?? 0) + (b.quarter?.dii ?? 0);
      return bScore - aScore || a.name.localeCompare(b.name);
    });
  }, [data?.holdings, search, sortMode]);

  const refresh = () => {
    processedRef.current = false;
    void queryClient.fetchQuery({
      queryKey,
      queryFn: () => fetchSuggestedHoldings({ data: { refresh: true, fallback: savedSuggestionFallback() } }),
      staleTime: 0,
    }).then(() => setHydrateKey((v) => v + 1));
  };

  return (
    <div className="mx-auto max-w-5xl pb-10">
      <header className="flex items-center justify-between gap-3 px-1 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-subtle">Artha scanner</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-fg">Holdings</h1>
          <p className="mt-2 text-sm text-muted">Every share in current Suggestions · highest FII + DII first</p>
        </div>
        <button type="button" onClick={refresh} disabled={query.isFetching}
          className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-surface-2 px-3 text-xs text-muted shadow-[var(--shadow-border)] disabled:opacity-60"
          aria-label="Refresh holdings">
          <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      {query.isLoading ? (
        <Panel className="mt-5 p-6"><p className="text-sm text-muted">Loading every suggested share and checking its latest disclosed shareholding…</p></Panel>
      ) : query.isError || !data ? (
        <Panel className="mt-5 p-6"><p className="text-sm text-muted">Holdings could not be loaded. Refresh to try again. No sample figures are shown.</p></Panel>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Panel className="p-3"><p className="text-xs text-muted">Suggestions shares</p><p className="mt-1 text-xl font-semibold tabular text-fg">{data.totalSuggested}</p></Panel>
            <Panel className="p-3"><p className="text-xs text-muted">Verified latest filing</p><p className="mt-1 text-xl font-semibold tabular text-fg">{hydrating ? "Checking…" : data.checked - data.unavailable}</p></Panel>
            <Panel className="col-span-2 p-3 sm:col-span-1"><p className="text-xs text-muted">Data unavailable</p><p className="mt-1 text-xl font-semibold tabular text-fg">{hydrating ? "Checking…" : data.unavailable}</p></Panel>
          </div>

          <div className="mt-4 space-y-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search company or symbol…"
                className="h-12 w-full rounded-xl bg-surface-2 pl-10 pr-4 text-sm text-fg shadow-[var(--shadow-border)] outline-none focus:ring-2 focus:ring-current/10" />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-xl bg-surface-2 p-1 shadow-[var(--shadow-border)]">
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
                      {q?.sourceUrl && <a href={q.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open source filing for ${share.name}`}
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted hover:text-fg"><ExternalLink className="size-4" /></a>}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted">FII</div><div className="mt-1 text-base font-semibold tabular text-fg">{percent(q?.fii)}</div></div>
                      <div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted">DII</div><div className="mt-1 text-base font-semibold tabular text-fg">{percent(q?.dii)}</div></div>
                      <div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted">Public*</div><div className="mt-1 text-base font-semibold tabular text-fg">{percent(publicValue)}</div></div>
                      <div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted">Others**</div><div className="mt-1 text-base font-semibold tabular text-fg">{percent(others)}</div></div>
                    </div>
                    <div className="mt-3 text-[11px] text-muted">
                      {q ? `Source: ${q.sourceName} · Latest available quarterly disclosure` : "Source: NSE / Screener.in · no verifiable latest-quarter values"}
                      {q?.sourceUrl && <> · <a href={q.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">Verify source</a></>}
                    </div>
                    {!q && share.note && <div className="mt-2 break-words text-[11px] text-muted">Diagnostic: {share.note}</div>}
                  </Panel>
                );
              })}
            </div>
          )}
        </>
      )}
      <p className="mt-5 text-xs text-subtle">* NSE Public is its aggregate public bucket less FII/DII; Screener.in Public is its separate non-institutional Public row. ** Others is the remaining source-reported balance. Categories are source-specific to avoid double counting. Latest disclosed quarterly data only; missing or inconsistent values show —, never estimated. Sorted by FII + DII percentage; A–Z mode is scrollable.</p>
    </div>
  );
}

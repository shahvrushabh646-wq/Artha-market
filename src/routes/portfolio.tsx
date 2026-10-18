import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BriefcaseBusiness, ExternalLink, RefreshCw } from "lucide-react";
import { fetchSuggestedHoldings } from "@/lib/market/suggested-holdings";
import { Panel } from "@/components/widgets";

export const Route = createFileRoute("/portfolio")({ component: HoldingsPage });

function HoldingsPage() {
  const queryClient = useQueryClient();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const queryKey = ["suggested-holdings-fii-dii-15", today];
  const query = useQuery({
    queryKey,
    queryFn: () => fetchSuggestedHoldings({ data: {} }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
  const data = query.data;

  return (
    <div className="mx-auto max-w-4xl pb-10">
      <header className="flex items-center justify-between gap-3 px-1 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-subtle">Artha scanner</p>
          <h1 className="mt-1 font-display text-3xl tracking-tight text-fg">Holdings</h1>
          <p className="mt-2 text-sm text-muted">Suggested shares where FII or DII ownership is at least 15%.</p>
        </div>
        <button type="button" onClick={() => void queryClient.fetchQuery({
          queryKey,
          queryFn: () => fetchSuggestedHoldings({ data: { refresh: true } }),
          staleTime: 0,
        })} disabled={query.isFetching}
          className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-surface-2 px-3 text-xs text-muted shadow-[var(--shadow-border)] disabled:opacity-60"
          aria-label="Refresh holdings">
          <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      {query.isLoading ? (
        <Panel className="mt-5 p-6"><p className="text-sm text-muted">Checking current suggested shares against the latest available shareholding disclosures…</p></Panel>
      ) : query.isError ? (
        <Panel className="mt-5 p-6"><p className="text-sm text-muted">Suggested holdings could not be loaded. Refresh to try again. No sample data is shown.</p></Panel>
      ) : data && data.qualifying.length === 0 ? (
        <Panel className="mt-5 p-8 text-center">
          <BriefcaseBusiness className="mx-auto size-8 text-muted" />
          <h2 className="mt-3 text-base font-semibold text-fg">No qualifying suggested shares</h2>
          <p className="mt-2 text-sm text-muted">Screened {data.checked} of {data.totalSuggested} suggested shares. {data.unavailable} had unavailable or unverified ownership data.</p>
        </Panel>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
            <span>{data?.qualifying.length ?? 0} qualifying shares</span>
            <span>{data?.checked ?? 0} of {data?.totalSuggested ?? 0} suggested shares screened</span>
          </div>
          <div className="mt-3 space-y-3">
            {data?.qualifying.map((share) => (
              <Panel key={share.symbol} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to="/stock" search={{ symbol: share.symbol, period: "1Y" }} className="font-semibold text-fg hover:underline">{share.name}</Link>
                    <div className="mt-1 text-xs text-muted">{share.symbol} · {share.quarter.quarter} · As on {share.quarter.asOnDate}</div>
                  </div>
                  <a href={share.quarter.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open source filing for ${share.name}`}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted hover:text-fg">
                    <ExternalLink className="size-4" />
                  </a>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-surface-2 p-3">
                    <div className="text-xs text-muted">FII holding</div>
                    <div className="mt-1 text-lg font-semibold tabular text-fg">{share.fii === null ? "Unavailable" : `${share.fii.toFixed(2)}%`}</div>
                  </div>
                  <div className="rounded-lg bg-surface-2 p-3">
                    <div className="text-xs text-muted">DII holding</div>
                    <div className="mt-1 text-lg font-semibold tabular text-fg">{share.dii === null ? "Unavailable" : `${share.dii.toFixed(2)}%`}</div>
                  </div>
                </div>
                <div className="mt-3 inline-flex rounded-full bg-up/10 px-3 py-1.5 text-xs font-semibold text-up">{share.reason}</div>
                <div className="mt-3 text-[11px] text-muted">Source: NSE shareholding disclosure · <a href={share.quarter.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">Verify filing</a></div>
              </Panel>
            ))}
          </div>
          {!!data?.unavailable && <p className="mt-4 text-xs text-muted">{data.unavailable} suggested share(s) had unavailable or unverified FII/DII data and were not classified.</p>}
        </>
      )}
      <p className="mt-5 text-xs text-subtle">This screen filters only shares from the current Suggestions source. Ownership data is from the latest published disclosure that the app can verify; it is not a live market quote or a guarantee of performance.</p>
    </div>
  );
}

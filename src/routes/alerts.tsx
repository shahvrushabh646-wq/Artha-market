import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, Panel, Section } from "@/components/widgets";
import { displaySymbol, normalizeSymbol } from "@/lib/market/config";
import { fmtCurrency, fmtDate } from "@/lib/market/math";
import { fetchQuotes } from "@/lib/market/server";
import { useDesk } from "@/lib/store";

export const Route = createFileRoute("/alerts")({ component: AlertsPage });

function AlertsPage() {
  const alerts = useDesk((s) => s.alerts);
  const addAlert = useDesk((s) => s.addAlert);
  const deleteAlert = useDesk((s) => s.deleteAlert);
  const markTriggered = useDesk((s) => s.markTriggered);
  const [symbol, setSymbol] = useState("");
  const [target, setTarget] = useState("");
  const [cond, setCond] = useState<">=" | "<=">(">=");
  const [checking, setChecking] = useState(false);

  const active = alerts.filter((a) => a.status === "ACTIVE");
  const triggered = alerts.filter((a) => a.status === "TRIGGERED");
  const symbols = [...new Set(alerts.map((a) => a.symbol))];
  const quotes = useQuery({
    queryKey: ["quotes", symbols],
    queryFn: () => fetchQuotes({ data: { symbols } }),
    enabled: symbols.length > 0,
  });
  const bySym = new Map((quotes.data ?? []).map((q) => [q.symbol, q]));

  const checkNow = async () => {
    setChecking(true);
    try {
      const live = await fetchQuotes({ data: { symbols: active.map((a) => a.symbol) } });
      const map = new Map(live.map((q) => [q.symbol, q]));
      const hit: string[] = [];
      for (const a of active) {
        const price = map.get(a.symbol)?.price;
        if (price == null) continue;
        const crossed = a.condition === ">=" ? price >= a.targetPrice : price <= a.targetPrice;
        if (crossed) hit.push(a.id);
      }
      markTriggered(hit);
      if (hit.length) toast(`${hit.length} alert${hit.length > 1 ? "s" : ""} triggered`);
      else toast("No alerts triggered");
    } catch {
      toast("Could not check prices");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Alerts</h1>
      <p className="mt-1 text-sm text-muted">Checked on demand against live prices. No push notifications.</p>

      <Panel className="mt-5">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              addAlert({
                symbol: normalizeSymbol(symbol),
                targetPrice: Number(target),
                condition: cond,
              });
              setSymbol("");
              setTarget("");
              toast("Alert created");
            } catch (err) {
              toast(err instanceof Error ? err.message : "Could not create alert");
            }
          }}
        >
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Symbol"
            required
            autoCapitalize="characters"
          />
          <div className="grid grid-cols-[7rem_1fr] gap-2">
            <select
              value={cond}
              onChange={(e) => setCond(e.target.value as ">=" | "<=")}
              className="h-11 rounded-lg bg-surface-2 px-2 text-sm text-fg shadow-[var(--shadow-border)]"
            >
              <option value=">=">Price ≥</option>
              <option value="<=">Price ≤</option>
            </select>
            <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target" required />
          </div>
          <Button type="submit" className="w-full">
            Create alert
          </Button>
        </form>
      </Panel>

      <div className="mt-4">
        <Button variant="secondary" className="w-full" disabled={checking || active.length === 0} onClick={() => void checkNow()}>
          {checking ? "Checking…" : "Check alerts now"}
        </Button>
      </div>

      <Section title="Active">
        {active.length === 0 ? (
          <Empty title="No active alerts" body="Set a price target, then check whenever you open the desk." />
        ) : (
          <div className="space-y-2">
            {active.map((a) => (
              <Panel key={a.id} className="flex items-center justify-between gap-3 p-3">
                <Link to="/stock" search={{ symbol: a.symbol, period: "1Y" }} className="min-w-0">
                  <div className="font-medium text-fg">{displaySymbol(a.symbol)}</div>
                  <div className="text-xs text-muted">
                    {a.condition === ">=" ? "≥" : "≤"} {fmtCurrency(a.targetPrice)} · last{" "}
                    {fmtCurrency(bySym.get(a.symbol)?.price ?? null)}
                  </div>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => deleteAlert(a.id)}>
                  Delete
                </Button>
              </Panel>
            ))}
          </div>
        )}
      </Section>

      <Section title="Triggered">
        {triggered.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <div className="space-y-2">
            {triggered.map((a) => (
              <Panel key={a.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <div className="font-medium text-fg">{displaySymbol(a.symbol)}</div>
                  <div className="text-xs text-muted">
                    {a.condition} {fmtCurrency(a.targetPrice)}
                    {a.triggeredAt ? ` · ${fmtDate(Math.floor(new Date(a.triggeredAt).getTime() / 1000))}` : ""}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteAlert(a.id)}>
                  Clear
                </Button>
              </Panel>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

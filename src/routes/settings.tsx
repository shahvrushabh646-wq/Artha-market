import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Panel, Section, Stat } from "@/components/widgets";
import { APP_NAME, APP_TAGLINE, DISCLAIMER } from "@/lib/market/config";
import { useDesk } from "@/lib/store";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  const clearHoldings = useDesk((s) => s.clearHoldings);
  const clearWatch = useDesk((s) => s.clearWatch);
  const clearAlerts = useDesk((s) => s.clearAlerts);
  const [confirm, setConfirm] = useState<"book" | "watch" | "alerts" | null>(null);

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">{APP_TAGLINE}</p>

      <Section title="On this phone">
        <Panel>
          <p className="text-sm leading-relaxed text-muted">
            Add {APP_NAME} to your home screen from the browser menu (Chrome: Add to Home screen). It works offline for
            your book, watchlist and alerts; quotes need a connection.
          </p>
        </Panel>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Currency" value="INR ₹" />
          <Stat label="Exchange" value="NSE" />
          <Stat label="Chart" value="1Y" />
        </div>
      </Section>

      <Section title="Data" hint="These deletes cannot be undone">
        <div className="grid gap-2 sm:grid-cols-3">
          <Danger
            label="Clear portfolio"
            confirm={confirm === "book"}
            onAsk={() => setConfirm("book")}
            onYes={() => {
              clearHoldings();
              setConfirm(null);
              toast("Portfolio cleared");
            }}
            onNo={() => setConfirm(null)}
          />
          <Danger
            label="Clear watchlist"
            confirm={confirm === "watch"}
            onAsk={() => setConfirm("watch")}
            onYes={() => {
              clearWatch();
              setConfirm(null);
              toast("Watchlist cleared");
            }}
            onNo={() => setConfirm(null)}
          />
          <Danger
            label="Clear alerts"
            confirm={confirm === "alerts"}
            onAsk={() => setConfirm("alerts")}
            onYes={() => {
              clearAlerts();
              setConfirm(null);
              toast("Alerts cleared");
            }}
            onNo={() => setConfirm(null)}
          />
        </div>
      </Section>

      <Section title="About">
        <Panel>
          <p className="text-sm leading-relaxed text-muted">
            {APP_NAME} is a local Indian-market desk: NIFTY overview, stock search, candlesticks, RSI and moving
            averages, a user-defined valuation rule, a transparent 0–100 score, portfolio P/L, watchlist and on-demand
            price alerts.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">{DISCLAIMER}</p>
        </Panel>
      </Section>
    </div>
  );
}

function Danger({
  label,
  confirm,
  onAsk,
  onYes,
  onNo,
}: {
  label: string;
  confirm: boolean;
  onAsk: () => void;
  onYes: () => void;
  onNo: () => void;
}) {
  if (confirm) {
    return (
      <Panel className="p-3">
        <p className="text-sm text-fg">Delete everything here?</p>
        <div className="mt-3 flex gap-2">
          <Button variant="danger" size="sm" className="flex-1" onClick={onYes}>
            Yes
          </Button>
          <Button variant="secondary" size="sm" className="flex-1" onClick={onNo}>
            No
          </Button>
        </div>
      </Panel>
    );
  }
  return (
    <Button variant="secondary" className="h-12 w-full" onClick={onAsk}>
      {label}
    </Button>
  );
}

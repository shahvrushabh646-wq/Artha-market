import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, Panel, Section, Stat } from "@/components/widgets";
import { Signed } from "@/components/price";
import { displaySymbol, normalizeSymbol } from "@/lib/market/config";
import { fmtCurrency, fmtPercent } from "@/lib/market/math";
import { fetchQuotes } from "@/lib/market/server";
import { useDesk, type Holding } from "@/lib/store";

export const Route = createFileRoute("/portfolio")({ component: PortfolioPage });

function PortfolioPage() {
  const holdings = useDesk((s) => s.holdings);
  const addHolding = useDesk((s) => s.addHolding);
  const updateHolding = useDesk((s) => s.updateHolding);
  const deleteHolding = useDesk((s) => s.deleteHolding);
  const symbols = holdings.map((h) => h.symbol);
  const quotes = useQuery({
    queryKey: ["quotes", symbols],
    queryFn: () => fetchQuotes({ data: { symbols } }),
    enabled: symbols.length > 0,
    refetchInterval: 60_000,
  });
  const bySym = new Map((quotes.data ?? []).map((q) => [q.symbol, q]));

  const rows = holdings.map((h) => {
    const q = bySym.get(h.symbol);
    const invested = h.quantity * h.buyPrice;
    const price = q?.price ?? null;
    const current = price != null ? h.quantity * price : null;
    const pl = current != null ? current - invested : null;
    const plPct = pl != null && invested ? (pl / invested) * 100 : null;
    return { h, invested, price, current, pl, plPct, name: q?.name ?? h.company };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.invested += r.invested;
      if (r.current != null) acc.current += r.current;
      return acc;
    },
    { invested: 0, current: 0 },
  );
  const totalPl = rows.some((r) => r.current != null) ? totals.current - totals.invested : null;
  const totalPct = totalPl != null && totals.invested ? (totalPl / totals.invested) * 100 : null;
  const ranked = rows.filter((r) => r.plPct != null);
  const best = ranked.reduce<(typeof rows)[0] | null>((a, r) => (!a || (r.plPct ?? 0) > (a.plPct ?? 0) ? r : a), null);
  const worst = ranked.reduce<(typeof rows)[0] | null>((a, r) => (!a || (r.plPct ?? 0) < (a.plPct ?? 0) ? r : a), null);

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Holding | null>(null);

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Portfolio</h1>
      <p className="mt-1 text-sm text-muted">Holdings stay on this phone. Nothing is uploaded.</p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Stat label="Invested" value={fmtCurrency(totals.invested)} />
        <Stat label="Current" value={fmtCurrency(rows.length ? totals.current : null)} />
        <Stat label="P/L" value={<Signed value={totalPl} as="currency" className="text-base" />} />
        <Stat label="Return" value={<Signed value={totalPct} as="percent" className="text-base" />} />
      </div>

      <div className="mt-4">
        <Button className="w-full" onClick={() => setOpen((v) => !v)}>
          {open ? "Close form" : "Add holding"}
        </Button>
      </div>
      {open ? (
        <HoldingForm
          onSubmit={(h) => {
            try {
              addHolding(h);
              setOpen(false);
              toast(`Added ${displaySymbol(h.symbol)}`);
            } catch (err) {
              toast(err instanceof Error ? err.message : "Could not add");
            }
          }}
        />
      ) : null}

      <Section title="Holdings">
        {rows.length === 0 ? (
          <Empty title="No holdings yet" body="Add a buy — quantity and price must both be greater than zero." />
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Panel key={r.h.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to="/stock"
                    search={{ symbol: r.h.symbol, period: "1Y" }}
                    className="min-w-0"
                  >
                    <div className="font-medium text-fg">{displaySymbol(r.h.symbol)}</div>
                    <div className="truncate text-xs text-muted">{r.name}</div>
                  </Link>
                  <Signed value={r.plPct} as="percent" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-4">
                  <span>
                    Qty <span className="tabular text-fg">{r.h.quantity}</span>
                  </span>
                  <span>
                    Avg <span className="tabular text-fg">{fmtCurrency(r.h.buyPrice)}</span>
                  </span>
                  <span>
                    Last <span className="tabular text-fg">{fmtCurrency(r.price)}</span>
                  </span>
                  <span>
                    P/L <Signed value={r.pl} as="currency" className="text-xs" />
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" size="sm" className="h-10 flex-1" onClick={() => setEdit(r.h)}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="h-10 flex-1"
                    onClick={() => {
                      deleteHolding(r.h.id);
                      toast("Holding removed");
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </Section>

      {best && worst && best.h.id !== worst.h.id ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Panel>
            <div className="text-[11px] uppercase tracking-[0.14em] text-up">Best</div>
            <div className="mt-1 text-sm text-fg">
              {displaySymbol(best.h.symbol)} · <Signed value={best.plPct} as="percent" />
            </div>
          </Panel>
          <Panel>
            <div className="text-[11px] uppercase tracking-[0.14em] text-down">Worst</div>
            <div className="mt-1 text-sm text-fg">
              {displaySymbol(worst.h.symbol)} · <Signed value={worst.plPct} as="percent" />
            </div>
          </Panel>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <Section title="Allocation" hint="By amount invested">
          <Panel className="space-y-3">
            {rows.map((r) => {
              const pct = totals.invested ? (r.invested / totals.invested) * 100 : 0;
              return (
                <div key={r.h.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-fg">{displaySymbol(r.h.symbol)}</span>
                    <span className="tabular text-muted">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </Panel>
        </Section>
      ) : null}

      {edit ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
          <Panel className="w-full max-w-md p-4">
            <h2 className="font-display text-xl">Edit {displaySymbol(edit.symbol)}</h2>
            <HoldingForm
              initial={edit}
              submitLabel="Save"
              onSubmit={(h) => {
                try {
                  updateHolding(edit.id, {
                    quantity: h.quantity,
                    buyPrice: h.buyPrice,
                    buyDate: h.buyDate,
                    notes: h.notes,
                    company: h.company,
                  });
                  setEdit(null);
                  toast("Holding updated");
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Could not save");
                }
              }}
            />
            <Button variant="ghost" className="mt-2 w-full" onClick={() => setEdit(null)}>
              Cancel
            </Button>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function HoldingForm({
  initial,
  submitLabel = "Add holding",
  onSubmit,
}: {
  initial?: Holding;
  submitLabel?: string;
  onSubmit: (h: Omit<Holding, "id">) => void;
}) {
  const [symbol, setSymbol] = useState(initial ? displaySymbol(initial.symbol) : "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [qty, setQty] = useState(initial ? String(initial.quantity) : "");
  const [price, setPrice] = useState(initial ? String(initial.buyPrice) : "");
  const [date, setDate] = useState(initial?.buyDate ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          symbol: normalizeSymbol(symbol),
          company: company || normalizeSymbol(symbol),
          quantity: Number(qty),
          buyPrice: Number(price),
          buyDate: date,
          notes,
        });
      }}
    >
      <Input
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        placeholder="Symbol (RELIANCE)"
        required
        disabled={!!initial}
        autoCapitalize="characters"
      />
      <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" />
      <div className="grid grid-cols-2 gap-2">
        <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantity" required />
        <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Buy price" required />
      </div>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
      <Button type="submit" className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}

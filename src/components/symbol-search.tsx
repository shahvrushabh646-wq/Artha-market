import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { POPULAR, displaySymbol, normalizeSymbol } from "@/lib/market/config";
import { searchSymbols } from "@/lib/market/server";
import { useDesk } from "@/lib/store";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function SymbolSearch({ initial = "" }: { initial?: string }) {
  const navigate = useNavigate();
  const setLast = useDesk((s) => s.setLastSymbol);
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const search = useQuery({
    queryKey: ["search", q],
    queryFn: () => searchSymbols({ data: { q } }),
    enabled: q.trim().length >= 2,
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (symbol: string) => {
    const s = normalizeSymbol(symbol);
    setLast(s);
    setOpen(false);
    void navigate({ to: "/stock", search: { symbol: s, period: "1Y" } });
  };

  return (
    <div ref={box} className="relative">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go(q);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="RELIANCE, TCS, INFY…"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="pl-10"
            aria-label="Search stock symbol"
          />
        </div>
        <Button type="submit" className="shrink-0">
          Open
        </Button>
      </form>
      {open && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl bg-surface-2 shadow-[var(--shadow-border)]">
          {search.data && search.data.length > 0 ? (
            <ul>
              {search.data.map((hit) => (
                <li key={hit.symbol}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-surface-3"
                    onClick={() => go(hit.symbol)}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-fg">{hit.name}</span>
                      <span className="block text-xs text-muted">{hit.symbol}</span>
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-subtle">{hit.exchange}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-1.5 p-3">
              {POPULAR.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => go(s)}
                  className="rounded-full bg-surface px-3 py-1.5 text-xs text-muted hover:text-fg"
                >
                  {displaySymbol(s)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

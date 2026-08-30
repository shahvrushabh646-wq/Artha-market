import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { POPULAR, displaySymbol, normalizeSymbol } from "@/lib/market/config";
import { searchSymbols } from "@/lib/market/server";
import { useDesk } from "@/lib/store";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const LOCAL_ALIASES = [
  { keys: ["INDIAN INFOTECH", "INDIAN INFOTECH AND SOFTWARE", "INDIAN INFOTECH & SOFTWARE", "INDINFO", "509051"], symbol: "509051.BO", name: "Indian Infotech & Software Ltd.", exchange: "BSE" },
];

function localSearch(query: string) {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return LOCAL_ALIASES.filter((item) => item.keys.some((key) => key.includes(q) || q.includes(key))).map(({ symbol, name, exchange }) => ({ symbol, name, exchange }));
}

export function SymbolSearch({ initial = "" }: { initial?: string }) {
  const navigate = useNavigate();
  const setLast = useDesk((s) => s.setLastSymbol);
  const [q, setQ] = useState(initial);
  const [searchQ, setSearchQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const localHits = localSearch(q);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQ(q.trim()), 100);
    return () => window.clearTimeout(timer);
  }, [q]);

  const search = useQuery({
    queryKey: ["search", searchQ.toUpperCase()],
    queryFn: () => searchSymbols({ data: { q: searchQ } }),
    enabled: searchQ.length >= 2 && localHits.length === 0,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const resolveSymbol = (value: string) => {
    const upper = value.trim().toUpperCase();
    const alias = LOCAL_ALIASES.find((item) => item.keys.some((key) => key === upper));
    return alias?.symbol ?? normalizeSymbol(value);
  };

  const go = (symbol: string) => {
    const s = resolveSymbol(symbol);
    setLast(s);
    setOpen(false);
    void navigate({ to: "/stock", search: { symbol: s, period: "1Y" } });
  };

  const results = localHits.length ? localHits : search.data ?? [];

  return (
    <div ref={box} className="relative">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) go(q); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="RELIANCE, TCS, INFY…" autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="search" className="pl-10" aria-label="Search stock symbol" />
        </div>
        <Button type="submit" className="shrink-0">Open</Button>
      </form>
      {open && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl bg-surface-2 shadow-[var(--shadow-border)]">
          {results.length > 0 ? (
            <ul>
              {results.map((hit) => (
                <li key={hit.symbol}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-surface-3" onClick={() => go(hit.symbol)}>
                    <span className="min-w-0">
                      <span className="block text-sm text-fg">{hit.name}</span>
                      <span className="block text-xs text-muted">{hit.symbol}</span>
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-subtle">{hit.exchange}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : search.isFetching ? (
            <div className="px-3 py-3 text-sm text-muted">Searching…</div>
          ) : (
            <div className="flex flex-wrap gap-1.5 p-3">
              {POPULAR.map((s) => <button key={s} type="button" onClick={() => go(s)} className="rounded-full bg-surface px-3 py-1.5 text-xs text-muted hover:text-fg">{displaySymbol(s)}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_WATCHLIST, normalizeSymbol } from "@/lib/market/config";

export type Holding = { id: string; symbol: string; company: string; quantity: number; buyPrice: number; buyDate: string; notes: string };
export type AlertItem = { id: string; symbol: string; targetPrice: number; condition: ">=" | "<="; status: "ACTIVE" | "TRIGGERED"; createdAt: string; triggeredAt: string | null };
export type RuleAlert = { symbol: string; rule: "75" | "90"; firstActiveDay: string; lastActiveDay: string; dayNumber: number; sentSlots: string[] };

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function previousTradingDay(date: string) { const d = new Date(`${date}T12:00:00+05:30`); d.setDate(d.getDate() - 1); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d); }

const WATCHLIST_VAULT_KEY = "artha-permanent-watchlist-v1";
function readWatchlistVault(): string[] | null {
  if (typeof window === "undefined") return null;
  try { const raw = localStorage.getItem(WATCHLIST_VAULT_KEY); if (!raw) return null; const parsed = JSON.parse(raw); return Array.isArray(parsed) ? Array.from(new Set(parsed.map(normalizeSymbol).filter(Boolean))) : null; } catch { return null; }
}
function writeWatchlistVault(list: string[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(WATCHLIST_VAULT_KEY, JSON.stringify(Array.from(new Set(list.map(normalizeSymbol).filter(Boolean))))); } catch {}
}

// The watchlist is deliberately kept in a separate, version-independent browser vault.
// This means changing the app build/version cannot replace the user's saved stocks with defaults.
const initialWatchlist = readWatchlistVault() ?? DEFAULT_WATCHLIST;
if (typeof window !== "undefined" && readWatchlistVault() === null) writeWatchlistVault(initialWatchlist);

type DeskState = {
  watchlist: string[]; holdings: Holding[]; alerts: AlertItem[]; ruleAlerts: RuleAlert[]; lastSymbol: string;
  addWatch: (symbol: string) => boolean; removeWatch: (symbol: string) => void; clearWatch: () => void;
  addHolding: (h: Omit<Holding, "id">) => void; updateHolding: (id: string, patch: Partial<Omit<Holding, "id" | "symbol">>) => void; deleteHolding: (id: string) => void; clearHoldings: () => void;
  addAlert: (a: Omit<AlertItem, "id" | "status" | "createdAt" | "triggeredAt">) => void; deleteAlert: (id: string) => void; clearAlerts: () => void; markTriggered: (ids: string[]) => void;
  touchRuleAlert: (symbol: string, rule: RuleAlert["rule"], day: string) => RuleAlert; markRuleAlertSlot: (symbol: string, rule: RuleAlert["rule"], slot: string) => void; setLastSymbol: (symbol: string) => void;
};

export const useDesk = create<DeskState>()(
  persist(
    (set, get) => ({
      watchlist: initialWatchlist, holdings: [], alerts: [], ruleAlerts: [], lastSymbol: "RELIANCE.NS",
      addWatch: (symbol) => { const s = normalizeSymbol(symbol); if (!s || get().watchlist.includes(s)) return false; const next = [s, ...get().watchlist]; writeWatchlistVault(next); set({ watchlist: next }); return true; },
      removeWatch: (symbol) => { const next = get().watchlist.filter((x) => x !== symbol); writeWatchlistVault(next); set({ watchlist: next }); },
      clearWatch: () => { writeWatchlistVault([]); set({ watchlist: [] }); },
      addHolding: (h) => { if (h.quantity <= 0) throw new Error("Quantity must be greater than 0"); if (h.buyPrice <= 0) throw new Error("Buy price must be greater than 0"); set({ holdings: [{ ...h, id: uid(), symbol: normalizeSymbol(h.symbol) }, ...get().holdings] }); },
      updateHolding: (id, patch) => { if (patch.quantity != null && patch.quantity <= 0) throw new Error("Quantity must be greater than 0"); if (patch.buyPrice != null && patch.buyPrice <= 0) throw new Error("Buy price must be greater than 0"); set({ holdings: get().holdings.map((h) => h.id === id ? { ...h, ...patch } : h) }); },
      deleteHolding: (id) => set({ holdings: get().holdings.filter((h) => h.id !== id) }), clearHoldings: () => set({ holdings: [] }),
      addAlert: (a) => { if (a.targetPrice <= 0) throw new Error("Target price must be greater than 0"); set({ alerts: [{ ...a, id: uid(), symbol: normalizeSymbol(a.symbol), status: "ACTIVE", createdAt: new Date().toISOString(), triggeredAt: null }, ...get().alerts] }); },
      deleteAlert: (id) => set({ alerts: get().alerts.filter((a) => a.id !== id) }), clearAlerts: () => set({ alerts: [] }),
      markTriggered: (ids) => { const now = new Date().toISOString(); set({ alerts: get().alerts.map((a) => ids.includes(a.id) && a.status === "ACTIVE" ? { ...a, status: "TRIGGERED", triggeredAt: now } : a) }); },
      touchRuleAlert: (symbol, rule, day) => { const existing = get().ruleAlerts.find((x) => x.symbol === symbol && x.rule === rule); if (existing?.lastActiveDay === day) return existing; const continued = existing?.lastActiveDay === previousTradingDay(day); const next: RuleAlert = existing && continued ? { ...existing, lastActiveDay: day, dayNumber: Math.min(3, existing.dayNumber + 1), sentSlots: existing.sentSlots.filter((x) => x.startsWith(`${day}:`)) } : { symbol, rule, firstActiveDay: day, lastActiveDay: day, dayNumber: 1, sentSlots: [] }; set({ ruleAlerts: [...get().ruleAlerts.filter((x) => !(x.symbol === symbol && x.rule === rule)), next] }); return next; },
      markRuleAlertSlot: (symbol, rule, slot) => set({ ruleAlerts: get().ruleAlerts.map((x) => x.symbol === symbol && x.rule === rule && !x.sentSlots.includes(slot) ? { ...x, sentSlots: [...x.sentSlots, slot] } : x) }),
      setLastSymbol: (symbol) => set({ lastSymbol: normalizeSymbol(symbol) }),
    }),
    {
      name: "artha-desk", version: 5, storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<DeskState> | undefined;
        const vault = readWatchlistVault();
        const savedWatchlist = vault ?? (Array.isArray(persisted?.watchlist) ? persisted.watchlist.map(normalizeSymbol).filter(Boolean) : currentState.watchlist);
        if (vault === null) writeWatchlistVault(savedWatchlist);
        return { ...currentState, ...persisted, watchlist: Array.from(new Set(savedWatchlist)), ruleAlerts: Array.isArray(persisted?.ruleAlerts) ? persisted.ruleAlerts : [] };
      },
      migrate: (persistedState) => persistedState as DeskState,
      partialize: (state) => ({ ...state, watchlist: state.watchlist }),
    },
  ),
);

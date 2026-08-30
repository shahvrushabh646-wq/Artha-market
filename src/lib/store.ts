import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_WATCHLIST, normalizeSymbol } from "@/lib/market/config";

export type Holding = {
  id: string;
  symbol: string;
  company: string;
  quantity: number;
  buyPrice: number;
  buyDate: string;
  notes: string;
};

export type AlertItem = {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: ">=" | "<=";
  status: "ACTIVE" | "TRIGGERED";
  createdAt: string;
  triggeredAt: string | null;
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type DeskState = {
  watchlist: string[];
  holdings: Holding[];
  alerts: AlertItem[];
  lastSymbol: string;
  addWatch: (symbol: string) => boolean;
  removeWatch: (symbol: string) => void;
  clearWatch: () => void;
  addHolding: (h: Omit<Holding, "id">) => void;
  updateHolding: (id: string, patch: Partial<Omit<Holding, "id" | "symbol">>) => void;
  deleteHolding: (id: string) => void;
  clearHoldings: () => void;
  addAlert: (a: Omit<AlertItem, "id" | "status" | "createdAt" | "triggeredAt">) => void;
  deleteAlert: (id: string) => void;
  clearAlerts: () => void;
  markTriggered: (ids: string[]) => void;
  setLastSymbol: (symbol: string) => void;
};

export const useDesk = create<DeskState>()(
  persist(
    (set, get) => ({
      watchlist: DEFAULT_WATCHLIST,
      holdings: [],
      alerts: [],
      lastSymbol: "RELIANCE.NS",
      addWatch: (symbol) => {
        const s = normalizeSymbol(symbol);
        if (!s) return false;
        if (get().watchlist.includes(s)) return false;
        set({ watchlist: [s, ...get().watchlist] });
        return true;
      },
      removeWatch: (symbol) => set({ watchlist: get().watchlist.filter((x) => x !== symbol) }),
      clearWatch: () => set({ watchlist: [] }),
      addHolding: (h) => {
        if (h.quantity <= 0) throw new Error("Quantity must be greater than 0");
        if (h.buyPrice <= 0) throw new Error("Buy price must be greater than 0");
        set({ holdings: [{ ...h, id: uid(), symbol: normalizeSymbol(h.symbol) }, ...get().holdings] });
      },
      updateHolding: (id, patch) => {
        if (patch.quantity != null && patch.quantity <= 0) throw new Error("Quantity must be greater than 0");
        if (patch.buyPrice != null && patch.buyPrice <= 0) throw new Error("Buy price must be greater than 0");
        set({ holdings: get().holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)) });
      },
      deleteHolding: (id) => set({ holdings: get().holdings.filter((h) => h.id !== id) }),
      clearHoldings: () => set({ holdings: [] }),
      addAlert: (a) => {
        if (a.targetPrice <= 0) throw new Error("Target price must be greater than 0");
        set({
          alerts: [{ ...a, id: uid(), symbol: normalizeSymbol(a.symbol), status: "ACTIVE", createdAt: new Date().toISOString(), triggeredAt: null }, ...get().alerts],
        });
      },
      deleteAlert: (id) => set({ alerts: get().alerts.filter((a) => a.id !== id) }),
      clearAlerts: () => set({ alerts: [] }),
      markTriggered: (ids) => {
        const now = new Date().toISOString();
        set({ alerts: get().alerts.map((a) => ids.includes(a.id) && a.status === "ACTIVE" ? { ...a, status: "TRIGGERED", triggeredAt: now } : a) });
      },
      setLastSymbol: (symbol) => set({ lastSymbol: normalizeSymbol(symbol) }),
    }),
    {
      name: "artha-desk",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Never replace a saved watchlist with DEFAULT_WATCHLIST during hydration.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<DeskState> | undefined;
        return {
          ...currentState,
          ...persisted,
          watchlist: Array.isArray(persisted?.watchlist)
            ? persisted.watchlist.map(normalizeSymbol).filter(Boolean)
            : currentState.watchlist,
        };
      },
      migrate: (persistedState) => persistedState as DeskState,
    },
  ),
);

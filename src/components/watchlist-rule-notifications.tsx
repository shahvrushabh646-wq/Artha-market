import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { periodHighLow, round2 } from "@/lib/market/math";
import { fetchWatchPack } from "@/lib/market/server";
import { displaySymbol } from "@/lib/market/config";
import { useDesk, type RuleAlert } from "@/lib/store";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void | Promise<void>>;
  }
}

function istParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: get("weekday"), hour: Number(get("hour")), minute: Number(get("minute")) };
}

function tradingDayKey(now = new Date()) {
  const p = istParts(now);
  if (p.weekday === "Sat" || p.weekday === "Sun") return null;
  return p.date;
}

function ruleFor(price: number, high5y: number | null): RuleAlert["rule"][] {
  if (high5y == null || !Number.isFinite(price)) return [];
  const rules: RuleAlert["rule"][] = [];
  if (price > 20 && price <= high5y * 0.25) rules.push("75");
  if (price <= 20) rules.push("90");
  return rules;
}

function initOneSignal() {
  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined;
  if (!appId || typeof window === "undefined") return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    try {
      await OneSignal.init({ appId, serviceWorkerPath: "OneSignalSDKWorker.js", notifyButton: { enable: true } });
    } catch {
      // In-app alerts continue if OneSignal is not configured yet.
    }
  });
  if (!document.querySelector('script[data-onesignal="artha"]')) {
    const script = document.createElement("script");
    script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    script.defer = true;
    script.dataset.onesignal = "artha";
    document.head.appendChild(script);
  }
}

async function sendBrowserFallback(title: string, body: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification(title, { body, icon: "/__grok/icon-180.png", tag: `artha-${title}` });
  } catch {
    // OneSignal handles subscribed push delivery; this is only a local fallback.
  }
}

export function WatchlistRuleNotifications() {
  const watchlist = useDesk((s) => s.watchlist);
  const ruleAlerts = useDesk((s) => s.ruleAlerts);
  const touchRuleAlert = useDesk((s) => s.touchRuleAlert);
  const markRuleAlertSlot = useDesk((s) => s.markRuleAlertSlot);
  const initialized = useRef(false);

  useEffect(() => { initOneSignal(); }, []);

  const pack = useQuery({
    queryKey: ["watch-rule-alerts", watchlist],
    queryFn: () => fetchWatchPack({ data: { symbols: watchlist } }),
    enabled: watchlist.length > 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const hits = useMemo(() => {
    const quotes = new Map((pack.data?.quotes ?? []).map((q) => [q.symbol, q]));
    const histories = new Map((pack.data?.packs ?? []).map((p) => [p.symbol, p]));
    const out: Array<{ symbol: string; rule: RuleAlert["rule"]; price: number; level: number }> = [];
    for (const symbol of watchlist) {
      const price = quotes.get(symbol)?.price;
      const high = periodHighLow(histories.get(symbol)?.bars5y ?? []).high;
      if (price == null || high == null) continue;
      for (const rule of ruleFor(price, high)) out.push({ symbol, rule, price: round2(price), level: rule === "90" ? 20 : round2(high * 0.25) });
    }
    return out;
  }, [pack.data, watchlist]);

  useEffect(() => {
    if (!pack.data || !watchlist.length) return;
    const day = tradingDayKey();
    if (!day) return;
    const p = istParts();
    const slot = p.hour === 11 && p.minute < 2 ? "11" : p.hour === 15 && p.minute < 2 ? "15" : null;
    const firstOpen = !initialized.current;
    initialized.current = true;
    for (const hit of hits) {
      const state = ruleAlerts.find((x) => x.symbol === hit.symbol && x.rule === hit.rule);
      const next = touchRuleAlert(hit.symbol, hit.rule, day);
      if (next.dayNumber > 3) continue;
      const targetSlot = firstOpen ? "open" : slot;
      if (!targetSlot) continue;
      const key = `${day}:${targetSlot}`;
      if (state?.sentSlots.includes(key)) continue;
      markRuleAlertSlot(hit.symbol, hit.rule, key);
      const ruleLabel = hit.rule === "90" ? "90% RULE" : "75% RULE";
      const body = hit.rule === "90"
        ? `${displaySymbol(hit.symbol)} is at ₹${hit.price} — 90% Rule (₹20 or below) triggered.`
        : `${displaySymbol(hit.symbol)} is at ₹${hit.price} — 75% Rule triggered at ₹${hit.level}.`;
      toast(`🔔 ${ruleLabel}: ${displaySymbol(hit.symbol)}`);
      void sendBrowserFallback(`Artha · ${ruleLabel}`, body);
    }
  }, [hits, markRuleAlertSlot, pack.data, ruleAlerts, touchRuleAlert, watchlist]);

  useEffect(() => {
    const timer = window.setInterval(() => { void pack.refetch(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [pack]);

  return null;
}

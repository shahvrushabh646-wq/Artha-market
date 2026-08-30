export type IndianMarketStatus = "open" | "closed" | "weekend" | "holiday";

/** NSE/BSE regular equity hours, expressed in Asia/Kolkata. Holiday dates should be supplied by the data provider when available. */
export function getIndianMarketStatus(now = new Date()): IndianMarketStatus {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? NaN);
  if (weekday === "Sun" || weekday === "Sat") return "weekend";
  const mins = hour * 60 + minute;
  if (mins < 9 * 60 + 15 || mins > 15 * 60 + 30) return "closed";
  return "open";
}

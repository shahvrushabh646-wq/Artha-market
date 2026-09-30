import {
  IPO,
  GMP,
  Subscription,
  Document,
} from "@/types/ipo";

const INDIA_TZ = "Asia/Kolkata";

export type IPOStatus = "UPCOMING" | "OPEN" | "CLOSED" | "LISTED";
export type GMPData = GMP;
export type DocumentLink = Document;

type IPOWithDocuments = Partial<IPO> & {
  drhpUrl?: string;
  rhpUrl?: string;
};

export function getIndiaNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: INDIA_TZ })
  );
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: INDIA_TZ,
  });
}

export function determineStatus(
  ipo: Pick<IPO, "openDate" | "closeDate" | "listingDate">
): IPOStatus {
  const now = getIndiaNow();
  const open = new Date(ipo.openDate);
  const close = new Date(ipo.closeDate);
  const listing = ipo.listingDate ? new Date(ipo.listingDate) : null;

  if (listing && now >= listing) return "LISTED";
  if (now >= open && now <= close) return "OPEN";
  if (now > close) return "CLOSED";
  return "UPCOMING";
}

export function calculateGMPPercent(
  gmp: number,
  upperPrice: number
): number {
  if (!upperPrice) return 0;
  return Math.round((gmp / upperPrice) * 100 * 100) / 100;
}

export function calculateMedianGMP(
  gmpSources: GMPData["sources"]
): number | undefined {
  if (gmpSources.length === 0) return undefined;

  const values = gmpSources
    .map((s) => s.gmp)
    .sort((a, b) => a - b);

  const mid = Math.floor(values.length / 2);

  return values.length % 2 !== 0
    ? values[mid]
    : (values[mid - 1] + values[mid]) / 2;
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatINRCrore(amount: number): string {
  return `₹${(amount / 10000000).toFixed(2)} Cr`;
}

export function formatTimes(times: number): string {
  return `${times.toFixed(2)}x`;
}

export function getSourcePriority(source: string): number {
  const priorityMap: Record<string, number> = {
    SEBI: 1,
    NSE: 2,
    BSE: 3,
    "Company Website": 4,
    RHP: 5,
    Prospectus: 5,
    Moneycontrol: 6,
    Chittorgarh: 6,
    "Economic Times": 6,
    Mint: 6,
    Groww: 7,
    Zerodha: 7,
    "Angel One": 7,
    Upstox: 7,
    "Yahoo Finance": 7,
    InvestorGain: 8,
    "IPO Watch": 8,
    "IPO Central": 8,
    NiftyTrader: 8,
    IPOGram: 8,
  };

  return priorityMap[source] ?? 9;
}

export function mergeSources<T extends { source: string }>(
  items: T[]
): T[] {
  const merged = new Map<string, T>();

  items.forEach((item) => {
    const existing = merged.get(item.source);

    if (
      !existing ||
      getSourcePriority(item.source) <
        getSourcePriority(existing.source)
    ) {
      merged.set(item.source, item);
    }
  });

  return Array.from(merged.values());
}

export function deduplicateUrls(urls: string[]): string[] {
  return Array.from(new Set(urls));
}

export function getDocumentLinks(
  ipo: IPOWithDocuments
): DocumentLink[] {
  const docs: DocumentLink[] = [];

  if (ipo.drhpUrl) {
    docs.push({
      type: "DRHP",
      label: "Draft Red Herring Prospectus",
      url: ipo.drhpUrl,
      source: "SEBI",
    });
  }

  if (ipo.rhpUrl) {
    docs.push({
      type: "RHP",
      label: "Red Herring Prospectus",
      url: ipo.rhpUrl,
      source: "NSE/BSE",
    });
  }

  if (ipo.documents) {
    docs.push(...ipo.documents);
  }

  return docs;
}

export function getExpectedListingPrice(
  ipo: Pick<IPO, "priceBand" | "gmp">
): { price: number; label: string } | null {
  if (!ipo.gmp || ipo.gmp.sources.length === 0) return null;

  const median =
    ipo.gmp.median ?? ipo.gmp.sources[0].gmp;

  return {
    price: ipo.priceBand.max + median,
    label: "Unofficial GMP-based indication",
  };
}

export function getSubscriptionSummary(
  subscription?: Subscription
): string {
  if (!subscription) return "N/A";
  return `${formatTimes(subscription.overall)} (${subscription.source})`;
}

export function getGMPSummary(gmp?: GMPData): string {
  if (!gmp || gmp.sources.length === 0) return "N/A";

  const median =
    gmp.median ?? gmp.sources[0].gmp;
  const percent =
    gmp.medianPercent ?? gmp.sources[0].gmpPercent;

  return `₹${median} (${percent}%)`;
}

export function getStatusColor(status: IPOStatus): string {
  switch (status) {
    case "UPCOMING":
      return "bg-blue-100 text-blue-700";
    case "OPEN":
      return "bg-emerald-100 text-emerald-700";
    case "CLOSED":
      return "bg-amber-100 text-amber-700";
    case "LISTED":
      return "bg-slate-100 text-slate-700";
  }
}

export function getStatusLabel(status: IPOStatus): string {
  switch (status) {
    case "UPCOMING":
      return "Upcoming";
    case "OPEN":
      return "Open";
    case "CLOSED":
      return "Closed";
    case "LISTED":
      return "Listed";
  }
}
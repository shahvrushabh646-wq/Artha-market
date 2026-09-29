export interface FormattedField {
  text: string;
  isAvailable: boolean;
}

function validPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Formats minimum application amount.
 * Priority: verified amount -> upper price band × lot size -> verification state.
 */
export function formatMinApplication(
  verifiedMinApp?: number | null,
  maxPrice?: number | null,
  lotSize?: number | null,
  calculatedMinApp?: number | null
): FormattedField {
  if (validPositiveNumber(verifiedMinApp)) {
    return {
      text: `₹${verifiedMinApp.toLocaleString("en-IN")}`,
      isAvailable: true,
    };
  }

  if (validPositiveNumber(maxPrice) && validPositiveNumber(lotSize)) {
    const calculated = maxPrice * lotSize;
    return {
      text: `₹${calculated.toLocaleString("en-IN")}`,
      isAvailable: true,
    };
  }

  if (validPositiveNumber(calculatedMinApp)) {
    return {
      text: `₹${calculatedMinApp.toLocaleString("en-IN")}`,
      isAvailable: true,
    };
  }

  return { text: "ચકાસણી હેઠળ", isAvailable: false };
}

/** Formats total IPO subscription multiple. */
export function formatSubscriptionMultiple(sub?: number | null): FormattedField {
  if (validNumber(sub) && sub >= 0) {
    return {
      text: `${sub.toFixed(2)} ગણું`,
      isAvailable: true,
    };
  }
  return { text: "માહિતી ઉપલબ્ધ નથી", isAvailable: false };
}

/** Formats total subscription bidding amount in crore. */
export function formatSubscriptionAmount(amtCr?: number | null): FormattedField {
  if (validPositiveNumber(amtCr)) {
    const formattedAmt = amtCr.toLocaleString("en-IN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
    return {
      text: `₹${formattedAmt} કરોડ`,
      isAvailable: true,
    };
  }
  return { text: "માહિતી ઉપલબ્ધ નથી", isAvailable: false };
}

/** Formats unofficial Grey Market Premium. */
export function formatGmp(
  gmpRs?: number | null,
  gmpPct?: number | null
): FormattedField {
  if (validNumber(gmpRs)) {
    const sign = gmpRs >= 0 ? "+" : "";
    const pctText = validNumber(gmpPct) ? ` (${sign}${gmpPct}%)` : "";
    return {
      text: `${sign}₹${gmpRs}${pctText}`,
      isAvailable: true,
    };
  }
  return { text: "ઉપલબ્ધ નથી", isAvailable: false };
}

export interface RawIpoItem {
  id: string;
  companyName: string;
  type: "Mainboard" | "SME";
  status: "OPEN" | "UPCOMING" | "CLOSED" | string;
  issueSize?: string;
  priceBand?: string;
  priceMax?: number;
  lotSize?: number;
  subscriptionRatio?: number;
  gmpAmount?: number | null;
  minApplicationAmount?: number | null;
  openDate?: string;
  closeDate?: string;
}

export interface ProcessedIpoItem extends RawIpoItem {
  calculatedMinInvestment: string;
  formattedSubscription: string;
  formattedGmp: string;
  statusBadge: { text: string; color: string };
}

export function processIpoData(item: RawIpoItem): ProcessedIpoItem {
  let minInvText = "ચકાસણી હેઠળ";

  if (validPositiveNumber(item.minApplicationAmount)) {
    minInvText = `₹${item.minApplicationAmount.toLocaleString("en-IN")}`;
  } else if (
    validPositiveNumber(item.priceMax) &&
    validPositiveNumber(item.lotSize)
  ) {
    const calculated = item.priceMax * item.lotSize;
    minInvText = `₹${calculated.toLocaleString("en-IN")} (${item.lotSize} શેર્સ)`;
  }

  const formattedSub =
    validPositiveNumber(item.subscriptionRatio)
      ? `${item.subscriptionRatio.toFixed(2)}x`
      : "માહિતી ઉપલબ્ધ નથી";

  let formattedGmp = "ઉપલબ્ધ નથી";
  if (item.gmpAmount !== undefined && item.gmpAmount !== null) {
    formattedGmp =
      item.gmpAmount > 0
        ? `+₹${item.gmpAmount}`
        : item.gmpAmount === 0
          ? "₹0 (Flat)"
          : `-₹${Math.abs(item.gmpAmount)}`;
  }

  let statusBadge = {
    text: "ચકાસણી હેઠળ",
    color: "bg-gray-100 text-gray-700",
  };
  if (item.status === "OPEN") {
    statusBadge = {
      text: "ખૂલેલું (OPEN)",
      color: "bg-green-100 text-green-800 border-green-300",
    };
  } else if (item.status === "UPCOMING") {
    statusBadge = {
      text: "આગામી (UPCOMING)",
      color: "bg-blue-100 text-blue-800 border-blue-300",
    };
  } else if (item.status === "CLOSED") {
    statusBadge = {
      text: "બંધ (CLOSED)",
      color: "bg-red-100 text-red-800 border-red-300",
    };
  }

  return {
    ...item,
    calculatedMinInvestment: minInvText,
    formattedSubscription: formattedSub,
    formattedGmp,
    statusBadge,
  };
}
\n
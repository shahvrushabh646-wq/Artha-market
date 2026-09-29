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

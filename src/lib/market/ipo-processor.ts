export interface RawIpoItem {
  id: string;
  companyName: string;
  type: 'Mainboard' | 'SME';
  status: 'OPEN' | 'UPCOMING' | 'CLOSED' | string;
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

  if (typeof item.minApplicationAmount === 'number' && item.minApplicationAmount > 0) {
    minInvText = `₹${item.minApplicationAmount.toLocaleString('en-IN')}`;
  } else if (
    typeof item.priceMax === 'number' &&
    typeof item.lotSize === 'number' &&
    item.priceMax > 0 &&
    item.lotSize > 0
  ) {
    const calculated = item.priceMax * item.lotSize;
    minInvText = `₹${calculated.toLocaleString('en-IN')} (${item.lotSize} શેર્સ)`;
  }

  const formattedSub =
    typeof item.subscriptionRatio === 'number' &&
    !isNaN(item.subscriptionRatio) &&
    item.subscriptionRatio >= 0
      ? `${item.subscriptionRatio.toFixed(2)}x`
      : "માહિતી ઉપલબ્ધ નથી";

  let formattedGmp = "ઉપલબ્ધ નથી";
  if (typeof item.gmpAmount === 'number' && !isNaN(item.gmpAmount)) {
    if (item.gmpAmount > 0) {
      formattedGmp = `+₹${item.gmpAmount.toLocaleString('en-IN')}`;
    } else if (item.gmpAmount === 0) {
      formattedGmp = "₹0 (Flat)";
    } else {
      formattedGmp = `-₹${Math.abs(item.gmpAmount).toLocaleString('en-IN')}`;
    }
  }

  const normalizedStatus = item.status?.trim().toUpperCase();
  let statusBadge = {
    text: "ચકાસણી હેઠળ",
    color: "bg-gray-100 text-gray-700"
  };

  if (normalizedStatus === "OPEN") {
    statusBadge = {
      text: "ખૂલેલું (OPEN)",
      color: "bg-green-100 text-green-800 border-green-300"
    };
  } else if (normalizedStatus === "UPCOMING") {
    statusBadge = {
      text: "આગામી (UPCOMING)",
      color: "bg-blue-100 text-blue-800 border-blue-300"
    };
  } else if (normalizedStatus === "CLOSED") {
    statusBadge = {
      text: "બંધ (CLOSED)",
      color: "bg-red-100 text-red-800 border-red-300"
    };
  }

  return {
    ...item,
    calculatedMinInvestment: minInvText,
    formattedSubscription: formattedSub,
    formattedGmp,
    statusBadge
  };
}

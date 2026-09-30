import { IPO } from "@/types/ipo";

export function formatDate(date: string | undefined): string {
  if (!date) return "માહિતી ઉપલબ્ધ નથી";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "માહિતી ઉપલબ્ધ નથી";
  return d.toLocaleDateString("gu-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatINRCrore(amount: number): string {
  if (!amount) return "માહિતી ઉપલબ્ધ નથી";
  const crore = amount / 10000000;
  return `₹${crore.toFixed(2)} કરોડ`;
}

export function formatTimes(times: number): string {
  return `${times.toFixed(2)} ગણું`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "upcoming":
      return "bg-blue-100 text-blue-800";
    case "open":
      return "bg-emerald-100 text-emerald-800";
    case "closed":
      return "bg-amber-100 text-amber-800";
    case "listed":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "upcoming":
      return "આગામી";
    case "open":
      return "ખુલ્લું";
    case "closed":
      return "બંધ";
    case "listed":
      return "લિસ્ટેડ";
    default:
      return status;
  }
}
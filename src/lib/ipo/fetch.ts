import { fetchOpenIposLive } from "../market/ipo-live";

export async function loadUniverse() {
  const ipos = await fetchOpenIposLive({ data: {} });
  return {
    ipos,
    fetchedAt: new Date().toISOString(),
    sourceNotes: ["NSE India official IPO data", "NSE India issue-information", "Moneycontrol IPO", "Zerodha IPO", "Angel One IPO"],
    errors: [],
  };
}

export async function loadDetail(id: string) {
  const universe = await loadUniverse();
  return universe.ipos.find((ipo) => ipo.id === id) ?? null;
}

function answerFor(ipo: any, question?: string) {
  const q = String(question ?? "").toLowerCase();
  if (q.includes("business") || q.includes("કંપની શું") || q.includes("બિઝનેસ"))
    return ipo.business ?? "ચકાસાયેલ સ્રોતોમાં કંપનીનું વ્યવસાય વર્ણન મળ્યું નથી.";
  if (q.includes("revenue") || q.includes("આવક")) return ipo.revenues?.length ? ipo.revenues.map((x:any)=>`${x.year}: ₹${x.value} કરોડ`).join(" • ") : "ચકાસાયેલ નાણાકીય આવકના આંકડા મળ્યા નથી.";
  if (q.includes("profit") || q.includes("નફો")) return ipo.profits?.length ? ipo.profits.map((x:any)=>`${x.year}: ₹${x.value} કરોડ`).join(" • ") : "ચકાસાયેલ નફાના આંકડા મળ્યા નથી.";
  if (q.includes("eps")) return ipo.eps?.length ? ipo.eps.map((x:any)=>`${x.year}: ₹${x.value}`).join(" • ") : "ચકાસાયેલ EPS આંકડા મળ્યા નથી.";
  if (q.includes("gmp") || q.includes("grey market")) return ipo.gmpPct == null ? "હાલ matching public GMP quote મળ્યો નથી." : `હાલનો GMP +${ipo.gmpPct}% છે; GMP અનૌપચારિક છે.`;
  if (q.includes("risk") || q.includes("જોખમ")) return ipo.risks?.length ? ipo.risks.join(" • ") : "ચકાસાયેલ સ્રોતોમાં મુખ્ય જોખમોની structured માહિતી મળ્યા નથી.";
  if (q.includes("fund") || q.includes("use") || q.includes("પૈસા")) return ipo.objects?.length ? ipo.objects.join(" • ") : "ચકાસાયેલ સ્રોતોમાં IPO fundsના ઉપયોગની માહિતી મળતી નથી.";
  return [
    ipo.business ? `Business: ${ipo.business}` : null,
    ipo.priceBand ? `Price band: ${ipo.priceBand}` : null,
    ipo.lotSize != null ? `Lot: ${ipo.lotSize}` : null,
    ipo.subscription != null ? `Subscription: ${ipo.subscription}x` : null,
    ipo.gmpPct != null ? `GMP: ${ipo.gmpPct}%` : null,
  ].filter(Boolean).join(" • ") || "આ પ્રશ્ન માટે ચકાસાયેલ માહિતી ઉપલબ્ધ નથી.";
}

export async function askDocument(idOrIpo: unknown, question?: string) {
  const ipo = typeof idOrIpo === "object" && idOrIpo ? (idOrIpo as any) : await loadDetail(String(idOrIpo));
  if (!ipo) {
    return { answer: "IPOનો ડેટા ઉપલબ્ધ નથી.", sourceLabel: "Source: unavailable", documentDate: null, found: false };
  }
  return {
    answer: answerFor(ipo, question),
    sourceLabel: ipo.detailSource ?? "NSE India",
    documentDate: ipo.verifiedAt ?? null,
    found: true,
  };
}

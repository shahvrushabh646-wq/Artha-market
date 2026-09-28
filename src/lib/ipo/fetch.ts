import { fetchOpenIposLive } from "../market/ipo-live";

export async function loadUniverse() {
  const ipos = await fetchOpenIposLive({ data: {} });
  return {
    ipos,
    fetchedAt: new Date().toISOString(),
    sourceNotes: ["NSE India official IPO data", "NSE India issue-information"],
    errors: [],
  };
}

export async function loadDetail(id: string) {
  const universe = await loadUniverse();
  return universe.ipos.find((ipo) => ipo.id === id) ?? null;
}

export async function askDocument(idOrIpo: unknown, question?: string) {
  const ipo = typeof idOrIpo === "object" && idOrIpo ? (idOrIpo as any) : await loadDetail(String(idOrIpo));
  if (!ipo) {
    return { answer: "IPOનો ડેટા ઉપલબ્ધ નથી.", sourceLabel: "Source: unavailable", documentDate: null, found: false };
  }
  return {
    answer: `${ipo.name}: ${question ?? "IPO માહિતી"}. ઉપલબ્ધ ચકાસાયેલ માહિતી IPO detail page પર દર્શાવવામાં આવે છે.`,
    sourceLabel: ipo.detailSource ?? "NSE India",
    documentDate: ipo.verifiedAt ?? null,
    found: true,
  };
}

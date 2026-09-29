export function estimatedListing(upperPrice: number | null, gmpRs: number | null): { price: number | null; gainPct: number | null } {
  if (upperPrice == null || gmpRs == null || !Number.isFinite(upperPrice) || !Number.isFinite(gmpRs)) {
    return { price: null, gainPct: null };
  }
  return {
    price: Number((upperPrice + gmpRs).toFixed(2)),
    gainPct: upperPrice !== 0 ? Number(((gmpRs / upperPrice) * 100).toFixed(2)) : null,
  };
}

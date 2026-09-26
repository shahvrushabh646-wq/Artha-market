import { createServerFn } from "@tanstack/react-start";

// Gold & Silver rates (India, INR) — kept as its own module so the metal-price
// fetch/fallback/cache logic doesn't live inline inside a route component.
//
// Gold API supplies free USD/troy-ounce spot prices without a key. Frankfurter
// supplies a public daily USD/INR reference rate. Convert units here so the
// dashboard only receives INR values. Last-good data remains available for
// the lifetime of a warm serverless instance and is flagged stale on failure.

const TROY_OUNCE_GRAMS = 31.1034768;

export type MetalPrices = {
  gold10g: number | null;
  silverKg: number | null;
  goldChange24hPct: number | null;
  goldChange24hAmount10g: number | null;
  silverChange24hPct: number | null;
  silverChange24hAmountKg: number | null;
  gold5yHigh10g: number;
  goldDiscount10Price10g: number;
  goldDiscount20Price10g: number;
  goldDiscount30Price10g: number;
  goldDiscount40Price10g: number;
  silver5yHighKg: number;
  silver25PriceKg: number;
  silver35PriceKg: number;
  silver45PriceKg: number;
  silver50PriceKg: number;
  silver55PriceKg: number;
  goldSignal: "BUY" | "WAIT" | null;
  asOf: string | null;
  source: string;
  /** true when this payload is a cached last-known value because the live refresh just failed */
  stale: boolean;
};

type MetalQuote = {
  gold10g: number;
  silverKg: number;
  goldChange24hPct: number | null;
  goldChange24hAmount10g: number | null;
  silverChange24hPct: number | null;
  silverChange24hAmountKg: number | null;
  asOf: string;
  source: string;
};

// In-memory last-known-good value. Persists for the lifetime of a warm
// serverless instance — the same pattern already used for quote caching in
// src/lib/market/server.ts.
let lastGood: MetalQuote | null = null;

type SpotPriceResponse = { currency?: unknown; price?: unknown; updatedAt?: unknown };

/** Fetch live spot prices and the latest available official FX reference. */
async function fromFreeJsonFeed(): Promise<MetalQuote | null> {
  try {
    const [goldResponse, silverResponse, fxResponse] = await Promise.all([
      fetch("https://api.gold-api.com/price/XAU", { cache: "no-store", signal: AbortSignal.timeout(10000) }),
      fetch("https://api.gold-api.com/price/XAG", { cache: "no-store", signal: AbortSignal.timeout(10000) }),
      fetch("https://api.frankfurter.dev/v2/rates?base=USD&quotes=INR", { cache: "no-store", signal: AbortSignal.timeout(10000) })
    ]);
    if (!goldResponse.ok || !silverResponse.ok || !fxResponse.ok) return null;

    const [gold, silver, fx] = await Promise.all([
      goldResponse.json() as Promise<SpotPriceResponse>,
      silverResponse.json() as Promise<SpotPriceResponse>,
      fxResponse.json() as Promise<Array<{ rate?: unknown; quote?: unknown }>>
    ]);
    const usdPerTroyOunceGold = Number(gold.price);
    const usdPerTroyOunceSilver = Number(silver.price);
    const usdToInr = Number(Array.isArray(fx) ? fx.find((row) => row.quote === "INR")?.rate : NaN);
    if (gold.currency !== "USD" || silver.currency !== "USD" || ![usdPerTroyOunceGold, usdPerTroyOunceSilver, usdToInr].every((value) => Number.isFinite(value) && value > 0)) return null;

    const goldInrPerGram = (usdPerTroyOunceGold * usdToInr) / TROY_OUNCE_GRAMS;
    const silverInrPerGram = (usdPerTroyOunceSilver * usdToInr) / TROY_OUNCE_GRAMS;
    const gold10g = Math.round(goldInrPerGram * 10);
    const silverKg = Math.round(silverInrPerGram * 1000);

    return {
      gold10g,
      silverKg,
      goldChange24hPct: null,
      goldChange24hAmount10g: null,
      silverChange24hPct: null,
      silverChange24hAmountKg: null,
      asOf: typeof gold.updatedAt === "string" ? gold.updatedAt : new Date().toISOString(),
      source: "Gold API spot + Frankfurter USD/INR reference"
    };
  } catch {
    return null;
  }
}

async function getIndianMetalPrices(): Promise<MetalQuote | null> {
  return fromFreeJsonFeed();
}

export const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(async (): Promise<MetalPrices> => {
  const gold5yHigh10g = 170000;
  const silver5yHighKg = 400000;
  const goldDiscount10Price10g = Math.round(gold5yHigh10g * 0.90);
  const goldDiscount20Price10g = Math.round(gold5yHigh10g * 0.80);
  const goldDiscount30Price10g = Math.round(gold5yHigh10g * 0.70);
  const goldDiscount40Price10g = Math.round(gold5yHigh10g * 0.60);
  const silver25PriceKg = Math.round(silver5yHighKg * 0.75);
  const silver35PriceKg = Math.round(silver5yHighKg * 0.65);
  const silver45PriceKg = Math.round(silver5yHighKg * 0.55);
  const silver50PriceKg = Math.round(silver5yHighKg * 0.50);
  const silver55PriceKg = Math.round(silver5yHighKg * 0.45);

  const live = await getIndianMetalPrices();
  if (live) lastGood = live;
  const effective = live ?? lastGood;

  if (!effective) {
    return {
      gold10g: null,
      silverKg: null,
      goldChange24hPct: null,
      goldChange24hAmount10g: null,
      silverChange24hPct: null,
      silverChange24hAmountKg: null,
      gold5yHigh10g,
      goldDiscount10Price10g,
      goldDiscount20Price10g,
      goldDiscount30Price10g,
      goldDiscount40Price10g,
      silver5yHighKg,
      silver25PriceKg,
      silver35PriceKg,
      silver45PriceKg,
      silver50PriceKg,
      silver55PriceKg,
      goldSignal: null,
      asOf: null,
      source: "Unavailable",
      stale: false
    };
  }

  const { gold10g, silverKg, goldChange24hPct, goldChange24hAmount10g, silverChange24hPct, silverChange24hAmountKg, asOf, source } = effective;
  const goldSignal = gold10g <= goldDiscount40Price10g ? "BUY" : "WAIT";
  return {
    gold10g,
    silverKg,
    goldChange24hPct,
    goldChange24hAmount10g,
    silverChange24hPct,
    silverChange24hAmountKg,
    gold5yHigh10g,
    goldDiscount10Price10g,
    goldDiscount20Price10g,
    goldDiscount30Price10g,
    goldDiscount40Price10g,
    silver5yHighKg,
    silver25PriceKg,
    silver35PriceKg,
    silver45PriceKg,
    silver50PriceKg,
    silver55PriceKg,
    goldSignal,
    asOf,
    source,
    stale: !live
  };
});


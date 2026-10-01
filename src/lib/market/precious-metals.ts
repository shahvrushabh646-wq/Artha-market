import { createServerFn } from "@tanstack/react-start";

const REFRESH_INTERVAL = 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const RETRY_DELAYS = [1500, 4000];

const TROY_OZ_TO_GRAM = 31.1034768;

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
  stale: boolean;
};

type LiveMetalData = {
  gold10g: number;
  silverKg: number;
  goldChange24hPct: number | null;
  goldChange24hAmount10g: number | null;
  silverChange24hPct: number | null;
  silverChange24hAmountKg: number | null;
  asOf: string;
  source: string;
};

type OroPocketResponse = {
  statusCode?: number;
  data?: {
    gold?: {
      buy?: number;
      sell?: number;
      change24h?: { buy?: number };
    };
    silver?: {
      buy?: number;
      sell?: number;
      change24h?: { buy?: number };
    };
    timestamp?: string;
  };
};

type GoldApiResponse = {
  price?: number;
  timestamp?: number;
  chp?: number;
  ch?: number;
};

class PriceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceFetchError";
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new PriceFetchError(`Price source returned HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof PriceFetchError) throw error;
    throw new PriceFetchError(
      error instanceof Error ? error.message : "Price source request failed"
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Primary source:
 * Indian INR buy quotes, per gram, no API key.
 * The endpoint already provides the Indian quote excluding GST,
 * which matches the existing Artha card label.
 */
async function fetchOroPocket(): Promise<LiveMetalData> {
  const data = await fetchJson<OroPocketResponse>(
    "https://api.oropocket.com/public/prices"
  );

  const gold = Number(data.data?.gold?.buy);
  const silver = Number(data.data?.silver?.buy);
  const goldChangePct = Number(data.data?.gold?.change24h?.buy);
  const silverChangePct = Number(data.data?.silver?.change24h?.buy);
  const timestamp = data.data?.timestamp;

  if (!Number.isFinite(gold) || gold <= 0) {
    throw new PriceFetchError("Primary source returned an invalid gold price");
  }

  if (!Number.isFinite(silver) || silver <= 0) {
    throw new PriceFetchError("Primary source returned an invalid silver price");
  }

  const asOf = timestamp && !Number.isNaN(Date.parse(timestamp))
    ? new Date(timestamp).toISOString()
    : new Date().toISOString();

  return {
    gold10g: gold * 10,
    silverKg: silver * 1000,
    goldChange24hPct: Number.isFinite(goldChangePct) ? goldChangePct : null,
    goldChange24hAmount10g: Number.isFinite(goldChangePct)
      ? (gold * 10 * goldChangePct) / 100
      : null,
    silverChange24hPct: Number.isFinite(silverChangePct)
      ? silverChangePct
      : null,
    silverChange24hAmountKg: Number.isFinite(silverChangePct)
      ? (silver * 1000 * silverChangePct) / 100
      : null,
    asOf,
    source: "OroPocket · India buy rate · GST excluded",
  };
}

/**
 * Secondary live source:
 * Gold API provides real-time XAU/XAG spot prices without an API key.
 * Frankfurter supplies the latest USD/INR reference rate.
 * This is still live data; there is deliberately no hardcoded price fallback.
 */
async function fetchGoldApi(): Promise<LiveMetalData> {
  const [gold, silver, fx] = await Promise.all([
    fetchJson<GoldApiResponse>("https://api.gold-api.com/price/XAU"),
    fetchJson<GoldApiResponse>("https://api.gold-api.com/price/XAG"),
    fetchJson<{ rates?: { INR?: number } }>(
      "https://api.frankfurter.app/latest?from=USD&to=INR"
    ),
  ]);

  const goldUsd = Number(gold.price);
  const silverUsd = Number(silver.price);
  const usdInr = Number(fx.rates?.INR);

  if (!Number.isFinite(goldUsd) || goldUsd <= 0) {
    throw new PriceFetchError("Secondary source returned an invalid gold price");
  }

  if (!Number.isFinite(silverUsd) || silverUsd <= 0) {
    throw new PriceFetchError("Secondary source returned an invalid silver price");
  }

  if (!Number.isFinite(usdInr) || usdInr <= 0) {
    throw new PriceFetchError("Secondary source returned an invalid USD/INR rate");
  }

  const gold10g = (goldUsd * usdInr / TROY_OZ_TO_GRAM) * 10;
  const silverKg = (silverUsd * usdInr / TROY_OZ_TO_GRAM) * 1000;

  const goldChangePct = Number(gold.chp);
  const silverChangePct = Number(silver.chp);
  const asOfMs = Number(gold.timestamp) * 1000;
  const asOf =
    Number.isFinite(asOfMs) && asOfMs > 0
      ? new Date(asOfMs).toISOString()
      : new Date().toISOString();

  return {
    gold10g,
    silverKg,
    goldChange24hPct: Number.isFinite(goldChangePct) ? goldChangePct : null,
    goldChange24hAmount10g: Number.isFinite(goldChangePct)
      ? (gold10g * goldChangePct) / 100
      : null,
    silverChange24hPct: Number.isFinite(silverChangePct)
      ? silverChangePct
      : null,
    silverChange24hAmountKg: Number.isFinite(silverChangePct)
      ? (silverKg * silverChangePct) / 100
      : null,
    asOf,
    source: "Gold API + Frankfurter · live spot converted to INR",
  };
}

async function fetchLivePrices(): Promise<LiveMetalData> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    try {
      // Always prefer the India-specific INR quote.
      return await fetchOroPocket();
    } catch (error) {
      lastError = error;

      // Do not wait through long retries if the primary source is unavailable.
      if (attempt < RETRY_DELAYS.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAYS[attempt])
        );
      }
    }
  }

  try {
    return await fetchGoldApi();
  } catch (error) {
    lastError = error;
  }

  throw lastError instanceof Error
    ? lastError
    : new PriceFetchError("All live metal price sources failed");
}

let lastGood: LiveMetalData | null = null;

function buildPrices(
  live: LiveMetalData,
  gold5yHigh10g: number,
  silver5yHighKg: number
): MetalPrices {
  const goldDiscount10Price10g = Math.round(gold5yHigh10g * 0.9);
  const goldDiscount20Price10g = Math.round(gold5yHigh10g * 0.8);
  const goldDiscount30Price10g = Math.round(gold5yHigh10g * 0.7);
  const goldDiscount40Price10g = Math.round(gold5yHigh10g * 0.6);

  const silver25PriceKg = Math.round(silver5yHighKg * 0.75);
  const silver35PriceKg = Math.round(silver5yHighKg * 0.65);
  const silver45PriceKg = Math.round(silver5yHighKg * 0.55);
  const silver50PriceKg = Math.round(silver5yHighKg * 0.5);
  const silver55PriceKg = Math.round(silver5yHighKg * 0.45);

  return {
    gold10g: Math.round(live.gold10g),
    silverKg: Math.round(live.silverKg),
    goldChange24hPct: live.goldChange24hPct,
    goldChange24hAmount10g:
      live.goldChange24hAmount10g != null
        ? Math.round(live.goldChange24hAmount10g)
        : null,
    silverChange24hPct: live.silverChange24hPct,
    silverChange24hAmountKg:
      live.silverChange24hAmountKg != null
        ? Math.round(live.silverChange24hAmountKg)
        : null,
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
    goldSignal:
      live.gold10g <= goldDiscount40Price10g ? "BUY" : "WAIT",
    asOf: live.asOf,
    source: live.source,
    stale: false,
  };
}

export const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(
  async (): Promise<MetalPrices> => {
    // Existing Artha reference levels are preserved.
    const gold5yHigh10g = 170000;
    const silver5yHighKg = 400000;

    try {
      const live = await fetchLivePrices();
      lastGood = live;

      return buildPrices(live, gold5yHigh10g, silver5yHighKg);
    } catch (error) {
      console.error("Live metal price fetch failed:", error);

      // Never invent a current price. If the server has previously
      // obtained a real price, return that verified price as stale.
      if (lastGood) {
        return {
          ...buildPrices(lastGood, gold5yHigh10g, silver5yHighKg),
          stale: true,
        };
      }

      // No fixed fallback price. The UI will show "Price unavailable".
      const unavailable = buildPrices(
        {
          gold10g: Number.NaN,
          silverKg: Number.NaN,
          goldChange24hPct: null,
          goldChange24hAmount10g: null,
          silverChange24hPct: null,
          silverChange24hAmountKg: null,
          asOf: new Date().toISOString(),
          source: "Live price unavailable",
        },
        gold5yHigh10g,
        silver5yHighKg
      );

      return {
        ...unavailable,
        gold10g: null,
        silverKg: null,
        goldSignal: null,
        stale: true,
        source: "Live price unavailable",
        asOf: null,
      };
    }
  }
);

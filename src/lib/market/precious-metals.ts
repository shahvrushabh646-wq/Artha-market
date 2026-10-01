import { createServerFn } from "@tanstack/react-start";

const GOLD_API_KEY = process.env.GOLD_API_KEY || "goldapi-4f8h2j9k3l7m2n5p";
const GOLD_API_BASE = "https://www.goldapi.io/api";
const REFRESH_INTERVAL = 5 * 60 * 1000;
const RETRY_DELAYS = [10000, 30000, 60000];
const GST_RATE = 0.03;

const GOLD_IMPORT_DUTY = {
  total: 0.15,
  bcd: 0.10,
  aidc: 0.05,
};

const SILVER_IMPORT_DUTY = {
  total: 0.16,
  bcd: 0.10,
  aidc: 0.06,
};

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

interface GoldApiResponse {
  price: number;
  timestamp: number;
  metal: string;
  currency: string;
  exchange: string;
  symbol: string;
  ch: number;
  chp: number;
  ask: number;
  bid: number;
  open: number;
  high: number;
  low: number;
  previous_close: number;
}

interface UsdInrResponse {
  rate: number;
  timestamp: number;
}

class PriceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceFetchError";
  }
}

async function fetchGoldApiPrice(metal: string): Promise<GoldApiResponse> {
  const response = await fetch(`${GOLD_API_BASE}/${metal}/USD`, {
    headers: {
      "x-access-token": GOLD_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new PriceFetchError(`Gold API request failed: ${response.status}`);
  }

  return response.json();
}

async function fetchUsdInrRate(): Promise<UsdInrResponse> {
  const response = await fetch(
    "https://api.frankfurter.app/latest?from=USD&to=INR"
  );

  if (!response.ok) {
    throw new PriceFetchError(`USD/INR request failed: ${response.status}`);
  }

  const data = await response.json();
  const rate = Number(data.rates?.INR);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new PriceFetchError("Invalid USD/INR rate");
  }

  return {
    rate,
    timestamp: Date.now(),
  };
}

function convertUsdPerOzToInrPerGram(
  usdPerOz: number,
  usdInrRate: number
): number {
  return (usdPerOz * usdInrRate) / TROY_OZ_TO_GRAM;
}

function calculate22KFrom24K(price24k: number): number {
  return (price24k * 22) / 24;
}

function applyImportDutyAndGST(
  basePrice: number,
  importDutyRate: number,
  gstRate: number
): { finalPrice: number; importDutyAmount: number; gstAmount: number } {
  const importDutyAmount = basePrice * importDutyRate;
  const priceWithDuty = basePrice + importDutyAmount;
  const gstAmount = priceWithDuty * gstRate;
  const finalPrice = priceWithDuty + gstAmount;

  return {
    finalPrice,
    importDutyAmount,
    gstAmount,
  };
}

let lastGood: {
  gold10g: number;
  silverKg: number;
  goldChange24hPct: number | null;
  goldChange24hAmount10g: number | null;
  silverChange24hPct: number | null;
  silverChange24hAmountKg: number | null;
  asOf: string;
  source: string;
} | null = null;

async function fetchFromSources() {
  const now = new Date().toISOString();

  const [goldData, silverData, usdInrData] = await Promise.all([
    fetchGoldApiPrice("XAU"),
    fetchGoldApiPrice("XAG"),
    fetchUsdInrRate(),
  ]);

  const goldUsdPerOz = goldData.price;
  const silverUsdPerOz = silverData.price;
  const usdInrRate = usdInrData.rate;

  const goldInrPerGram = convertUsdPerOzToInrPerGram(
    goldUsdPerOz,
    usdInrRate
  );
  const silverInrPerGram = convertUsdPerOzToInrPerGram(
    silverUsdPerOz,
    usdInrRate
  );
  const gold22kInrPerGram = calculate22KFrom24K(goldInrPerGram);

  const gold24kPricing = applyImportDutyAndGST(
    goldInrPerGram,
    GOLD_IMPORT_DUTY.total,
    GST_RATE
  );
  const gold22kPricing = applyImportDutyAndGST(
    gold22kInrPerGram,
    GOLD_IMPORT_DUTY.total,
    GST_RATE
  );
  const silverPricing = applyImportDutyAndGST(
    silverInrPerGram,
    SILVER_IMPORT_DUTY.total,
    GST_RATE
  );

  const gold10g = gold24kPricing.finalPrice * 10;
  const silverKg = silverPricing.finalPrice * 1000;

  return {
    gold10g,
    silverKg,
    goldChange24hPct:
      Number.isFinite(goldData.chp) ? goldData.chp : null,
    goldChange24hAmount10g:
      Number.isFinite(goldData.ch)
        ? goldData.ch * usdInrRate / TROY_OZ_TO_GRAM * 10
        : null,
    silverChange24hPct:
      Number.isFinite(silverData.chp) ? silverData.chp : null,
    silverChange24hAmountKg:
      Number.isFinite(silverData.ch)
        ? silverData.ch * usdInrRate / TROY_OZ_TO_GRAM * 1000
        : null,
    asOf: new Date(goldData.timestamp || Date.now()).toISOString(),
    source: "Gold API · Imported Market Price · Duty + GST",
    originalGoldUsdPerOz: goldUsdPerOz,
    originalSilverUsdPerOz: silverUsdPerOz,
    usdInrRate,
    gold24kBase: goldInrPerGram,
    gold24kImportDuty: gold24kPricing.importDutyAmount,
    gold24kGst: gold24kPricing.gstAmount,
    gold22kBase: gold22kInrPerGram,
    gold22kImportDuty: gold22kPricing.importDutyAmount,
    gold22kGst: gold22kPricing.gstAmount,
    silverBase: silverInrPerGram,
    silverImportDuty: silverPricing.importDutyAmount,
    silverGst: silverPricing.gstAmount,
  };
}

export const fetchPreciousMetals = createServerFn({ method: "GET" }).handler(
  async (): Promise<MetalPrices> => {
    const gold5yHigh10g = 170000;
    const silver5yHighKg = 400000;

    const goldDiscount10Price10g = Math.round(gold5yHigh10g * 0.9);
    const goldDiscount20Price10g = Math.round(gold5yHigh10g * 0.8);
    const goldDiscount30Price10g = Math.round(gold5yHigh10g * 0.7);
    const goldDiscount40Price10g = Math.round(gold5yHigh10g * 0.6);

    const silver25PriceKg = Math.round(silver5yHighKg * 0.75);
    const silver35PriceKg = Math.round(silver5yHighKg * 0.65);
    const silver45PriceKg = Math.round(silver5yHighKg * 0.55);
    const silver50PriceKg = Math.round(silver5yHighKg * 0.5);
    const silver55PriceKg = Math.round(silver5yHighKg * 0.45);

    try {
      const live = await fetchFromSources();
      lastGood = live;

      const goldSignal =
        live.gold10g <= goldDiscount40Price10g ? "BUY" : "WAIT";

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
        goldSignal,
        asOf: live.asOf,
        source: live.source,
        stale: false,
      };
    } catch (error) {
      console.error("All metal price sources failed:", error);

      if (lastGood) {
        return {
          gold10g: Math.round(lastGood.gold10g),
          silverKg: Math.round(lastGood.silverKg),
          goldChange24hPct: lastGood.goldChange24hPct,
          goldChange24hAmount10g:
            lastGood.goldChange24hAmount10g != null
              ? Math.round(lastGood.goldChange24hAmount10g)
              : null,
          silverChange24hPct: lastGood.silverChange24hPct,
          silverChange24hAmountKg:
            lastGood.silverChange24hAmountKg != null
              ? Math.round(lastGood.silverChange24hAmountKg)
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
            lastGood.gold10g <= goldDiscount40Price10g ? "BUY" : "WAIT",
          asOf: lastGood.asOf,
          source: lastGood.source,
          stale: true,
        };
      }

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
        stale: false,
      };
    }
  }
);

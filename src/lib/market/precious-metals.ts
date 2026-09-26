import { createServerFn } from "@tanstack/react-start";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
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

let lastGood: MetalQuote | null = null;

/**
 * Primary source: India-specific INR buy quotes.
 * Gold and silver are returned per gram, excluding GST.
 * We convert only the display units required by Artha:
 *   Gold 24K -> INR / 10g
 *   Silver -> INR / kg
 */
async function fromIndiaRateApi(): Promise<MetalQuote | null> {
  try {
    const res = await fetch(
      "https://allindiabullion.com/gold-rate/maharashtra/mumbai",
      {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": UA,
          "Accept-Language": "en-IN,en;q=0.9"
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!res.ok) return null;

    const html = await res.text();

    // Read the explicit headline 24K and Silver 999 reference values.
    // These are GST-exclusive metal-reference rates on the Mumbai page.
    const goldMatch =
      html.match(/24K Gold[\s\S]{0,1500}?₹\\s*([\\d,]+(?:\\.\\d+)?)/i) ??
      html.match(/24K[\s\S]{0,800}?₹\\s*([\\d,]+(?:\\.\\d+)?)/i);
    const silverMatch =
      html.match(/Silver[\s\S]{0,1500}?₹\\s*([\\d,]+(?:\\.\\d+)?)[\s\S]{0,100}?per kg/i) ??
      html.match(/Silver[\s\S]{0,800}?₹\\s*([\\d,]+(?:\\.\\d+)?)/i);

    const gold10g = goldMatch
      ? Math.round(Number(goldMatch[1].replace(/,/g, "")))
      : NaN;
    const silverKg = silverMatch
      ? Math.round(Number(silverMatch[1].replace(/,/g, "")))
      : NaN;

    if (
      !Number.isFinite(gold10g) ||
      !Number.isFinite(silverKg) ||
      gold10g < 100000 ||
      gold10g > 250000 ||
      silverKg < 150000 ||
      silverKg > 600000
    ) {
      return null;
    }

    return {
      gold10g,
      silverKg,
      goldChange24hPct: null,
      goldChange24hAmount10g: null,
      silverChange24hPct: null,
      silverChange24hAmountKg: null,
      asOf: new Date().toISOString(),
      source: "All India Bullion · Mumbai 24K/999 reference · GST excluded"
    };
  } catch {
    return null;
  }
}
/**
 * Secondary source: GoldPrice.org's INR JSON feed.
 * This is an Indian INR spot-derived fallback, not a Mumbai jeweller quote.
 */
async function fromIndianSpotFeed(): Promise<MetalQuote | null> {
  try {
    const res = await fetch("https://data-asg.goldprice.org/dbXRates/INR", {
      headers: { Accept: "application/json", "User-Agent": UA },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      items?: Array<{
        xauPrice?: unknown;
        xagPrice?: unknown;
        xauClose?: unknown;
        xagClose?: unknown;
      }>;
    };
    const item = json.items?.[0];
    if (!item) return null;

    const xau = Number(item.xauPrice);
    const xag = Number(item.xagPrice);
    if (!Number.isFinite(xau) || !Number.isFinite(xag) || xau <= 0 || xag <= 0) {
      return null;
    }

    const xauClose = Number(item.xauClose);
    const xagClose = Number(item.xagClose);
    const gold10g = Math.round((xau / TROY_OUNCE_GRAMS) * 10);
    const silverKg = Math.round((xag / TROY_OUNCE_GRAMS) * 1000);
    const goldPrev = Number.isFinite(xauClose)
      ? (xauClose / TROY_OUNCE_GRAMS) * 10
      : null;
    const silverPrev = Number.isFinite(xagClose)
      ? (xagClose / TROY_OUNCE_GRAMS) * 1000
      : null;

    return {
      gold10g,
      silverKg,
      goldChange24hAmount10g:
        goldPrev != null ? Math.round(gold10g - goldPrev) : null,
      goldChange24hPct:
        goldPrev != null
          ? Math.round(((gold10g - goldPrev) / goldPrev) * 10000) / 100
          : null,
      silverChange24hAmountKg:
        silverPrev != null ? Math.round(silverKg - silverPrev) : null,
      silverChange24hPct:
        silverPrev != null
          ? Math.round(((silverKg - silverPrev) / silverPrev) * 10000) / 100
          : null,
      asOf: new Date().toISOString(),
      source: "GoldPrice.org · INR spot"
    };
  } catch {
    return null;
  }
}

/**
 * Last-resort source: Google Mumbai search.
 * Used only when the structured India feeds are unavailable.
 */
async function fromMumbaiGoogleSearch(): Promise<MetalQuote | null> {
  const googleSearch = async (query: string) => {
    const url = `https://www.google.com/search?hl=en-IN&gl=IN&gbv=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": UA,
        "Accept-Language": "en-IN,en;q=0.9"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
    return res.ok ? await res.text() : "";
  };

  const numbers = (html: string) =>
    [...html.matchAll(/₹\s*([\d,]+(?:\.\d+)?)/g)]
      .map((m) => Number(m[1].replace(/,/g, "")))
      .filter(Number.isFinite);

  try {
    const [goldHtml, silverHtml] = await Promise.all([
      googleSearch("gold price in mumbai today 24k per 10 gram"),
      googleSearch("silver price in mumbai today 999 per kg")
    ]);

    const gold = numbers(goldHtml).find((v) => v >= 100000 && v <= 250000);
    const silver = numbers(silverHtml).find((v) => v >= 150000 && v <= 600000);
    if (gold == null || silver == null) return null;

    return {
      gold10g: Math.round(gold),
      silverKg: Math.round(silver),
      goldChange24hPct: null,
      goldChange24hAmount10g: null,
      silverChange24hPct: null,
      silverChange24hAmountKg: null,
      asOf: new Date().toISOString(),
      source: "Google Search · Mumbai INR"
    };
  } catch {
    return null;
  }
}

async function getIndianMetalPrices(): Promise<MetalQuote | null> {
  return (
    (await fromIndiaRateApi()) ??
    (await fromIndianSpotFeed()) ??
    (await fromMumbaiGoogleSearch())
  );
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

    const {
      gold10g,
      silverKg,
      goldChange24hPct,
      goldChange24hAmount10g,
      silverChange24hPct,
      silverChange24hAmountKg,
      asOf,
      source
    } = effective;

    const goldSignal =
      gold10g <= goldDiscount40Price10g ? "BUY" : "WAIT";

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
  }
);

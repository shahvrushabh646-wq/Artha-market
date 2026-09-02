import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Lightbulb } from "lucide-react";
import { SymbolSearch } from "@/components/symbol-search";
import { IndexCard, MoverRow, Panel, Section, SkeletonBlock } from "@/components/widgets";
import { DATA_NOTE } from "@/lib/market/config";
import { getMarketClock } from "@/lib/market/math";
import { fetchDashboard } from "@/lib/market/server";

export const Route = createFileRoute("/")({ component: Home });
async function fetchIndianMetalPrices(): Promise<MetalPrices> {
  const apiKey = process.env.METALS_DEV_API_KEY;

  if (!apiKey) {
    throw new Error("METALS_DEV_API_KEY is missing");
  }

  const url =
    `https://api.metals.dev/v1/latest` +
    `?api_key=${encodeURIComponent(apiKey)}` +
    `&currency=INR` +
    `&unit=g`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Metals.Dev HTTP ${res.status}`);
  }

  const raw = await res.json();

  if (raw?.status !== "success") {
    throw new Error(
      raw?.error_message || "Metals.Dev API request failed"
    );
  }

  const goldPerGram = Number(raw?.metals?.gold);
  const silverPerGram = Number(raw?.metals?.silver);

  if (!Number.isFinite(goldPerGram) || !Number.isFinite(silverPerGram)) {
    throw new Error("Gold/Silver price missing from Metals.Dev response");
  }

  return {
    gold10g: goldPerGram * 10,
    silverKg: silverPerGram * 1000,
    asOf: raw?.timestamp ?? null,
    source: "Metals.Dev",
  };
}

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { normalizeSymbol } from "@/lib/market/config";

function cleanSymbols(symbols: string[]) {
  return Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean)));
}

export const getCloudWatchlist = createServerFn({ method: "GET" }).handler(async (): Promise<string[]> => {
  const sql = await getSql();
  const rows = await sql.query<{ symbols: unknown }>(
    "select symbols from artha_watchlist where id = 1 limit 1",
  );
  const value = rows[0]?.symbols;
  return Array.isArray(value) ? cleanSymbols(value.map(String)) : [];
});

export const saveCloudWatchlist = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ symbols: z.array(z.string()).max(500) }).parse(data))
  .handler(async ({ data }): Promise<string[]> => {
    const symbols = cleanSymbols(data.symbols);
    const sql = await getSql();
    await sql.query(
      `insert into artha_watchlist (id, symbols, updated_at)
       values (1, $1::jsonb, now())
       on conflict (id) do update set symbols = excluded.symbols, updated_at = now()`,
      [JSON.stringify(symbols)],
    );
    return symbols;
  });

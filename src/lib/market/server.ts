                        async function yahooSpark(symbols: string[]): Promise<Quote[]> {
  const unique = [...new Set(symbols.filter(Boolean))];
  const out: Quote[] = [];

  for (const symbol of unique) {
    try {
      const key = `spark:${symbol}`;
      const raw = await cached(key, 45_000, async () => {
        const q = new URLSearchParams({
          symbols: symbol,
          range: "1d",
          interval: "1d",
        });

        return fetchJson(
          `https://query2.finance.yahoo.com/v7/finance/spark?${q}`,
        );
      });

      const spark = asRecord(asRecord(raw)?.spark);
      const result = Array.isArray(spark?.result) ? spark.result : [];

      const item = result.length > 0 ? asRecord(result[0]) : null;
      const response = Array.isArray(item?.response)
        ? asRecord(item.response[0])
        : null;

      const meta = (asRecord(response?.meta) ?? {}) as YahooMeta;
      const quote = quoteFromMeta(meta, symbol);

      if (quote.price != null && quote.price > 0) {
        out.push(quote);
        continue;
      }
    } catch {
      // Use chart fallback below.
    }

    // Fallback: Yahoo Chart API
    try {
      const raw = await yahooChart(symbol, "5d", "1d");
      const parsed = parseBars(raw);

      const quote = quoteFromMeta(parsed.meta, symbol);

      if (
        (quote.price == null || quote.price <= 0) &&
        parsed.bars.length > 0
      ) {
        const last = parsed.bars[parsed.bars.length - 1];

        out.push({
          ...quote,
          symbol,
          price: last.c,
          previousClose: quote.previousClose ?? null,
          change: quote.change,
          changePct: quote.changePct,
          lastPriceTime: last.t,
          ok: true,
        });
      } else {
        out.push(quote);
      }
    } catch {
      out.push(emptyQuote(symbol));
    }
  }

  return out;
                        }

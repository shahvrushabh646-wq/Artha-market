import { useMemo } from "react";

type ProfitRow = { quarter: string; profit: string };
type CountryRow = { flag: string; country: string; percentage: string };

type Props = {
  profits?: ProfitRow[];
  countries?: CountryRow[];
};

/**
 * Standalone tables for quarterly profit/loss and country-wise business.
 * Sr. No. is intentionally omitted from both tables.
 * The parent component should supply only publicly verified values.
 */
export function QuarterlyCountryInsights({ profits = [], countries = [] }: Props) {
  const quarterRows = useMemo(() => profits.slice(-4), [profits]);
  const countryRows = useMemo(() => countries, [countries]);

  return (
    <section className="mt-5 space-y-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">
          છેલ્લા 4 ક્વાર્ટરનો નેટ પ્રોફિટ / લોસ
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-subtle">
                <th className="px-2 py-2">ક્વાર્ટર</th>
                <th className="px-2 py-2 text-right">નેટ પ્રોફિટ / લોસ</th>
              </tr>
            </thead>
            <tbody>
              {quarterRows.length > 0 ? (
                quarterRows.map((row, index) => (
                  <tr key={`${row.quarter}-${index}`} className="border-b border-border/60">
                    <td className="px-2 py-2 text-fg">{row.quarter}</td>
                    <td className="px-2 py-2 text-right font-medium tabular text-fg">
                      {row.profit}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-2 py-3 text-muted">
                    છેલ્લાં 4 ક્વાર્ટરનો જાહેર ડેટા હાલમાં ઉપલબ્ધ નથી.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">
          દેશવાર બિઝનેસ
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-subtle">
                <th className="px-2 py-2">દેશ</th>
                <th className="px-2 py-2 text-right">બિઝનેસ %</th>
              </tr>
            </thead>
            <tbody>
              {countryRows.length > 0 ? (
                countryRows.map((row, index) => (
                  <tr key={`${row.country}-${index}`} className="border-b border-border/60">
                    <td className="px-2 py-2 whitespace-nowrap text-fg">
                      <span className="mr-2 text-lg" aria-hidden="true">{row.flag}</span>
                      {row.country}
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular text-fg">
                      {row.percentage}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-2 py-3 text-muted">
                    દેશવાર બિઝનેસ ટકાવારીનો જાહેર રીતે ચકાસી શકાય એવો ડેટા ઉપલબ્ધ નથી.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

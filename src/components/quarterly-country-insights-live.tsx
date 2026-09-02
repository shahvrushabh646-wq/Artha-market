import React from "react";

type QuarterlyRow = { quarter: string; period: string; value: string };
type CountryRow = { flag: string; country: string; percentage: string };

export function QuarterlyCountryInsights({
  profits = [],
  countries = [],
}: {
  profits?: QuarterlyRow[];
  countries?: CountryRow[];
}) {
  const quarterLabels = [
    ["Q1", "January–March"],
    ["Q2", "April–June"],
    ["Q3", "July–September"],
    ["Q4", "October–December"],
  ];

  return (
    <div className="mt-5 space-y-3">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">
          છેલ્લા 4 ક્વાર્ટરનો નેટ પ્રોફિટ / લોસ
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-subtle">
                <th className="px-2 py-2">ક્વાર્ટર</th>
                <th className="px-2 py-2">સમયગાળો</th>
                <th className="px-2 py-2 text-right">નેટ પ્રોફિટ / લોસ</th>
              </tr>
            </thead>
            <tbody>
              {profits.length > 0 ? profits.slice(-4).map((row, i) => (
                <tr key={`${row.quarter}-${i}`} className="border-b border-border/60">
                  <td className="px-2 py-2 font-medium text-fg">{row.quarter}</td>
                  <td className="px-2 py-2 text-muted">{row.period}</td>
                  <td className="px-2 py-2 text-right font-medium tabular text-fg">{row.value}</td>
                </tr>
              )) : quarterLabels.map(([quarter, period]) => (
                <tr key={quarter} className="border-b border-border/60">
                  <td className="px-2 py-2 font-medium text-fg">{quarter}</td>
                  <td className="px-2 py-2 text-muted">{period}</td>
                  <td className="px-2 py-2 text-right text-muted">ડેટા ઉપલબ્ધ નથી</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="text-[11px] uppercase tracking-[0.14em] text-subtle">
          દેશવાર બિઝનેસ
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[300px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-subtle">
                <th className="px-2 py-2">દેશ</th>
                <th className="px-2 py-2 text-right">બિઝનેસ %</th>
              </tr>
            </thead>
            <tbody>
              {countries.length > 0 ? countries.map((row) => (
                <tr key={row.country} className="border-b border-border/60">
                  <td className="px-2 py-2 whitespace-nowrap text-fg">
                    <span className="mr-2 text-lg">{row.flag}</span>{row.country}
                  </td>
                  <td className="px-2 py-2 text-right font-medium tabular text-fg">{row.percentage}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={2} className="px-2 py-3 text-muted">
                    જાહેર રીતે ચકાસી શકાય તેવી દેશવાર ટકાવારી ઉપલબ્ધ નથી.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default QuarterlyCountryInsights;

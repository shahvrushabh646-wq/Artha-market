import { useQuery } from "@tanstack/react-query";
import { fetchOwnership } from "@/lib/market/ownership";
import { Panel } from "./widgets";

type Row = { period: string; promoter: number | null; fii: number | null; dii: number | null; public: number | null; others: number | null; pledged: number | null; unpledged: number | null };

type Props = { symbol: string; companyName?: string };

const categories = [
  ["Promoter", "promoter"],
  ["FII", "fii"],
  ["DII", "dii"],
  ["Public", "public"],
  ["Others", "others"],
] as const;

function pct(v: number | null | undefined) { return typeof v === "number" && Number.isFinite(v) ? v : 0; }
function labelPeriod(v: string) { return v.replace(/\s+/g, " ").trim(); }

function Tabs({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div className="grid grid-cols-5 gap-1 rounded-full bg-surface-2 p-1">
    {["Q1", "Q2", "Q3", "Q4", "5 YEARS"].map(t => <button key={t} type="button" onClick={() => onChange(t)} className={`h-10 rounded-full text-xs font-semibold ${value === t ? "bg-white text-black shadow-sm" : "text-fg"}`}>{t}</button>)}
  </div>;
}

function ShareholdingBars({ rows, fiveYear }: { rows: Row[]; fiveYear: boolean }) {
  const shown = fiveYear ? rows.slice(-5) : rows.length ? [rows[rows.length - 1]] : [];
  if (!shown.length) return <Panel className="mt-3 p-6 text-center text-sm text-muted">Shareholding data unavailable.</Panel>;
  return <Panel className="mt-3 overflow-hidden p-4">
    <div className="mb-3 flex items-center justify-between"><span className="text-xs text-muted">{fiveYear ? "Percentage of total shares · 5 years" : labelPeriod(shown[0].period)}</span><span className="text-xs text-muted">100%</span></div>
    <div className={`flex items-end justify-center gap-4 ${fiveYear ? "min-h-64" : "min-h-64"}`}>
      {shown.map((r, i) => <div key={`${r.period}-${i}`} className="flex h-60 flex-1 max-w-28 flex-col justify-end">
        <div className="flex h-full flex-col justify-end overflow-hidden rounded-t-md bg-white/15">
          {categories.slice().reverse().map(([name, key]) => { const v = pct(r[key]); return v > 0 ? <div key={key} title={undefined} className="w-full border-b border-black/10 bg-white" style={{ height: `${v}%`, opacity: key === "promoter" ? 1 : key === "fii" ? .82 : key === "dii" ? .66 : key === "public" ? .5 : .34 }} /> : null; })}
        </div>
        <div className="mt-2 text-center text-[11px] text-muted">{labelPeriod(r.period)}</div>
      </div>)}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted sm:grid-cols-5">
      {categories.map(([name, key]) => <div key={key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-white" style={{ opacity: key === "promoter" ? 1 : key === "fii" ? .82 : key === "dii" ? .66 : key === "public" ? .5 : .34 }} />{name} %</div>)}
    </div>
  </Panel>;
}

function PledgePie({ row }: { row: Row | null }) {
  const pledged = Math.max(0, Math.min(100, pct(row?.pledged)));
  const unpledged = Math.max(0, 100 - pledged);
  const r = 78; const c = 2 * Math.PI * r; const dash = (pledged / 100) * c;
  if (!row || row.pledged == null) return <Panel className="mt-3 p-6 text-center text-sm text-muted">Pledge data unavailable.</Panel>;
  return <Panel className="mt-3 p-4">
    <div className="flex flex-col items-center">
      <div className="relative h-52 w-52">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <circle cx="100" cy="100" r={r} fill="none" stroke="orange" strokeWidth="32" />
          <circle cx="100" cy="100" r={r} fill="none" stroke="blue" strokeWidth="32" strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="butt" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-semibold">{pledged.toFixed(2)}%</span><span className="text-xs text-muted">Pledged</span></div>
      </div>
      <div className="mt-2 flex w-full justify-center gap-6 text-xs"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />Pledged {pledged.toFixed(2)}%</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />Unpledged {unpledged.toFixed(2)}%</span></div>
      <div className="mt-2 text-xs text-muted">{labelPeriod(row.period)}</div>
    </div>
  </Panel>;
}

export function OwnershipHistory({ symbol, companyName }: Props) {
  const q = useQuery({ queryKey: ["ownership-history", symbol, companyName], queryFn: () => fetchOwnership({ data: { symbol, companyName } }), staleTime: 30 * 60_000, gcTime: 60 * 60_000, retry: 1, refetchOnWindowFocus: false });
  const [shareTab, setShareTab] = useState("Q4");
  const [pledgeTab, setPledgeTab] = useState("Q4");
  if (q.isLoading) return <div className="mt-5 space-y-4"><Panel className="h-12 animate-pulse" /><Panel className="h-72 animate-pulse" /></div>;
  const data = q.data;
  const quarters = data?.quarters ?? [];
  const years = data?.years ?? [];
  const latest = quarters.at(-1) ?? null;
  const pick = (tab: string, list: Row[]) => tab === "5 YEARS" ? list : list.length ? (tab === "Q1" ? list.at(-4) : tab === "Q2" ? list.at(-3) : tab === "Q3" ? list.at(-2) : list.at(-1)) ?? null : null;
  const shareRows = shareTab === "5 YEARS" ? years : [pick(shareTab, quarters)].filter(Boolean) as Row[];
  const pledgeRow = pledgeTab === "5 YEARS" ? (years.find(r => r.pledged != null) ?? latest) : pick(pledgeTab, quarters) ?? latest;
  return <div className="mt-6 space-y-8">
    <section>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-display text-2xl">Shareholding</h2><span className="text-xs tracking-[0.12em] text-muted">QUARTERLY / 5 YEAR</span></div>
      <Tabs value={shareTab} onChange={setShareTab} />
      <ShareholdingBars rows={shareRows} fiveYear={shareTab === "5 YEARS"} />
    </section>
    <section>
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-display text-2xl">Promoter Pledge</h2><span className="text-xs tracking-[0.12em] text-muted">QUARTERLY / 5 YEAR</span></div>
      <Tabs value={pledgeTab} onChange={setPledgeTab} />
      <PledgePie row={pledgeRow} />
    </section>
    <p className="text-[10px] text-subtle">Updated automatically · {data?.source ?? "Live ownership sources"}</p>
  </div>;
}

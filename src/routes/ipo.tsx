import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Panel, SkeletonBlock } from "@/components/widgets";
import { fetchOpenIpos } from "@/lib/market/ipo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ipo")({
  validateSearch: (s: Record<string, unknown>) => ({ id: typeof s.id === "string" ? s.id : undefined }),
  component: IpoPage,
});

function money(v: number | null) {
  return v == null ? "માહિતી ઉપલબ્ધ નથી" : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })} કરોડ`;
}
function date(v: string | null) {
  return v ? new Date(`${v}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "માહિતી ઉપલબ્ધ નથી";
}

const flag = (country: string) => ({
  India: "🇮🇳",
  "United States": "🇺🇸",
  "United Kingdom": "🇬🇧",
  "Other countries": "🌍",
}[country] ?? "🌍");

const gujaratiCountryBusiness = (country: string, business: string) => {
  const known: Record<string, string> = {
    Jewellery: "જ્વેલરી વ્યવસાય",
    "Healthcare services": "હેલ્થકેર સેવાઓ",
    "Luxury fashion": "લક્ઝરી ફેશન",
  };
  return known[business] ?? business;
};

function IpoPage() {
  const { id } = Route.useSearch();
  const query = useQuery({ queryKey: ["open-ipos"], queryFn: () => fetchOpenIpos({ data: {} }), refetchInterval: 60_000 });
  if (id) return <IpoDetail id={id} ipos={query.data ?? []} loading={query.isLoading} onRefresh={() => void query.refetch()} />;
  return <IpoList ipos={query.data ?? []} loading={query.isLoading} onRefresh={() => void query.refetch()} />;
}

function IpoList({ ipos, loading, onRefresh }: { ipos: Awaited<ReturnType<typeof fetchOpenIpos>>; loading: boolean; onRefresh: () => void }) {
  return <div>
    <div className="flex items-end justify-between gap-3"><div><h1 className="font-display text-3xl tracking-tight">IPO</h1><p className="mt-1 text-sm text-muted">હાલમાં ખુલ્લા Mainboard અને SME IPO</p></div><button type="button" onClick={onRefresh} className="inline-flex size-10 items-center justify-center rounded-lg bg-surface-2 text-muted hover:text-fg" aria-label="Refresh IPO data"><RefreshCw className="size-4" /></button></div>
    <div className="mt-5 space-y-3">
      {loading && !ipos.length ? <><SkeletonBlock className="h-32"/><SkeletonBlock className="h-32"/><SkeletonBlock className="h-32"/></> : ipos.map(ipo => <Link key={ipo.id} to="/ipo" search={{ id: ipo.id }} className="block"><Panel className="p-4 transition-colors hover:bg-surface-2">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-medium text-fg">{ipo.name}</div><div className="mt-1 text-xs text-muted">બંધ તારીખ: {date(ipo.closeDate)}</div></div><div className="flex shrink-0 flex-col items-end gap-1"><span className="rounded-full bg-up/15 px-2 py-1 text-[10px] font-semibold uppercase text-up">Open</span><span className="rounded-full bg-accent/15 px-2 py-1 text-[10px] font-semibold text-accent">{ipo.type}</span></div></div>
        <div className="mt-4 grid grid-cols-3 gap-2"><Mini label="Minimum Subscription" value={money(ipo.minSubscription)} /><Mini label="Subscription" value={ipo.subscription == null ? "માહિતી ઉપલબ્ધ નથી" : `${ipo.subscription}x`} /><Mini label="GMP" value={ipo.gmpPct == null ? "Verifying" : `+${ipo.gmpPct}%`} green={ipo.gmpPct != null} /></div>
      </Panel></Link>)}
    </div>
    <p className="mt-4 text-[11px] text-subtle">GMP unofficial grey-market data છે. Artha percentage ત્યારે જ green માં બતાવે છે જ્યારે independent sources વચ્ચે consensus મળે.</p>
  </div>;
}

function IpoDetail({ id, ipos, loading, onRefresh }: { id: string; ipos: Awaited<ReturnType<typeof fetchOpenIpos>>; loading: boolean; onRefresh: () => void }) {
  const ipo = ipos.find(x => x.id === id);
  const [showSources, setShowSources] = useState(false);
  if (loading && !ipo) return <div className="space-y-4"><SkeletonBlock className="h-12"/><SkeletonBlock className="h-28"/><SkeletonBlock className="h-96"/></div>;
  if (!ipo) return <Panel><p className="text-sm text-muted">IPO data unavailable.</p><Link to="/ipo" search={{}} className="mt-3 inline-block text-sm text-accent">Back to IPO</Link></Panel>;

  return <div>
    <div className="flex items-center justify-between gap-3"><Link to="/ipo" search={{}} className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4"/> IPO</Link><button type="button" onClick={onRefresh} className="inline-flex size-10 items-center justify-center rounded-lg bg-surface-2 text-muted hover:text-fg"><RefreshCw className="size-4"/></button></div>
    <h1 className="mt-5 font-display text-2xl tracking-tight">{ipo.name} IPO</h1>
    <div className="mt-4 grid grid-cols-2 gap-2"><Panel className="p-4"><div className="text-xs text-muted">Closing Date</div><div className="mt-1 tabular text-lg text-accent">{date(ipo.closeDate)}</div></Panel><Panel className="p-4"><div className="text-xs text-muted">GMP Today</div><div className={cn("mt-1 tabular text-lg font-semibold", ipo.gmpPct != null ? "text-up" : "text-muted")}>{ipo.gmpPct == null ? "Verifying" : `+${ipo.gmpPct}%`}</div><div className="mt-0.5 text-[10px] text-subtle">Unofficial</div></Panel></div>

    <Section title="IPO વિશે માહિતી">
      <Info n="1" title="કંપનીનું નામ" value={ipo.name}/>
      <Info n="2" title="કંપનીનું સ્થાન" value={ipo.city && ipo.state ? `${ipo.city}, ${ipo.state}` : "માહિતી ઉપલબ્ધ નથી"}/>
      <Info n="3" title="કંપની શું કરે છે" value={ipo.business ?? "કંપનીના વ્યવસાયની verified માહિતી ઉપલબ્ધ નથી."}/>

      <div className="border-b border-border py-4">
        <div className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-xs font-semibold text-accent">4</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-fg">કયા દેશોમાં બિઝનેસ કરે છે અને વેચાણ કેટલું છે</div>
            {ipo.countries.length ? <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-[1.05fr_1.25fr_.7fr] bg-surface-2 px-3 py-2 text-[11px] font-semibold text-muted">
                <div>દેશ</div><div>બિઝનેસ</div><div className="text-right">વેચાણ %</div>
              </div>
              {ipo.countries.map(c => <div key={c.country} className="grid grid-cols-[1.05fr_1.25fr_.7fr] items-center border-t border-border px-3 py-3 text-xs">
                <div className="flex items-center gap-2 font-medium text-fg"><span className="text-base">{flag(c.country)}</span><span>{c.country === "India" ? "ભારત" : c.country === "United States" ? "અમેરિકા" : c.country === "United Kingdom" ? "યુનાઇટેડ કિંગડમ" : "અન્ય દેશો"}</span></div>
                <div className="text-muted">{gujaratiCountryBusiness(c.country, c.business)}</div>
                <div className="text-right tabular font-semibold text-fg">{c.salesPct == null ? "—" : `${c.salesPct}%`}</div>
              </div>)}
            </div> : <div className="mt-1 text-sm leading-6 text-muted">દેશવાર verified વેચાણની માહિતી ઉપલબ્ધ નથી.</div>}
          </div>
        </div>
      </div>

      <div className="border-b border-border py-4">
        <div className="flex gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-xs font-semibold text-accent">5</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-fg">છેલ્લા 3 વર્ષનો નફો</div>
            {ipo.profits.length ? <div className="mt-3 overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-2 bg-surface-2 px-3 py-2 text-[11px] font-semibold text-muted"><div>નાણાકીય વર્ષ</div><div className="text-right">નફો</div></div>
              {ipo.profits.map(p => <div key={p.year} className="grid grid-cols-2 border-t border-border px-3 py-3 text-xs"><div className="font-medium text-fg">{p.year}</div><div className={cn("text-right tabular font-semibold", p.value != null && p.value < 0 ? "text-down" : "text-up")}>{p.value == null ? "માહિતી ઉપલબ્ધ નથી" : money(p.value)}</div></div>)}
            </div> : <div className="mt-1 text-sm leading-6 text-muted">છેલ્લા 3 વર્ષના verified profit figures ઉપલબ્ધ નથી.</div>}
          </div>
        </div>
      </div>

      <Info n="6" title="IPO કેટલો subscribe થયો" value={ipo.subscription == null ? "Live verified subscription data ઉપલબ્ધ નથી." : `${ipo.subscription}x`}/>
    </Section>

    <Panel className="mt-4 p-4"><button type="button" onClick={() => setShowSources(v => !v)} className="text-sm font-medium text-fg">GMP source verification {showSources ? "▲" : "▼"}</button>{showSources ? <div className="mt-3 space-y-2">{ipo.gmpSources.map(s => <div key={s.source} className="flex items-center justify-between text-xs"><span className="text-muted">{s.source}</span><span className="tabular text-fg">{s.pct == null ? "No value" : `${s.pct}%`}</span></div>)}</div> : null}</Panel>
    <p className="mt-4 text-[11px] text-subtle">GMP grey-market indicator છે, official NSE/BSE price નથી અને guaranteed listing return નથી. Data verification time: {new Date(ipo.verifiedAt).toLocaleString("en-IN")}.</p>
  </div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="mt-6"><h2 className="mb-3 font-display text-xl tracking-tight">{title}</h2><Panel className="p-4">{children}</Panel></section>; }
function Info({ n, title, value }: { n: string; title: string; value: string }) { return <div className="border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0"><div className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-xs font-semibold text-accent">{n}</span><div className="min-w-0"><div className="text-sm font-medium text-fg">{title}</div><div className="mt-1 text-sm leading-6 text-muted">{value}</div></div></div></div>; }
function Mini({ label, value, green }: { label: string; value: string; green?: boolean }) { return <div className="rounded-lg bg-surface-2 p-2.5"><div className="text-[10px] uppercase tracking-wide text-subtle">{label}</div><div className={cn("mt-1 truncate text-sm tabular", green ? "text-up" : "text-fg")}>{value}</div></div>; }

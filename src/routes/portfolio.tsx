import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, MoreVertical, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, Panel } from "@/components/widgets";
import { Signed } from "@/components/price";
import { displaySymbol } from "@/lib/market/config";
import { fmtCurrency } from "@/lib/market/math";
import { fetchQuotes } from "@/lib/market/server";
import { addPortfolioAccount, addPortfolioTransaction, deletePortfolioTransaction, getPortfolioAccounts, getPortfolioTransactions, renamePortfolioAccount } from "@/lib/market/angel-portfolio";

export const Route = createFileRoute("/portfolio")({ component: PortfolioPage });

type Account = { id: string; name: string; sortOrder: number };
type Tx = { id: string; broker: string; brokerTradeId: string | null; symbol: string; exchange: string; company: string; side: "BUY" | "SELL"; quantity: number; price: number; tradeDate: string; charges: number; source: string };
type Holding = { symbol: string; exchange: string; qty: number; avg: number; invested: number; realized: number };

const key = (id: string) => `artha-portfolio-transactions-${id}`;
const read = (id: string): Tx[] => {
  if (typeof window === "undefined" || !id) return [];
  try {
    const x = JSON.parse(localStorage.getItem(key(id)) || "[]");
    return Array.isArray(x) ? x : [];
  } catch { return []; }
};
const write = (id: string, x: Tx[]) => { try { localStorage.setItem(key(id), JSON.stringify(x)); } catch {} };

function PortfolioPage() {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [tab, setTab] = useState<"overview" | "equity" | "sold" | "history">("equity");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newAccount, setNewAccount] = useState("");
  const [showTx, setShowTx] = useState(false);
  const [tx, setTx] = useState({ symbol: "", exchange: "NSE", side: "BUY" as "BUY" | "SELL", quantity: "", price: "", tradeDate: new Date().toISOString().slice(0, 10), charges: "0" });

  const aq = useQuery({ queryKey: ["portfolio-accounts"], queryFn: () => getPortfolioAccounts(), staleTime: 300000 });
  const accounts = (aq.data || []) as Account[];
  useEffect(() => { if (!accountId && accounts[0]) setAccountId(accounts[0].id); }, [accounts, accountId]);
  const active = accounts.find(a => a.id === accountId);

  const tq = useQuery({
    queryKey: ["portfolio-transactions", accountId], enabled: !!accountId, refetchInterval: 60000,
    queryFn: async () => {
      const remote = await getPortfolioTransactions({ data: { accountId } });
      const all = [...read(accountId), ...(remote as Tx[])];
      const m = new Map<string, Tx>(); all.forEach(t => m.set(t.id, t));
      return [...m.values()].sort((a, b) => `${b.tradeDate}-${b.id}`.localeCompare(`${a.tradeDate}-${a.id}`));
    }
  });
  const transactions = (tq.data || []) as Tx[];
  const symbols = [...new Set(transactions.map(t => t.symbol))];
  const quotes = useQuery({ queryKey: ["portfolio-quotes", symbols], enabled: symbols.length > 0, refetchInterval: 60000, queryFn: () => fetchQuotes({ data: { symbols } }) });
  const qm = new Map((quotes.data || []).map(q => [q.symbol, q]));

  const allHoldings = useMemo(() => build(transactions), [transactions]);
  const holdings = allHoldings.filter(h => h.qty > 0.000001);
  const sold = transactions.filter(t => t.side === "SELL");
  const invested = holdings.reduce((s, h) => s + h.invested, 0);
  const current = holdings.reduce((s, h) => s + h.qty * (qm.get(h.symbol)?.price ?? h.avg), 0);
  const unreal = current - invested;
  const realized = allHoldings.reduce((s, h) => s + h.realized, 0);
  const totalPl = unreal + realized;
  const ret = invested ? totalPl / invested * 100 : null;
  const todayPl = 0;
  const filtered = holdings.filter(h => displaySymbol(h.symbol).toLowerCase().includes(search.trim().toLowerCase()) || h.symbol.toLowerCase().includes(search.trim().toLowerCase()));

  async function rename() {
    if (!editing || !editName.trim()) return;
    try { await renamePortfolioAccount({ data: { id: editing, name: editName.trim() } }); setEditing(null); await qc.invalidateQueries({ queryKey: ["portfolio-accounts"] }); toast("Account name updated"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not update account"); }
  }
  async function addAccount() {
    if (!newAccount.trim()) return;
    try { const a = await addPortfolioAccount({ data: { name: newAccount.trim() } }); setNewAccount(""); setShowAdd(false); await qc.invalidateQueries({ queryKey: ["portfolio-accounts"] }); setAccountId(a.id); toast("Account added"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not add account"); }
  }
  function openBuy(symbol = "", price = "") {
    setTx({ symbol, exchange: "NSE", side: "BUY", quantity: "", price, tradeDate: new Date().toISOString().slice(0, 10), charges: "0" });
    setShowTx(true);
  }
  function openSell(h: Holding) {
    const ltp = qm.get(h.symbol)?.price ?? h.avg;
    setTx({ symbol: h.symbol, exchange: h.exchange, side: "SELL", quantity: "", price: String(ltp), tradeDate: new Date().toISOString().slice(0, 10), charges: "0" });
    setShowTx(true);
  }
  async function saveTx() {
    const q = Number(tx.quantity), p = Number(tx.price), c = Number(tx.charges || 0);
    const symbol = tx.symbol.trim().toUpperCase();
    if (!accountId || !symbol || !Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p < 0 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(tx.tradeDate)) { toast("Enter valid transaction details"); return; }
    if (tx.side === "SELL") {
      const h = holdings.find(x => x.symbol === symbol && x.exchange === tx.exchange);
      if (!h || q > h.qty + 0.000001) { toast(`You can sell up to ${h ? trim(h.qty) : "0"} shares`); return; }
    }
    try {
      const r = await addPortfolioTransaction({ data: { accountId, symbol, exchange: tx.exchange, side: tx.side, quantity: q, price: p, tradeDate: tx.tradeDate, charges: c } });
      const item: Tx = { id: String(r.id), broker: "manual", brokerTradeId: String(r.id), symbol, exchange: tx.exchange, company: symbol, side: tx.side, quantity: q, price: p, tradeDate: tx.tradeDate, charges: Number.isFinite(c) && c >= 0 ? c : 0, source: "manual" };
      write(accountId, [...read(accountId).filter(x => x.id !== item.id), item]);
      setShowTx(false); setTx({ ...tx, symbol: "", quantity: "", price: "", charges: "0" });
      await qc.invalidateQueries({ queryKey: ["portfolio-transactions", accountId] }); toast(`${item.side} added`);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save transaction"); }
  }
  async function remove(id: string) {
    if (!confirm("Delete this transaction?")) return;
    try { await deletePortfolioTransaction({ data: { accountId, id } }); write(accountId, read(accountId).filter(x => x.id !== id)); await qc.invalidateQueries({ queryKey: ["portfolio-transactions", accountId] }); toast("Transaction deleted"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete transaction"); }
  }

  if (aq.isLoading) return <div className="py-12 text-center text-sm text-muted">Loading portfolio…</div>;

  return <div className="mx-auto max-w-6xl pb-10">
    <header className="sticky top-0 z-20 -mx-4 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl tracking-tight sm:text-3xl">Holdings</h1>
            {active && <button onClick={() => { setEditing(active.id); setEditName(active.name); }} className="mt-1 flex items-center gap-1 text-xs text-muted hover:text-fg">{active.name}<ChevronDown className="size-3.5" /></button>}
          </div>
          <p className="mt-0.5 text-xs text-muted sm:text-sm">Your equity portfolio</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => openBuy()} className="flex size-10 items-center justify-center rounded-full border border-border bg-surface-2 hover:bg-surface-3" aria-label="Add transaction"><Plus className="size-5" /></button>
          <button onClick={() => setShowAdd(true)} className="flex size-10 items-center justify-center rounded-full border border-border bg-surface-2 hover:bg-surface-3" aria-label="Add account"><MoreVertical className="size-5" /></button>
        </div>
      </div>
    </header>

    {accounts.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{accounts.map(a => <button key={a.id} onClick={() => { setAccountId(a.id); setTab("equity"); }} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${accountId === a.id ? "bg-fg text-bg" : "border border-border text-muted"}`}>{a.name}</button>)}</div>}

    {editing && <div className="mt-3 flex gap-2 rounded-xl border border-border bg-surface-2 p-3"><input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void rename(); if (e.key === "Escape") setEditing(null); }} className="min-w-0 flex-1 rounded-lg border bg-bg px-3 py-2 text-sm"/><Button size="sm" onClick={rename}>Save</Button><button onClick={() => setEditing(null)} className="px-2 text-muted"><X className="size-4"/></button></div>}

    {active && <>
      <section className="mt-4 overflow-hidden rounded-2xl bg-slate-800 text-white shadow-sm">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="text-xs text-slate-300">Current value</div>
              <div className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{fmtCurrency(current)}</div>
              <div className="mt-2 flex items-center gap-2 text-sm"><span className={totalPl >= 0 ? "text-emerald-300" : "text-red-300"}>↓ {totalPl >= 0 ? "Overall Profit" : "Overall Loss"}</span><Signed value={totalPl} as="currency" className={totalPl >= 0 ? "text-emerald-300" : "text-red-300"}/><span className="text-slate-300">(</span><Signed value={ret} as="percent" className={totalPl >= 0 ? "text-emerald-300" : "text-red-300"}/><span className="text-slate-300">)</span></div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-300">Today's P&amp;L</div>
              <div className={`mt-1 text-lg font-semibold ${todayPl >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtCurrency(todayPl)}</div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 sm:grid-cols-4">
            <DarkMetric label="Invested value" value={fmtCurrency(invested)} />
            <DarkMetric label="Current value" value={fmtCurrency(current)} />
            <DarkMetric label="Unrealised" value={<Signed value={unreal} as="currency" />} />
            <DarkMetric label="Realised" value={<Signed value={realized} as="currency" />} />
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-white/10">
          <button onClick={() => setTab("overview")} className={`py-3 text-sm font-medium ${tab === "overview" ? "bg-white/10 text-cyan-300" : "text-slate-300"}`}>ANALYZE</button>
          <button onClick={() => openBuy()} className="border-l border-white/10 py-3 text-sm font-medium text-cyan-300">+ BUY / SELL</button>
        </div>
      </section>

      <div className="mt-5 flex gap-6 overflow-x-auto border-b border-border">
        <TopTab active={tab === "overview"} onClick={() => setTab("overview")} label="Overview" />
        <TopTab active={tab === "equity"} onClick={() => setTab("equity")} label="Equity" />
        <TopTab active={tab === "sold"} onClick={() => setTab("sold")} label="Sold" />
        <TopTab active={tab === "history"} onClick={() => setTab("history")} label="History" />
      </div>

      {(tab === "overview" || tab === "equity") && <>
        <div className="mt-4 flex gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2.5"><Search className="size-5 shrink-0 text-muted"/><input value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" placeholder="Search stocks by company"/><SlidersHorizontal className="size-4 shrink-0 text-muted"/></div>
        </div>
        <div className="mt-3 flex items-center justify-between px-1 text-xs text-muted"><span>{filtered.length} holding{filtered.length === 1 ? "" : "s"}</span><span>Updated live</span></div>
        <Holdings rows={filtered} qm={qm} onBuy={h => openBuy(h.symbol, String(qm.get(h.symbol)?.price ?? h.avg))} onSell={openSell} />
      </>}
      {tab === "sold" && <Transactions rows={sold} onDelete={remove} emptyTitle="No SELL transactions" emptyBody="When you sell shares, every sell transaction will appear here."/>}
      {tab === "history" && <Transactions rows={transactions} onDelete={remove} emptyTitle="No transactions" emptyBody="BUY and SELL activity will appear here date-wise."/>}
    </>}

    {showAdd && <Modal title="Add Portfolio Account" close={() => setShowAdd(false)}><input autoFocus value={newAccount} onChange={e => setNewAccount(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void addAccount(); }} className="w-full rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Account name"/><div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button><Button onClick={addAccount}>Add Account</Button></div></Modal>}
    {showTx && <Modal title={`${tx.side === "BUY" ? "Buy" : "Sell"} stock`} close={() => setShowTx(false)}><div className="space-y-3">
      <div className="grid grid-cols-2 gap-2"><button onClick={() => setTx({...tx, side: "BUY"})} className={`rounded-lg border py-2 text-sm font-semibold ${tx.side === "BUY" ? "border-up bg-up/10 text-up" : "border-border text-muted"}`}>BUY</button><button onClick={() => setTx({...tx, side: "SELL"})} className={`rounded-lg border py-2 text-sm font-semibold ${tx.side === "SELL" ? "border-down bg-down/10 text-down" : "border-border text-muted"}`}>SELL</button></div>
      <input value={tx.symbol} onChange={e => setTx({...tx, symbol: e.target.value.toUpperCase()})} className="w-full rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Stock symbol e.g. TCS"/>
      <div className="grid grid-cols-2 gap-2"><select value={tx.exchange} onChange={e => setTx({...tx, exchange: e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm"><option>NSE</option><option>BSE</option></select><input type="date" value={tx.tradeDate} onChange={e => setTx({...tx, tradeDate: e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm"/></div>
      <div className="grid grid-cols-2 gap-2"><input type="number" min="0.0001" value={tx.quantity} onChange={e => setTx({...tx, quantity: e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Quantity"/><input type="number" min="0" step="0.01" value={tx.price} onChange={e => setTx({...tx, price: e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Price"/></div>
      <input type="number" min="0" step="0.01" value={tx.charges} onChange={e => setTx({...tx, charges: e.target.value})} className="w-full rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Charges (optional)"/>
      {tx.side === "SELL" && tx.symbol && <div className="rounded-lg bg-surface-2 p-3 text-xs text-muted">Available: <strong className="text-fg">{trim(holdings.find(h => h.symbol === tx.symbol && h.exchange === tx.exchange)?.qty ?? 0)} shares</strong></div>}
      <Button className="w-full" onClick={saveTx}>{tx.side === "BUY" ? "Add BUY" : "Confirm SELL"}</Button>
    </div></Modal>}
  </div>;
}

function DarkMetric({label,value}:{label:string;value:ReactNode}) { return <div><div className="text-[11px] text-slate-400">{label}</div><div className="mt-0.5 text-sm font-semibold tabular text-white">{value}</div></div>; }
function TopTab({active,onClick,label}:{active:boolean;onClick:()=>void;label:string}) { return <button onClick={onClick} className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-semibold ${active ? "border-fg text-fg" : "border-transparent text-muted"}`}>{label}</button>; }

function Holdings({rows,qm,onBuy,onSell}:{rows:Holding[];qm:Map<string,any>;onBuy:(h:Holding)=>void;onSell:(h:Holding)=>void}) {
  if (!rows.length) return <div className="mt-3"><Panel className="p-8"><Empty title="No holdings" body="Add a BUY transaction to build your portfolio."/></Panel></div>;
  return <div className="mt-3 space-y-3">{rows.map(h => {
    const ltp = qm.get(h.symbol)?.price ?? h.avg;
    const value = h.qty * ltp;
    const pl = value - h.invested;
    const pct = h.invested ? pl / h.invested * 100 : null;
    return <div key={`${h.exchange}:${h.symbol}`} className="rounded-2xl border border-border bg-bg p-4 shadow-sm">
      <Link to="/stock" search={{symbol:h.symbol,period:"1Y"}} className="block">
        <div className="flex items-start justify-between gap-4">
          <div><div className="text-lg font-medium tracking-tight">{displaySymbol(h.symbol)}</div><div className="mt-1 text-xs text-muted">{trim(h.qty)} × Avg. {fmtCurrency(h.avg)}</div></div>
          <div className="text-right"><Signed value={pl} as="currency" className="text-base font-semibold"/><div className="mt-0.5 text-xs"><Signed value={pct} as="percent"/></div></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-y-3 text-sm sm:grid-cols-3"><Metric label="LTP" value={fmtCurrency(ltp)}/><Metric label="Current value" value={fmtCurrency(value)}/><Metric label="Invested" value={fmtCurrency(h.invested)}/></div>
      </Link>
      <div className="mt-4 flex gap-2 border-t border-border pt-3"><button onClick={() => onBuy(h)} className="flex-1 rounded-lg border border-up/40 bg-up/10 py-2 text-sm font-semibold text-up hover:bg-up/15">BUY</button><button onClick={() => onSell(h)} className="flex-1 rounded-lg border border-down/40 bg-down/10 py-2 text-sm font-semibold text-down hover:bg-down/15">SELL</button></div>
    </div>;
  })}</div>;
}

function Transactions({rows,onDelete,emptyTitle,emptyBody}:{rows:Tx[];onDelete:(id:string)=>void;emptyTitle:string;emptyBody:string}) {
  if (!rows.length) return <div className="mt-3"><Panel className="p-8"><Empty title={emptyTitle} body={emptyBody}/></Panel></div>;
  return <div className="mt-3 space-y-2">{rows.map(t => <Panel key={t.id} className="overflow-hidden"><div className="flex items-start justify-between gap-3 p-4"><div><div className="flex items-center gap-2"><span className={`rounded-md px-2 py-1 text-[11px] font-bold tracking-wide ${t.side === "BUY" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{t.side}</span><span className="text-[15px] font-semibold">{displaySymbol(t.symbol)}</span></div><div className="mt-1.5 text-xs text-muted">{t.exchange} · {formatDate(t.tradeDate)}</div></div><button onClick={() => onDelete(t.id)} aria-label="Delete transaction" className="rounded-md p-1.5 text-muted hover:text-down"><Trash2 className="size-4"/></button></div><div className="grid grid-cols-3 gap-3 border-t border-border px-4 py-3"><Metric label="Quantity" value={trim(t.quantity)}/><Metric label="Price" value={fmtCurrency(t.price)}/><Metric label="Value" value={fmtCurrency(t.quantity*t.price)}/></div>{t.charges > 0 && <div className="px-4 pb-3 text-[11px] text-muted">Charges: {fmtCurrency(t.charges)}</div>}</Panel>)}</div>;
}
function Metric({label,value}:{label:string;value:ReactNode}) { return <div><div className="text-[11px] text-muted">{label}</div><div className="mt-0.5 text-sm font-semibold tabular">{value}</div></div>; }
function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => {if(e.target===e.currentTarget)close()}}><Panel className="w-full max-w-md p-5"><div className="flex items-center justify-between"><h3 className="font-display text-xl">{title}</h3><button onClick={close} className="text-xl text-muted">×</button></div><div className="mt-5">{children}</div></Panel></div>; }
function trim(n:number) { return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/g,"").replace(/\.$/,""); }
function formatDate(s:string) { const d=new Date(`${s}T00:00:00`); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); }
function build(txs:Tx[]):Holding[] { const m=new Map<string,Holding>(); for(const t of [...txs].sort((a,b)=>a.tradeDate.localeCompare(b.tradeDate)||a.id.localeCompare(b.id))){ const k=`${t.exchange}:${t.symbol}`,h=m.get(k)||{symbol:t.symbol,exchange:t.exchange,qty:0,avg:0,invested:0,realized:0}; if(t.side==="BUY"){const nq=h.qty+t.quantity;h.avg=(h.avg*h.qty+t.price*t.quantity)/nq;h.qty=nq;h.invested=h.avg*h.qty;} else {const sellQty=Math.min(h.qty,t.quantity);h.realized+=t.price*sellQty-h.avg*sellQty-t.charges;h.qty=Math.max(0,h.qty-t.quantity);h.invested=h.avg*h.qty;} m.set(k,h);} return [...m.values()]; }

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MoreVertical, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, Panel } from "@/components/widgets";
import { Signed } from "@/components/price";
import { displaySymbol } from "@/lib/market/config";
import { fmtCurrency } from "@/lib/market/math";
import { fetchQuotes } from "@/lib/market/server";
import { addPortfolioAccount, addPortfolioTransaction, deletePortfolioTransaction, getPortfolioAccounts, getPortfolioTransactions, renamePortfolioAccount } from "@/lib/market/angel-portfolio";
import { useDesk } from "@/lib/store";

export const Route = createFileRoute("/portfolio")({ component: PortfolioPage });

type Account = { id: string; name: string; sortOrder: number };
type Tx = { id: string; broker: string; brokerTradeId: string | null; symbol: string; exchange: string; company: string; side: "BUY" | "SELL"; quantity: number; price: number; tradeDate: string; charges: number; source: string };
type Holding = { symbol: string; exchange: string; qty: number; avg: number; invested: number; realized: number };
type Quote = { symbol: string; price?: number; change?: number; changePercent?: number; previousClose?: number };

const storageKey = (id: string) => `artha-portfolio-transactions-${id}`;
function readLocal(id: string): Tx[] {
  if (typeof window === "undefined" || !id) return [];
  try { const value = JSON.parse(localStorage.getItem(storageKey(id)) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
function writeLocal(id: string, value: Tx[]) { try { localStorage.setItem(storageKey(id), JSON.stringify(value)); } catch {} }

function PortfolioPage() {
  const qc = useQueryClient();
  const legacyHoldings = useDesk(s => s.holdings);
  const [accountId, setAccountId] = useState("");
  const [tab, setTab] = useState<"overview" | "equity" | "sold" | "history">("equity");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showAccount, setShowAccount] = useState(false);
  const [newAccount, setNewAccount] = useState("");
  const [showTx, setShowTx] = useState(false);
  const [tx, setTx] = useState({ symbol: "", exchange: "NSE", side: "BUY" as "BUY" | "SELL", quantity: "", price: "", tradeDate: new Date().toISOString().slice(0, 10), charges: "0" });

  const accountsQuery = useQuery({ queryKey: ["portfolio-accounts"], queryFn: () => getPortfolioAccounts(), staleTime: 300000 });
  const accounts = (accountsQuery.data || []) as Account[];
  useEffect(() => { if (!accountId && accounts[0]) setAccountId(accounts[0].id); }, [accounts, accountId]);
  const active = accounts.find(a => a.id === accountId);
  const legacyAccountId = accounts[0]?.id || "";

  const txQuery = useQuery({
    queryKey: ["portfolio-transactions", accountId],
    enabled: !!accountId,
    refetchInterval: 60000,
    queryFn: async () => {
      const remote = await getPortfolioTransactions({ data: { accountId } });
      const map = new Map<string, Tx>();
      [...readLocal(accountId), ...(remote as Tx[])].forEach(item => map.set(item.id, item));
      return [...map.values()].sort((a, b) => `${b.tradeDate}-${b.id}`.localeCompare(`${a.tradeDate}-${a.id}`));
    }
  });
  const storedTransactions = (txQuery.data || []) as Tx[];

  // Older Artha holdings were saved by the stock-page Book button in Zustand.
  // They have no portfolio-account id, so attach them to the first portfolio account.
  // This keeps existing holdings visible without asking the user to re-enter them.
  const legacyTransactions = useMemo<Tx[]>(() => {
    if (!legacyAccountId || accountId !== legacyAccountId) return [];
    return legacyHoldings.map(h => ({
      id: `legacy-${h.id}`,
      broker: "manual",
      brokerTradeId: null,
      symbol: h.symbol,
      exchange: "NSE",
      company: h.company || h.symbol,
      side: "BUY" as const,
      quantity: Number(h.quantity),
      price: Number(h.buyPrice),
      tradeDate: h.buyDate,
      charges: 0,
      source: "stock-book"
    }));
  }, [legacyAccountId, accountId, legacyHoldings]);

  const transactions = useMemo(() => {
    const map = new Map<string, Tx>();
    [...storedTransactions, ...legacyTransactions].forEach(item => map.set(item.id, item));
    return [...map.values()].sort((a, b) => `${b.tradeDate}-${b.id}`.localeCompare(`${a.tradeDate}-${a.id}`));
  }, [storedTransactions, legacyTransactions]);

  const symbols = useMemo(() => [...new Set(transactions.map(t => t.symbol))], [transactions]);
  const quotesQuery = useQuery({ queryKey: ["portfolio-quotes", symbols], enabled: symbols.length > 0, refetchInterval: 60000, queryFn: () => fetchQuotes({ data: { symbols } }) });
  const quotes = new Map<string, Quote>((quotesQuery.data || []).map(q => [q.symbol, q as Quote]));

  const allHoldings = useMemo(() => buildHoldings(transactions), [transactions]);
  const holdings = allHoldings.filter(h => h.qty > 0.000001);
  const sold = transactions.filter(t => t.side === "SELL");
  const invested = holdings.reduce((sum, h) => sum + h.invested, 0);
  const current = holdings.reduce((sum, h) => sum + h.qty * (quotes.get(h.symbol)?.price ?? h.avg), 0);
  const unrealised = current - invested;
  const realised = allHoldings.reduce((sum, h) => sum + h.realized, 0);
  const totalPnl = unrealised + realised;
  const returnPct = invested ? totalPnl / invested * 100 : null;
  const todayPnl = holdings.reduce((sum, h) => { const change = Number(quotes.get(h.symbol)?.change); return sum + (Number.isFinite(change) ? h.qty * change : 0); }, 0);
  const filtered = holdings.filter(h => { const term = search.trim().toLowerCase(); return !term || displaySymbol(h.symbol).toLowerCase().includes(term) || h.symbol.toLowerCase().includes(term); });

  const openTransaction = (side: "BUY" | "SELL", h?: Holding) => {
    const quote = h ? quotes.get(h.symbol)?.price ?? h.avg : undefined;
    setTx({ symbol: h?.symbol || "", exchange: h?.exchange || "NSE", side, quantity: "", price: quote !== undefined ? String(quote) : "", tradeDate: new Date().toISOString().slice(0, 10), charges: "0" });
    setShowTx(true);
  };

  async function saveTransaction() {
    const quantity = Number(tx.quantity), price = Number(tx.price), charges = Number(tx.charges || 0), symbol = tx.symbol.trim().toUpperCase();
    if (!accountId || !symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(charges) || charges < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(tx.tradeDate)) { toast("Enter valid transaction details"); return; }
    const holding = holdings.find(h => h.symbol === symbol && h.exchange === tx.exchange);
    if (tx.side === "SELL" && (!holding || quantity > holding.qty + 0.000001)) { toast(`Available quantity: ${holding ? trim(holding.qty) : "0"}`); return; }
    const hasDbBuy = storedTransactions.some(t => t.side === "BUY" && t.symbol === symbol && t.exchange === tx.exchange);
    try {
      // If the position exists only because of an old Stock-page Book entry,
      // keep the SELL in the same account's local transaction ledger. This avoids
      // the server rejecting a sell because it cannot see the old Zustand BUY.
      if (tx.side === "SELL" && !hasDbBuy && legacyTransactions.some(t => t.symbol === symbol && t.exchange === tx.exchange)) {
        const item: Tx = { id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, broker: "manual", brokerTradeId: null, symbol, exchange: tx.exchange, company: symbol, side: "SELL", quantity, price, tradeDate: tx.tradeDate, charges, source: "manual-local" };
        writeLocal(accountId, [...readLocal(accountId), item]);
        setShowTx(false); await qc.invalidateQueries({ queryKey: ["portfolio-transactions", accountId] }); toast("SELL transaction added"); return;
      }
      const result = await addPortfolioTransaction({ data: { accountId, symbol, exchange: tx.exchange, side: tx.side, quantity, price, tradeDate: tx.tradeDate, charges } });
      const item: Tx = { id: String(result.id), broker: "manual", brokerTradeId: String(result.id), symbol, exchange: tx.exchange, company: symbol, side: tx.side, quantity, price, tradeDate: tx.tradeDate, charges, source: "manual" };
      writeLocal(accountId, [...readLocal(accountId).filter(x => x.id !== item.id), item]);
      setShowTx(false); await qc.invalidateQueries({ queryKey: ["portfolio-transactions", accountId] }); toast(`${item.side} transaction added`);
    } catch (e) { toast(e instanceof Error ? e.message : "Could not save transaction"); }
  }

  async function addAccount() {
    if (!newAccount.trim()) return;
    try { const account = await addPortfolioAccount({ data: { name: newAccount.trim() } }); setNewAccount(""); setShowAccount(false); setAccountId(account.id); await qc.invalidateQueries({ queryKey: ["portfolio-accounts"] }); toast("Portfolio added"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not add portfolio"); }
  }
  async function renameAccount() {
    if (!editing || !editName.trim()) return;
    try { await renamePortfolioAccount({ data: { id: editing, name: editName.trim() } }); setEditing(null); await qc.invalidateQueries({ queryKey: ["portfolio-accounts"] }); toast("Portfolio renamed"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not rename portfolio"); }
  }
  async function removeTransaction(id: string) {
    if (id.startsWith("legacy-")) { toast("This holding is linked to your Stock-page Book entry"); return; }
    if (!confirm("Delete this transaction?")) return;
    try { await deletePortfolioTransaction({ data: { accountId, id } }); writeLocal(accountId, readLocal(accountId).filter(x => x.id !== id)); await qc.invalidateQueries({ queryKey: ["portfolio-transactions", accountId] }); toast("Transaction deleted"); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not delete transaction"); }
  }

  if (accountsQuery.isLoading) return <div className="py-12 text-center text-sm text-muted">Loading portfolio…</div>;
  return <div className="mx-auto max-w-6xl pb-10">
    <header className="flex items-center justify-between gap-3 py-1"><div><div className="flex items-center gap-2"><h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Holdings</h1>{active && <button onClick={() => { setEditing(active.id); setEditName(active.name); }} className="text-sm text-muted hover:text-fg">{active.name}</button>}</div><p className="mt-1 text-xs text-muted sm:text-sm">Track your equity investments</p></div><div className="flex items-center gap-2"><button onClick={() => openTransaction("BUY")} className="flex h-10 items-center gap-1.5 rounded-full border border-border bg-bg px-4 text-sm font-medium hover:bg-surface-2"><Plus className="size-4"/>Add</button><button onClick={() => setShowAccount(true)} className="flex size-10 items-center justify-center rounded-full border border-border bg-bg hover:bg-surface-2" aria-label="Portfolio options"><MoreVertical className="size-5"/></button></div></header>
    {accounts.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto">{accounts.map(a => <button key={a.id} onClick={() => { setAccountId(a.id); setTab("equity"); }} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium ${accountId === a.id ? "bg-fg text-bg" : "border border-border text-muted hover:text-fg"}`}>{a.name}</button>)}</div>}
    {editing && <div className="mt-3 flex gap-2 rounded-xl border border-border bg-surface-2 p-3"><input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void renameAccount(); if (e.key === "Escape") setEditing(null); }} className="min-w-0 flex-1 rounded-lg border bg-bg px-3 py-2 text-sm"/><Button size="sm" onClick={renameAccount}>Save</Button><button onClick={() => setEditing(null)} className="px-2 text-muted"><X className="size-4"/></button></div>}
    {active && <>
      <section className="mt-4 overflow-hidden rounded-2xl bg-slate-800 text-white shadow-sm"><div className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><div className="text-xs text-slate-300">Current value</div><div className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{fmtCurrency(current)}</div><div className={`mt-2 text-sm font-medium ${totalPnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>{totalPnl >= 0 ? "↑ Overall Profit" : "↓ Overall Loss"} {fmtCurrency(Math.abs(totalPnl))} <span className="text-slate-300">({returnPct === null ? "—" : `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`})</span></div></div><div className="text-right"><div className="text-xs text-slate-300">Today&apos;s P&amp;L</div><div className={`mt-1 text-lg font-semibold ${todayPnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>{todayPnl >= 0 ? "+" : "−"}{fmtCurrency(Math.abs(todayPnl))}</div></div></div><div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 sm:grid-cols-4"><DarkMetric label="Invested Value" value={fmtCurrency(invested)}/><DarkMetric label="Current Value" value={fmtCurrency(current)}/><DarkMetric label="Unrealised P&amp;L" value={<Signed value={unrealised} as="currency"/>}/><DarkMetric label="Realised P&amp;L" value={<Signed value={realised} as="currency"/>}/></div></div><div className="grid grid-cols-2 border-t border-white/10"><button onClick={() => setTab("overview")} className={`py-3 text-sm font-medium ${tab === "overview" ? "bg-white/10 text-cyan-300" : "text-slate-300"}`}>ANALYZE</button><button onClick={() => openTransaction("BUY")} className="border-l border-white/10 py-3 text-sm font-medium text-cyan-300">+ BUY / SELL</button></div></section>
      <nav className="mt-5 flex gap-7 overflow-x-auto border-b border-border"><TopTab active={tab === "overview"} onClick={() => setTab("overview")} label="Overview"/><TopTab active={tab === "equity"} onClick={() => setTab("equity")} label="Equity"/><TopTab active={tab === "sold"} onClick={() => setTab("sold")} label="Sold"/><TopTab active={tab === "history"} onClick={() => setTab("history")} label="History"/></nav>
      {(tab === "overview" || tab === "equity") && <><div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2.5"><Search className="size-5 shrink-0 text-muted"/><input value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted" placeholder="Search stocks by company"/><SlidersHorizontal className="size-4 shrink-0 text-muted"/></div><div className="mt-3 flex items-center justify-between px-1 text-xs text-muted"><span>{filtered.length} holding{filtered.length === 1 ? "" : "s"}</span><span>{quotesQuery.isFetching ? "Updating…" : "Live prices"}</span></div><Holdings rows={filtered} quotes={quotes} onBuy={h => openTransaction("BUY", h)} onSell={h => openTransaction("SELL", h)}/></>}
      {tab === "sold" && <Transactions rows={sold} onDelete={removeTransaction} emptyTitle="No SELL transactions" emptyBody="Your completed sell transactions will appear here."/>}
      {tab === "history" && <Transactions rows={transactions} onDelete={removeTransaction} emptyTitle="No transactions" emptyBody="BUY and SELL activity will appear here."/>}
    </>}
    {showAccount && <Modal title="Portfolio" close={() => setShowAccount(false)}><input autoFocus value={newAccount} onChange={e => setNewAccount(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void addAccount(); }} className="w-full rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="New portfolio name"/><div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowAccount(false)}>Cancel</Button><Button onClick={addAccount}>Add Portfolio</Button></div></Modal>}
    {showTx && <Modal title={tx.side === "BUY" ? "Buy Stock" : "Sell Stock"} close={() => setShowTx(false)}><div className="space-y-3"><div className="grid grid-cols-2 gap-2"><button onClick={() => setTx({...tx,side:"BUY"})} className={`rounded-lg border py-2.5 text-sm font-semibold ${tx.side === "BUY" ? "border-up bg-up/10 text-up" : "border-border text-muted"}`}>BUY</button><button onClick={() => setTx({...tx,side:"SELL"})} className={`rounded-lg border py-2.5 text-sm font-semibold ${tx.side === "SELL" ? "border-down bg-down/10 text-down" : "border-border text-muted"}`}>SELL</button></div><input value={tx.symbol} onChange={e => setTx({...tx,symbol:e.target.value.toUpperCase()})} className="w-full rounded-lg border bg-bg px-3 py-2.5 text-sm" placeholder="Stock symbol e.g. TCS"/><div className="grid grid-cols-2 gap-2"><select value={tx.exchange} onChange={e => setTx({...tx,exchange:e.target.value})} className="rounded-lg border bg-bg px-3 py-2.5 text-sm"><option>NSE</option><option>BSE</option></select><input type="date" value={tx.tradeDate} onChange={e => setTx({...tx,tradeDate:e.target.value})} className="rounded-lg border bg-bg px-3 py-2.5 text-sm"/></div>{tx.side === "SELL" && tx.symbol && <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">Available: {trim(holdings.find(h => h.symbol === tx.symbol && h.exchange === tx.exchange)?.qty || 0)} shares</div>}<div className="grid grid-cols-2 gap-2"><input type="number" min="0.0001" value={tx.quantity} onChange={e => setTx({...tx,quantity:e.target.value})} className="rounded-lg border bg-bg px-3 py-2.5 text-sm" placeholder="Quantity"/><input type="number" min="0" step="0.01" value={tx.price} onChange={e => setTx({...tx,price:e.target.value})} className="rounded-lg border bg-bg px-3 py-2.5 text-sm" placeholder="Price"/></div><input type="number" min="0" step="0.01" value={tx.charges} onChange={e => setTx({...tx,charges:e.target.value})} className="w-full rounded-lg border bg-bg px-3 py-2.5 text-sm" placeholder="Charges (optional)"/><Button className="w-full" onClick={saveTransaction}>{tx.side === "BUY" ? "Add BUY" : "Confirm SELL"}</Button></div></Modal>}
  </div>;
}

function TopTab({active,onClick,label}:{active:boolean;onClick:()=>void;label:string}){return <button onClick={onClick} className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold ${active ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg"}`}>{label}</button>}
function Holdings({rows,quotes,onBuy,onSell}:{rows:Holding[];quotes:Map<string,Quote>;onBuy:(h:Holding)=>void;onSell:(h:Holding)=>void}){if(!rows.length)return <div className="mt-3"><Panel className="p-8"><Empty title="No holdings" body="Add a BUY transaction to build your portfolio."/></Panel></div>;return <div className="mt-3 space-y-3">{rows.map(h=>{const ltp=quotes.get(h.symbol)?.price??h.avg,value=h.qty*ltp,pnl=value-h.invested,pnlPct=h.invested?pnl/h.invested*100:null;return <Panel key={`${h.exchange}:${h.symbol}`} className="overflow-hidden"><Link to="/stock" search={{symbol:h.symbol,period:"1Y"}} className="block p-4 pb-3"><div className="flex items-start justify-between gap-4"><div><div className="text-[16px] font-semibold tracking-tight">{displaySymbol(h.symbol)}</div><div className="mt-1 text-xs text-muted">{trim(h.qty)} shares · Avg. {fmtCurrency(h.avg)}</div></div><div className="text-right"><Signed value={pnl} as="currency" className="text-[15px] font-semibold"/><div className="mt-0.5 text-xs"><Signed value={pnlPct} as="percent"/></div></div></div><div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3"><Metric label="LTP" value={fmtCurrency(ltp)}/><Metric label="Current value" value={fmtCurrency(value)}/><Metric label="Invested" value={fmtCurrency(h.invested)}/></div></Link><div className="grid grid-cols-2 border-t border-border"><button onClick={()=>onBuy(h)} className="py-3 text-sm font-semibold text-up hover:bg-up/5">BUY</button><button onClick={()=>onSell(h)} className="border-l border-border py-3 text-sm font-semibold text-down hover:bg-down/5">SELL</button></div></Panel>})}</div>}
function Transactions({rows,onDelete,emptyTitle,emptyBody}:{rows:Tx[];onDelete:(id:string)=>void;emptyTitle:string;emptyBody:string}){if(!rows.length)return <div className="mt-4"><Panel className="p-8"><Empty title={emptyTitle} body={emptyBody}/></Panel></div>;return <div className="mt-4 space-y-2">{rows.map(t=><Panel key={t.id} className="overflow-hidden"><div className="flex items-start justify-between gap-3 p-4"><div><div className="flex items-center gap-2"><span className={`rounded-md px-2 py-1 text-[11px] font-bold ${t.side === "BUY" ? "bg-up/10 text-up" : "bg-down/10 text-down"}`}>{t.side}</span><span className="text-[15px] font-semibold">{displaySymbol(t.symbol)}</span></div><div className="mt-1.5 text-xs text-muted">{t.exchange} · {formatDate(t.tradeDate)}{t.source === "stock-book" ? " · Stock page" : ""}</div></div>{!t.id.startsWith("legacy-") && <button onClick={()=>onDelete(t.id)} className="rounded-md p-1.5 text-muted hover:text-down" aria-label="Delete transaction"><Trash2 className="size-4"/></button>}</div><div className="grid grid-cols-3 gap-3 border-t border-border px-4 py-3"><Metric label="Quantity" value={trim(t.quantity)}/><Metric label="Price" value={fmtCurrency(t.price)}/><Metric label="Value" value={fmtCurrency(t.quantity*t.price)}/></div></Panel>)}</div>}
function DarkMetric({label,value}:{label:string;value:ReactNode}){return <div><div className="text-[11px] text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold tabular text-white">{value}</div></div>}
function Metric({label,value}:{label:string;value:ReactNode}){return <div><div className="text-[11px] text-muted">{label}</div><div className="mt-0.5 text-sm font-semibold tabular">{value}</div></div>}
function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><Panel className="w-full rounded-t-2xl p-5 sm:max-w-md sm:rounded-2xl"><div className="flex items-center justify-between"><h3 className="font-display text-xl font-semibold">{title}</h3><button onClick={close} className="rounded-full p-1.5 text-muted hover:bg-surface-2"><X className="size-5"/></button></div><div className="mt-5">{children}</div></Panel></div>}
function trim(n:number){return Number.isInteger(n)?String(n):n.toFixed(4).replace(/0+$/g,"").replace(/\.$/,"")}
function formatDate(s:string){const d=new Date(`${s}T00:00:00`);return Number.isNaN(d.getTime())?s:d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
function buildHoldings(txs:Tx[]):Holding[]{const map=new Map<string,Holding>();for(const t of [...txs].sort((a,b)=>a.tradeDate.localeCompare(b.tradeDate)||a.id.localeCompare(b.id))){const key=`${t.exchange}:${t.symbol}`,h=map.get(key)||{symbol:t.symbol,exchange:t.exchange,qty:0,avg:0,invested:0,realized:0};if(t.side==="BUY"){const newQty=h.qty+t.quantity;h.avg=(h.avg*h.qty+t.price*t.quantity)/newQty;h.qty=newQty;h.invested=h.avg*h.qty}else{const sellQty=Math.min(h.qty,t.quantity);h.realized+=t.price*sellQty-h.avg*sellQty-t.charges;h.qty=Math.max(0,h.qty-t.quantity);h.invested=h.avg*h.qty}map.set(key,h)}return [...map.values()]}

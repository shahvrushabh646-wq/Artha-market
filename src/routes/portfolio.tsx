import { useQuery,useQueryClient } from "@tanstack/react-query";
import { createFileRoute,Link } from "@tanstack/react-router";
import { useEffect,useMemo,useState,type ReactNode } from "react";
import { Pencil,Plus,Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty,Panel } from "@/components/widgets";
import { Signed } from "@/components/price";
import { displaySymbol } from "@/lib/market/config";
import { fmtCurrency } from "@/lib/market/math";
import { fetchQuotes } from "@/lib/market/server";
import { addPortfolioAccount,addPortfolioTransaction,deletePortfolioTransaction,getPortfolioAccounts,getPortfolioTransactions,renamePortfolioAccount } from "@/lib/market/angel-portfolio";

export const Route=createFileRoute("/portfolio")({component:PortfolioPage});
type Account={id:string;name:string;sortOrder:number};
type Tx={id:string;broker:string;brokerTradeId:string|null;symbol:string;exchange:string;company:string;side:"BUY"|"SELL";quantity:number;price:number;tradeDate:string;charges:number;source:string};
type Holding={symbol:string;exchange:string;qty:number;avg:number;invested:number;realized:number};
const key=(id:string)=>`artha-portfolio-transactions-${id}`;
const read=(id:string):Tx[]=>{if(typeof window==="undefined"||!id)return [];try{const x=JSON.parse(localStorage.getItem(key(id))||"[]");return Array.isArray(x)?x:[]}catch{return []}};
const write=(id:string,x:Tx[])=>{try{localStorage.setItem(key(id),JSON.stringify(x))}catch{}};

function PortfolioPage(){
 const qc=useQueryClient();
 const [accountId,setAccountId]=useState("");
 const [tab,setTab]=useState<"holdings"|"sold"|"history">("holdings");
 const [editing,setEditing]=useState<string|null>(null),[editName,setEditName]=useState("");
 const [showAdd,setShowAdd]=useState(false),[newAccount,setNewAccount]=useState("");
 const [showTx,setShowTx]=useState(false);
 const [tx,setTx]=useState({symbol:"",exchange:"NSE",side:"BUY" as "BUY"|"SELL",quantity:"",price:"",tradeDate:new Date().toISOString().slice(0,10),charges:"0"});
 const aq=useQuery({queryKey:["portfolio-accounts"],queryFn:()=>getPortfolioAccounts(),staleTime:300000});
 const accounts=(aq.data||[]) as Account[];
 useEffect(()=>{if(!accountId&&accounts[0])setAccountId(accounts[0].id)},[accounts,accountId]);
 const active=accounts.find(a=>a.id===accountId);
 const tq=useQuery({queryKey:["portfolio-transactions",accountId],enabled:!!accountId,refetchInterval:60000,queryFn:async()=>{const remote=await getPortfolioTransactions({data:{accountId}});const all=[...read(accountId),...(remote as Tx[])];const m=new Map<string,Tx>();all.forEach(t=>m.set(t.id,t));return [...m.values()].sort((a,b)=>`${b.tradeDate}-${b.id}`.localeCompare(`${a.tradeDate}-${a.id}`))}});
 const transactions=(tq.data||[]) as Tx[];
 const symbols=[...new Set(transactions.map(t=>t.symbol))];
 const quotes=useQuery({queryKey:["portfolio-quotes",symbols],enabled:symbols.length>0,refetchInterval:60000,queryFn:()=>fetchQuotes({data:{symbols}})});
 const qm=new Map((quotes.data||[]).map(q=>[q.symbol,q]));
 const allHoldings=useMemo(()=>build(transactions),[transactions]);
 const holdings=allHoldings.filter(h=>h.qty>0.000001);
 const sold=transactions.filter(t=>t.side==="SELL");
 const invested=holdings.reduce((s,h)=>s+h.invested,0);
 const current=holdings.reduce((s,h)=>s+h.qty*(qm.get(h.symbol)?.price??h.avg),0);
 const unreal=current-invested;
 const realized=allHoldings.reduce((s,h)=>s+h.realized,0);
 const totalPl=unreal+realized;
 const ret=invested?totalPl/invested*100:null;
 async function rename(){if(!editing)return;try{await renamePortfolioAccount({data:{id:editing,name:editName}});setEditing(null);await qc.invalidateQueries({queryKey:["portfolio-accounts"]});toast("Account name updated")}catch(e){toast(e instanceof Error?e.message:"Could not update account")}}
 async function addAccount(){if(!newAccount.trim())return;try{const a=await addPortfolioAccount({data:{name:newAccount.trim()}});setNewAccount("");setShowAdd(false);await qc.invalidateQueries({queryKey:["portfolio-accounts"]});setAccountId(a.id);toast("Account added")}catch(e){toast(e instanceof Error?e.message:"Could not add account")}}
 async function saveTx(){const q=Number(tx.quantity),p=Number(tx.price),c=Number(tx.charges||0);if(!accountId||!tx.symbol.trim()||!Number.isFinite(q)||q<=0||!Number.isFinite(p)||p<0||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(tx.tradeDate)){toast("Enter valid transaction details");return}try{const r=await addPortfolioTransaction({data:{accountId,symbol:tx.symbol.trim(),exchange:tx.exchange,side:tx.side,quantity:q,price:p,tradeDate:tx.tradeDate,charges:c}});const item:Tx={id:String(r.id),broker:"manual",brokerTradeId:String(r.id),symbol:tx.symbol.trim().toUpperCase(),exchange:tx.exchange,company:tx.symbol.trim().toUpperCase(),side:tx.side,quantity:q,price:p,tradeDate:tx.tradeDate,charges:Number.isFinite(c)&&c>=0?c:0,source:"manual"};write(accountId,[...read(accountId).filter(x=>x.id!==item.id),item]);setShowTx(false);setTx({...tx,symbol:"",quantity:"",price:"",charges:"0"});await qc.invalidateQueries({queryKey:["portfolio-transactions",accountId]});toast(`${item.side} added`)}catch(e){toast(e instanceof Error?e.message:"Could not save transaction")}}
 async function remove(id:string){if(!confirm("Delete this transaction?"))return;try{await deletePortfolioTransaction({data:{accountId,id}});write(accountId,read(accountId).filter(x=>x.id!==id));await qc.invalidateQueries({queryKey:["portfolio-transactions",accountId]});toast("Transaction deleted")}catch(e){toast(e instanceof Error?e.message:"Could not delete transaction")}}
 if(aq.isLoading)return <div className="py-12 text-center text-sm text-muted">Loading portfolio…</div>;
 return <div className="mx-auto max-w-6xl pb-10">
  <div className="mb-4 flex items-center justify-between gap-3"><div><h1 className="font-display text-2xl tracking-tight sm:text-3xl">Portfolio</h1><p className="mt-1 text-xs text-muted sm:text-sm">Track your investments and transactions</p></div><Button className="h-9 px-3 sm:h-10 sm:px-4" onClick={()=>setShowTx(true)} disabled={!active}><Plus className="mr-1.5 size-4"/>Add</Button></div>
  <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">{accounts.map(a=><button key={a.id} onClick={()=>{setAccountId(a.id);setTab("holdings")}} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${accountId===a.id?"border-fg text-fg":"border-transparent text-muted hover:text-fg"}`}>{a.name}</button>)}<button onClick={()=>setShowAdd(true)} className="whitespace-nowrap px-4 py-3 text-sm text-muted hover:text-fg"><Plus className="mr-1 inline size-4"/>Add account</button></div>
  {editing&&<div className="mb-4 flex gap-2 rounded-xl border border-border bg-surface-2 p-3"><input autoFocus value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void rename();if(e.key==="Escape")setEditing(null)}} className="min-w-0 flex-1 rounded-lg border bg-bg px-3 py-2 text-sm"/><Button size="sm" onClick={rename}>Save</Button></div>}
  {active&&<>
   <section className="rounded-2xl border border-border bg-bg p-4 shadow-sm sm:p-5">
    <div className="flex items-start justify-between gap-4"><div><button onClick={()=>{setEditing(active.id);setEditName(active.name)}} className="flex items-center gap-1.5 text-sm font-medium hover:text-fg">{active.name}<Pencil className="size-3.5 text-muted"/></button><div className="mt-2 text-xs text-muted">Current value</div><div className="mt-0.5 text-2xl font-semibold tabular sm:text-3xl">{fmtCurrency(current)}</div></div><div className="text-right"><div className="text-xs text-muted">Overall P&amp;L</div><div className="mt-1 text-lg font-semibold sm:text-2xl"><Signed value={totalPl} as="currency"/></div><div className="mt-0.5 text-xs sm:text-sm"><Signed value={ret} as="percent"/></div></div></div>
    <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4"><Metric label="Invested" value={fmtCurrency(invested)}/><Metric label="Current" value={fmtCurrency(current)}/><Metric label="Unrealised P&amp;L" value={<Signed value={unreal} as="currency"/>}/><Metric label="Realised P&amp;L" value={<Signed value={realized} as="currency"/>}/></div>
   </section>
   <div className="mt-5 grid grid-cols-3 border-b border-border">
    <Tab active={tab==="holdings"} onClick={()=>setTab("holdings")} label="BUY" count={holdings.length}/>
    <Tab active={tab==="sold"} onClick={()=>setTab("sold")} label="SELL" count={sold.length}/>
    <Tab active={tab==="history"} onClick={()=>setTab("history")} label="HISTORY" count={transactions.length}/>
   </div>
   {tab==="holdings"&&<Holdings rows={holdings} qm={qm}/>} 
   {tab==="sold"&&<Transactions rows={sold} onDelete={remove} emptyTitle="No SELL transactions" emptyBody="When you sell shares, every sell transaction will appear here date-wise."/>}
   {tab==="history"&&<Transactions rows={transactions} onDelete={remove} emptyTitle="No transactions" emptyBody="BUY and SELL activity will appear here date-wise."/>}
  </>}
  {showAdd&&<Modal title="Add Portfolio Account" close={()=>setShowAdd(false)}><input autoFocus value={newAccount} onChange={e=>setNewAccount(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void addAccount()}} className="w-full rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Account name"/><div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setShowAdd(false)}>Cancel</Button><Button onClick={addAccount}>Add Account</Button></div></Modal>}
  {showTx&&<Modal title="Add Transaction" close={()=>setShowTx(false)}><div className="space-y-3"><input value={tx.symbol} onChange={e=>setTx({...tx,symbol:e.target.value.toUpperCase()})} className="w-full rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Stock symbol e.g. TCS"/><div className="grid grid-cols-2 gap-2"><select value={tx.side} onChange={e=>setTx({...tx,side:e.target.value as "BUY"|"SELL"})} className="rounded-lg border bg-bg px-3 py-2 text-sm"><option>BUY</option><option>SELL</option></select><select value={tx.exchange} onChange={e=>setTx({...tx,exchange:e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm"><option>NSE</option><option>BSE</option></select></div><div className="grid grid-cols-2 gap-2"><input type="number" min="0.0001" value={tx.quantity} onChange={e=>setTx({...tx,quantity:e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Quantity"/><input type="number" min="0" step="0.01" value={tx.price} onChange={e=>setTx({...tx,price:e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Price"/></div><div className="grid grid-cols-2 gap-2"><input type="date" value={tx.tradeDate} onChange={e=>setTx({...tx,tradeDate:e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm"/><input type="number" min="0" step="0.01" value={tx.charges} onChange={e=>setTx({...tx,charges:e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Charges"/></div><Button className="w-full" onClick={saveTx}>Save Transaction</Button></div></Modal>}
 </div>;
}
function Tab({active,onClick,label,count}:{active:boolean;onClick:()=>void;label:string;count:number}){return <button onClick={onClick} className={`border-b-2 px-3 py-3 text-sm font-semibold tracking-wide transition-colors sm:px-5 ${active?"border-fg text-fg":"border-transparent text-muted hover:text-fg"}`}>{label}<span className="ml-1.5 text-xs font-normal text-muted">{count}</span></button>}
function Holdings({rows,qm}:{rows:Holding[];qm:Map<string,any>}){return <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-bg">{rows.length===0?<div className="p-8"><Empty title="No BUY holdings" body="Add a BUY transaction to build your portfolio."/></div>:rows.map(h=>{const ltp=qm.get(h.symbol)?.price??h.avg,value=h.qty*ltp,pl=value-h.invested;return <Link key={`${h.exchange}:${h.symbol}`} to="/stock" search={{symbol:h.symbol,period:"1Y"}} className="block border-b border-border p-4 last:border-b-0 hover:bg-surface-2/50"><div className="flex items-start justify-between gap-4"><div><div className="text-[15px] font-semibold">{displaySymbol(h.symbol)}</div><div className="mt-0.5 text-xs text-muted">{h.exchange} · {trim(h.qty)} shares</div></div><div className="text-right"><Signed value={pl} as="currency" className="text-sm"/><div className="mt-0.5 text-xs"><Signed value={h.invested?pl/h.invested*100:null} as="percent"/></div></div></div><div className="mt-3 grid grid-cols-3 gap-3 text-sm"><Metric label="Avg. price" value={fmtCurrency(h.avg)}/><Metric label="LTP" value={fmtCurrency(ltp)}/><Metric label="Current value" value={fmtCurrency(value)}/></div></Link>})}</div>}
function Transactions({rows,onDelete,emptyTitle,emptyBody}:{rows:Tx[];onDelete:(id:string)=>void;emptyTitle:string;emptyBody:string}){if(!rows.length)return <div className="mt-3"><Panel className="p-8"><Empty title={emptyTitle} body={emptyBody}/></Panel></div>;return <div className="mt-3 space-y-2">{rows.map(t=><Panel key={t.id} className="overflow-hidden"><div className="flex items-start justify-between gap-3 p-4"><div><div className="flex items-center gap-2"><span className={`rounded-md px-2 py-1 text-[11px] font-bold tracking-wide ${t.side==="BUY"?"bg-up/15 text-up":"bg-down/15 text-down"}`}>{t.side}</span><span className="text-[15px] font-semibold">{displaySymbol(t.symbol)}</span></div><div className="mt-1.5 text-xs text-muted">{t.exchange} · {formatDate(t.tradeDate)}</div></div><button onClick={()=>onDelete(t.id)} aria-label="Delete transaction" className="rounded-md p-1.5 text-muted hover:text-down"><Trash2 className="size-4"/></button></div><div className="grid grid-cols-3 gap-3 border-t border-border px-4 py-3"><Metric label="Quantity" value={trim(t.quantity)}/><Metric label="Price" value={fmtCurrency(t.price)}/><Metric label="Value" value={fmtCurrency(t.quantity*t.price)}/></div>{t.charges>0&&<div className="px-4 pb-3 text-[11px] text-muted">Charges: {fmtCurrency(t.charges)}</div>}</Panel>)}</div>}
function Metric({label,value}:{label:string;value:ReactNode}){return <div><div className="text-[11px] text-muted">{label}</div><div className="mt-0.5 text-sm font-semibold tabular">{value}</div></div>}
function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><Panel className="w-full max-w-md p-5"><div className="flex items-center justify-between"><h3 className="font-display text-xl">{title}</h3><button onClick={close} className="text-xl text-muted">×</button></div><div className="mt-5">{children}</div></Panel></div>}
function trim(n:number){return Number.isInteger(n)?String(n):n.toFixed(4).replace(/0+$/g,"").replace(/\.$/,"")}
function formatDate(s:string){const d=new Date(`${s}T00:00:00`);return Number.isNaN(d.getTime())?s:d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
function build(txs:Tx[]):Holding[]{const m=new Map<string,Holding>();for(const t of [...txs].sort((a,b)=>a.tradeDate.localeCompare(b.tradeDate)||a.id.localeCompare(b.id))){const k=`${t.exchange}:${t.symbol}`,h=m.get(k)||{symbol:t.symbol,exchange:t.exchange,qty:0,avg:0,invested:0,realized:0};if(t.side==="BUY"){const nq=h.qty+t.quantity;h.avg=(h.avg*h.qty+t.price*t.quantity)/nq;h.qty=nq;h.invested=h.avg*h.qty}else{const sellQty=Math.min(h.qty,t.quantity);h.realized+=t.price*sellQty-h.avg*sellQty-t.charges;h.qty=Math.max(0,h.qty-t.quantity);h.invested=h.avg*h.qty}m.set(k,h)}return [...m.values()]}

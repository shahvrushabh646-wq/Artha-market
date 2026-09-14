import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, Panel, Section, Stat } from "@/components/widgets";
import { Signed } from "@/components/price";
import { displaySymbol } from "@/lib/market/config";
import { fmtCurrency } from "@/lib/market/math";
import { fetchQuotes } from "@/lib/market/server";
import { addPortfolioAccount, addPortfolioTransaction, deletePortfolioTransaction, getPortfolioAccounts, getPortfolioTransactions, renamePortfolioAccount } from "@/lib/market/angel-portfolio";

export const Route=createFileRoute("/portfolio")({component:PortfolioPage});
type Account={id:string;name:string;sortOrder:number};
type Tx={id:string;broker:string;brokerTradeId:string|null;symbol:string;exchange:string;company:string;side:"BUY"|"SELL";quantity:number;price:number;tradeDate:string;charges:number;source:string};
type HoldingRow={symbol:string;exchange:string;qty:number;avg:number;invested:number;realized:number};

function PortfolioPage(){
 const qc=useQueryClient();
 const [accountId,setAccountId]=useState("");
 const [tab,setTab]=useState<"holdings"|"sold"|"history">("holdings");
 const [editing,setEditing]=useState<string|null>(null);
 const [editName,setEditName]=useState("");
 const [showAdd,setShowAdd]=useState(false);
 const [newAccount,setNewAccount]=useState("");
 const [showTx,setShowTx]=useState(false);
 const [tx,setTx]=useState({symbol:"",exchange:"NSE",side:"BUY" as "BUY"|"SELL",quantity:"",price:"",tradeDate:new Date().toISOString().slice(0,10),charges:"0"});
 const accountsQuery=useQuery({queryKey:["portfolio-accounts"],queryFn:()=>getPortfolioAccounts(),staleTime:300000});
 const accounts=(accountsQuery.data??[]) as Account[];
 useEffect(()=>{if(!accountId&&accounts[0]?.id)setAccountId(accounts[0].id);},[accounts,accountId]);
 const activeAccount=accounts.find(a=>a.id===accountId);
 const txQuery=useQuery({queryKey:["portfolio-transactions",accountId],queryFn:()=>getPortfolioTransactions({data:{accountId}}),enabled:!!accountId,refetchInterval:60000});
 const transactions=(txQuery.data??[]) as Tx[];
 const symbols=[...new Set(transactions.map(t=>t.symbol))];
 const quotes=useQuery({queryKey:["portfolio-quotes",symbols],queryFn:()=>fetchQuotes({data:{symbols}}),enabled:symbols.length>0,refetchInterval:60000});
 const quoteMap=new Map((quotes.data??[]).map(q=>[q.symbol,q]));
 const calculated=useMemo(()=>buildHoldings(transactions),[transactions]);
 const holdingRows=calculated.filter(h=>h.qty>0.000001);
 const sold=transactions.filter(t=>t.side==="SELL");
 const totalInvested=holdingRows.reduce((s,h)=>s+h.invested,0);
 const currentValue=holdingRows.reduce((s,h)=>s+h.qty*(quoteMap.get(h.symbol)?.price??h.avg),0);
 const unrealized=currentValue-totalInvested;
 const realized=calculated.reduce((s,h)=>s+h.realized,0);
 const totalPl=unrealized+realized;
 const returnPct=totalInvested?(totalPl/totalInvested)*100:null;
 async function saveName(){if(!editing)return;try{await renamePortfolioAccount({data:{id:editing,name:editName}});toast("Account name updated");setEditing(null);await qc.invalidateQueries({queryKey:["portfolio-accounts"]});}catch(e){toast(e instanceof Error?e.message:"Could not update account");}}
 async function createAccount(){if(!newAccount.trim())return;try{const created=await addPortfolioAccount({data:{name:newAccount.trim()}});toast("Account added");setNewAccount("");setShowAdd(false);await qc.invalidateQueries({queryKey:["portfolio-accounts"]});setAccountId(created.id);}catch(e){toast(e instanceof Error?e.message:"Could not add account");}}
 async function saveTx(){const quantity=Number(tx.quantity),price=Number(tx.price),charges=Number(tx.charges||0);if(!accountId||!tx.symbol.trim()||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<0){toast("Enter valid transaction details");return;}try{await addPortfolioTransaction({data:{accountId,symbol:tx.symbol.trim(),exchange:tx.exchange,side:tx.side,quantity,price,tradeDate:tx.tradeDate,charges}});toast(`${tx.side} added`);setShowTx(false);setTx({...tx,symbol:"",quantity:"",price:"",charges:"0"});await qc.invalidateQueries({queryKey:["portfolio-transactions",accountId]});}catch(e){toast(e instanceof Error?e.message:"Could not save transaction");}}
 async function removeTx(id:string){if(!confirm("Delete this transaction?"))return;try{await deletePortfolioTransaction({data:{accountId,id}});await qc.invalidateQueries({queryKey:["portfolio-transactions",accountId]});toast("Transaction deleted");}catch(e){toast(e instanceof Error?e.message:"Could not delete transaction");}}
 if(accountsQuery.isLoading)return <div className="py-12 text-center text-sm text-muted">Loading portfolio accounts…</div>;
 return <div>
  <div className="flex items-start justify-between gap-3"><div><h1 className="font-display text-3xl tracking-tight">Portfolio</h1><p className="mt-1 text-sm text-muted">Choose an account to view its separate portfolio.</p></div><Button size="sm" className="h-10" onClick={()=>setShowTx(true)} disabled={!accountId}><Plus className="mr-2 size-4"/>Add Transaction</Button></div>
  <Section title="Select Account" hint="Each account has completely separate holdings and history.">
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{accounts.map(a=><button key={a.id} type="button" onClick={()=>{setAccountId(a.id);setTab("holdings")}} className={`rounded-xl border p-3 text-left transition ${accountId===a.id?"border-fg bg-surface-2 shadow-sm":"border-border hover:bg-surface-2/60"}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{a.name}</span><span onClick={e=>{e.stopPropagation();setEditing(a.id);setEditName(a.name)}} className="rounded-md p-1 text-muted hover:text-fg"><Pencil className="size-3.5"/></span></div><div className="mt-1 text-[11px] text-muted">Portfolio {a.sortOrder}</div></button>)}<button type="button" onClick={()=>setShowAdd(true)} className="rounded-xl border border-dashed border-border p-3 text-left text-muted hover:bg-surface-2/60"><Plus className="mb-2 size-4"/><div className="text-sm font-medium">Add Account</div><div className="text-[11px]">Up to 10</div></button></div>
   {editing&&<div className="mt-3 flex gap-2"><input autoFocus value={editName} onChange={e=>setEditName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void saveName();if(e.key==="Escape")setEditing(null)}} className="min-w-0 flex-1 rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Account name"/><Button size="sm" onClick={saveName}>Save</Button><Button size="sm" variant="secondary" onClick={()=>setEditing(null)}>Cancel</Button></div>}
   {showAdd&&<div className="mt-3 flex gap-2"><input autoFocus value={newAccount} onChange={e=>setNewAccount(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void createAccount();if(e.key==="Escape")setShowAdd(false)}} className="min-w-0 flex-1 rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Account name"/><Button size="sm" onClick={createAccount}>Add</Button><Button size="sm" variant="secondary" onClick={()=>setShowAdd(false)}>Cancel</Button></div>}
  </Section>
  {activeAccount&&<>
   <div className="mt-4 flex items-center justify-between gap-3"><div><h2 className="font-display text-2xl tracking-tight">{activeAccount.name}</h2><p className="text-xs text-muted">Portfolio {activeAccount.sortOrder}</p></div></div>
   <div className="mt-3 grid grid-cols-2 gap-2"><Stat label="Invested" value={fmtCurrency(totalInvested)}/><Stat label="Current" value={fmtCurrency(currentValue)}/><Stat label="Total P/L" value={<Signed value={totalPl} as="currency" className="text-base"/>}/><Stat label="Return" value={<Signed value={returnPct} as="percent" className="text-base"/>}/></div>
   <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">{([['holdings',`Holdings (${holdingRows.length})`],['sold',`Sold (${sold.length})`],['history',`History (${transactions.length})`]] as const).map(([value,label])=><button key={value} type="button" onClick={()=>setTab(value)} className={`rounded-lg px-2 py-2.5 text-xs font-medium ${tab===value?"bg-bg text-fg shadow-sm":"text-muted"}`}>{label}</button>)}</div>
   {tab==="holdings"?<Section title="Current Holdings" hint="Only shares still held are shown.">{holdingRows.length===0?<Empty title="No holdings yet" body="Use Add Transaction to record your first BUY."/>:<div className="space-y-2">{holdingRows.map(h=>{const current=quoteMap.get(h.symbol)?.price??h.avg;const value=h.qty*current;const pl=value-h.invested;return <Panel key={`${h.exchange}:${h.symbol}`} className="p-3"><div className="flex items-start justify-between gap-3"><Link to="/stock" search={{symbol:h.symbol,period:"1Y"}} className="min-w-0"><div className="font-medium">{displaySymbol(h.symbol)}</div><div className="text-xs text-muted">{h.exchange}</div></Link><Signed value={h.invested?(pl/h.invested)*100:null} as="percent"/></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-4"><span>Qty <b className="tabular text-fg">{trim(h.qty)}</b></span><span>Avg <b className="tabular text-fg">{fmtCurrency(h.avg)}</b></span><span>Current <b className="tabular text-fg">{fmtCurrency(current)}</b></span><span>P/L <Signed value={pl} as="currency" className="text-xs"/></span></div></Panel>})}</div>}</Section>:null}
   {tab==="sold"?<Section title="Sold" hint="SELL transactions, newest first">{sold.length===0?<Empty title="No sold shares yet" body="Your SELL transactions will appear here."/>:<div className="space-y-2">{sold.map(t=><TransactionCard key={t.id} tx={t} onDelete={removeTx}/>)}</div>}</Section>:null}
   {tab==="history"?<Section title="Transaction History" hint="BUY + SELL, date-wise">{transactions.length===0?<Empty title="No transactions" body="Add your first BUY or SELL transaction."/>:<div className="space-y-2">{transactions.map(t=><TransactionCard key={t.id} tx={t} onDelete={removeTx}/>)}</div>}</Section>:null}
  </>}
  {showTx&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e=>{if(e.currentTarget===e.target)setShowTx(false)}}><Panel className="w-full max-w-md p-5"><div className="flex items-center justify-between"><h3 className="font-display text-xl">Add Transaction</h3><button onClick={()=>setShowTx(false)} className="text-muted">×</button></div><div className="mt-4 space-y-3"><input value={tx.symbol} onChange={e=>setTx({...tx,symbol:e.target.value.toUpperCase()})} className="w-full rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Stock symbol e.g. TCS"/><div className="grid grid-cols-2 gap-2"><select value={tx.side} onChange={e=>setTx({...tx,side:e.target.value as "BUY"|"SELL"})} className="rounded-lg border bg-bg px-3 py-2 text-sm"><option>BUY</option><option>SELL</option></select><select value={tx.exchange} onChange={e=>setTx({...tx,exchange:e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm"><option>NSE</option><option>BSE</option></select></div><div className="grid grid-cols-2 gap-2"><input type="number" min="0.0001" value={tx.quantity} onChange={e=>setTx({...tx,quantity:e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Quantity"/><input type="number" min="0" step="0.01" value={tx.price} onChange={e=>setTx({...tx,price:e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Price"/></div><div className="grid grid-cols-2 gap-2"><input type="date" value={tx.tradeDate} onChange={e=>setTx({...tx,tradeDate:e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm"/><input type="number" min="0" step="0.01" value={tx.charges} onChange={e=>setTx({...tx,charges:e.target.value})} className="rounded-lg border bg-bg px-3 py-2 text-sm" placeholder="Charges"/></div><Button className="w-full" onClick={saveTx}>Save Transaction</Button></div></Panel></div>}
 </div>;
}
function TransactionCard({tx,onDelete}:{tx:Tx;onDelete:(id:string)=>void}){return <Panel className="p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{displaySymbol(tx.symbol)}</div><div className="text-xs text-muted">{tx.exchange} · {tx.tradeDate}</div></div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${tx.side==="BUY"?"bg-up/15 text-up":"bg-down/15 text-down"}`}>{tx.side}</span><button type="button" onClick={()=>onDelete(tx.id)} className="rounded-md p-1 text-muted hover:text-down" title="Delete"><Trash2 className="size-3.5"/></button></div></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted"><span>Qty <b className="tabular text-fg">{trim(tx.quantity)}</b></span><span>Price <b className="tabular text-fg">{fmtCurrency(tx.price)}</b></span><span>Value <b className="tabular text-fg">{fmtCurrency(tx.quantity*tx.price)}</b></span></div></Panel>}
function trim(n:number){return Number.isInteger(n)?String(n):n.toFixed(4).replace(/0+$/g,"").replace(/\.$/,"")}
function buildHoldings(txs:Tx[]):HoldingRow[]{const map=new Map<string,HoldingRow>();for(const t of [...txs].sort((a,b)=>a.tradeDate.localeCompare(b.tradeDate)||a.id.localeCompare(b.id))){const key=`${t.exchange}:${t.symbol}`;const row=map.get(key)??{symbol:t.symbol,exchange:t.exchange,qty:0,avg:0,invested:0,realized:0};if(t.side==="BUY"){const newQty=row.qty+t.quantity;row.avg=newQty?(row.avg*row.qty+t.price*t.quantity)/newQty:t.price;row.qty=newQty;row.invested=row.qty*row.avg;}else{const cost=row.avg*t.quantity;row.realized+=t.price*t.quantity-cost-t.charges;row.qty=Math.max(0,row.qty-t.quantity);row.invested=row.qty*row.avg;}map.set(key,row);}return [...map.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol));}

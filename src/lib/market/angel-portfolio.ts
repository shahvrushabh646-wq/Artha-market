import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";

type Tx={id:string;broker:string;brokerTradeId:string|null;symbol:string;exchange:string;company:string;side:"BUY"|"SELL";quantity:number;price:number;tradeDate:string;charges:number;source:string};

export const getPortfolioAccounts=createServerFn({method:"GET"}).handler(async()=>{
  const sql=await getSql();
  return await sql.query<any>("select id,name,sort_order as \"sortOrder\" from portfolio_accounts order by sort_order,id");
});

export const renamePortfolioAccount=createServerFn({method:"POST"}).handler(async(ctx)=>{
  const input=ctx.data as {id?:string;name?:string};
  const id=String(input?.id??"").trim();
  const name=String(input?.name??"").trim().slice(0,60);
  if(!id||!name) throw new Error("Account name is required");
  const sql=await getSql();
  const rows=await sql`update portfolio_accounts set name=${name},updated_at=now() where id=${id} returning id,name,sort_order as "sortOrder"`;
  if(!rows.length) throw new Error("Account not found");
  return rows[0];
});

export const addPortfolioAccount=createServerFn({method:"POST"}).handler(async(ctx)=>{
  const input=ctx.data as {name?:string};
  const name=String(input?.name??"").trim().slice(0,60);
  if(!name) throw new Error("Account name is required");
  const sql=await getSql();
  const rows=await sql.query<any>("select count(*)::int as count from portfolio_accounts");
  const count=Number(rows[0]?.count??0);
  if(count>=10) throw new Error("Maximum 10 portfolio accounts allowed");
  const id=`account-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const created=await sql`insert into portfolio_accounts (id,name,sort_order) values (${id},${name},${count+1}) returning id,name,sort_order as "sortOrder"`;
  return created[0];
});

export const getPortfolioTransactions=createServerFn({method:"GET"}).handler(async(ctx)=>{
  const input=ctx.data as {accountId?:string};
  const accountId=String(input?.accountId??"").trim();
  if(!accountId) return [];
  const sql=await getSql();
  return await sql.query<any>("select id,broker,broker_trade_id as \"brokerTradeId\",symbol,exchange,company,side,quantity,price,trade_date as \"tradeDate\",charges,source from portfolio_transactions where account_id=$1 order by trade_date desc,created_at desc",[accountId]);
});

export const addPortfolioTransaction=createServerFn({method:"POST"}).handler(async(ctx)=>{
  const input=ctx.data as {accountId?:string;symbol?:string;exchange?:string;company?:string;side?:"BUY"|"SELL";quantity?:number;price?:number;tradeDate?:string;charges?:number};
  const accountId=String(input?.accountId??"").trim();
  const symbol=String(input?.symbol??"").trim().toUpperCase();
  const exchange=String(input?.exchange??"NSE").trim().toUpperCase()||"NSE";
  const side=input?.side;
  const quantity=Number(input?.quantity);
  const price=Number(input?.price);
  const tradeDate=String(input?.tradeDate??"").trim();
  const charges=Number(input?.charges??0);
  if(!accountId||!symbol||!side||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<0||!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) throw new Error("Please enter valid transaction details");
  const sql=await getSql();
  const account=await sql`select id from portfolio_accounts where id=${accountId}`;
  if(!account.length) throw new Error("Account not found");
  const id=`manual-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  await sql`insert into portfolio_transactions (id,account_id,broker,broker_trade_id,symbol,exchange,company,side,quantity,price,trade_date,charges,source) values (${id},${accountId},'manual',${id},${symbol},${exchange},${symbol},${side},${quantity},${price},${tradeDate},${Number.isFinite(charges)&&charges>=0?charges:0},'manual')`;
  return {ok:true,id};
});

export const deletePortfolioTransaction=createServerFn({method:"POST"}).handler(async(ctx)=>{
  const input=ctx.data as {accountId?:string;id?:string};
  const accountId=String(input?.accountId??"").trim();
  const id=String(input?.id??"").trim();
  if(!accountId||!id) throw new Error("Transaction not found");
  const sql=await getSql();
  await sql`delete from portfolio_transactions where id=${id} and account_id=${accountId}`;
  return {ok:true};
});

export const getAngelStatus=createServerFn({method:"GET"}).handler(async()=>({configured:false}));
export const getAngelHoldings=createServerFn({method:"GET"}).handler(async()=>[]);
export const syncAngelPortfolio=createServerFn({method:"POST"}).handler(async()=>{throw new Error("Angel One connection is disabled. Portfolio is manual now.");});
export const importPortfolioTransactions=createServerFn({method:"POST"}).handler(async()=>{throw new Error("CSV import is disabled in this simple portfolio setup.");});

import { createServerFn } from "@tanstack/react-start";
import { createHmac } from "node:crypto";
import { getSql } from "@/lib/db";

type Tx = {
  id: string;
  broker: string;
  brokerTradeId: string | null;
  symbol: string;
  exchange: string;
  company: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  tradeDate: string;
  charges: number;
  source: string;
};

type AngelConfig = {
  apiKey: string;
  clientCode: string;
  password: string;
  totpSecret: string;
};

const BASE = "https://apiconnect.angelone.in";
const globalRef = globalThis as typeof globalThis & {
  __arthaAngelSession__?: { jwt: string; expiresAt: number };
};

function config(): AngelConfig {
  const apiKey = process.env.ANGEL_API_KEY?.trim();
  const clientCode = process.env.ANGEL_CLIENT_CODE?.trim();
  const password = process.env.ANGEL_PASSWORD?.trim();
  const totpSecret = process.env.ANGEL_TOTP_SECRET?.trim();
  if (!apiKey || !clientCode || !password || !totpSecret) {
    throw new Error("Angel One is not configured. Add ANGEL_API_KEY, ANGEL_CLIENT_CODE, ANGEL_PASSWORD and ANGEL_TOTP_SECRET to server environment variables.");
  }
  return { apiKey, clientCode, password, totpSecret };
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Bytes(value: string): Buffer {
  const clean = value.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const ch of clean) {
    const n = alphabet.indexOf(ch);
    if (n < 0) throw new Error("Invalid Angel One TOTP secret");
    bits += n.toString(2).padStart(5, "0");
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

function totp(secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", base32Bytes(secret)).update(buf).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const code = ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

async function angelLogin(): Promise<string> {
  const cached = globalRef.__arthaAngelSession__;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.jwt;
  const c = config();
  const response = await fetch(`${BASE}/rest/auth/angelbroking/user/v1/loginByPassword`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-PrivateKey": c.apiKey,
      "X-UserType": "USER",
      "X-SourceID": "WEB",
    },
    body: JSON.stringify({ clientcode: c.clientCode, password: c.password, totp: totp(c.totpSecret) }),
  });
  const body = (await response.json()) as { status?: boolean; message?: string; errorcode?: string; data?: { jwtToken?: string } };
  if (!response.ok || !body.status || !body.data?.jwtToken) throw new Error(body.message || body.errorcode || "Angel One login failed");
  globalRef.__arthaAngelSession__ = { jwt: body.data.jwtToken, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
  return body.data.jwtToken;
}

async function angelGet(path: string): Promise<any> {
  const c = config();
  const jwt = await angelLogin();
  const response = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${jwt}`,
      "X-PrivateKey": c.apiKey,
      "X-UserType": "USER",
      "X-SourceID": "WEB",
    },
  });
  const body = await response.json();
  if (!response.ok || body?.status === false) throw new Error(body?.message || body?.errorcode || "Angel One request failed");
  return body;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTrade(row: any): Tx | null {
  const symbol = String(row?.tradingsymbol ?? "").trim();
  const exchange = String(row?.exchange ?? "NSE").trim().toUpperCase();
  const side = String(row?.transactiontype ?? "").toUpperCase() as Tx["side"];
  const quantity = num(row?.fillshares ?? row?.filledshares ?? row?.quantity);
  const price = num(row?.fillprice ?? row?.averageprice ?? row?.price);
  const stamp = String(row?.filltime ?? row?.exchtime ?? row?.updatetime ?? "");
  if (!symbol || !["BUY", "SELL"].includes(side) || quantity <= 0) return null;
  const parsed = new Date(stamp);
  const tradeDate = Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
  const brokerTradeId = String(row?.fillid || row?.exchangeorderid || row?.uniqueorderid || row?.orderid || "");
  return {
    id: `angel-${brokerTradeId || `${exchange}-${symbol}-${side}-${tradeDate}-${quantity}-${price}`}`,
    broker: "angel-one",
    brokerTradeId: brokerTradeId || null,
    symbol,
    exchange,
    company: String(row?.tradingsymbol ?? symbol).replace(/-EQ$/i, ""),
    side,
    quantity,
    price,
    tradeDate,
    charges: 0,
    source: "angel-tradebook",
  };
}

async function insertTransactions(items: Tx[]) {
  const sql = await getSql();
  let inserted = 0;
  for (const t of items) {
    const rows = await sql`
      insert into portfolio_transactions
        (id, broker, broker_trade_id, symbol, exchange, company, side, quantity, price, trade_date, charges, source)
      values
        (${t.id}, ${t.broker}, ${t.brokerTradeId}, ${t.symbol}, ${t.exchange}, ${t.company}, ${t.side}, ${t.quantity}, ${t.price}, ${t.tradeDate}, ${t.charges}, ${t.source})
      on conflict (broker, broker_trade_id) do nothing
      returning id
    `;
    if (rows.length) inserted += 1;
  }
  return inserted;
}

export const getAngelStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    config();
    return { configured: true };
  } catch {
    return { configured: false };
  }
});

export const syncAngelPortfolio = createServerFn({ method: "POST" }).handler(async () => {
  const [holdingBody, tradeBody] = await Promise.all([
    angelGet("/rest/secure/angelbroking/portfolio/v1/getAllHolding"),
    angelGet("/rest/secure/angelbroking/order/v1/getTradeBook"),
  ]);
  const trades = (Array.isArray(tradeBody?.data) ? tradeBody.data : []).map(normalizeTrade).filter(Boolean) as Tx[];
  const inserted = await insertTransactions(trades);
  const holdings = Array.isArray(holdingBody?.data) ? holdingBody.data : [];
  return { ok: true, inserted, holdingsCount: holdings.length, holdings };
});

export const getPortfolioTransactions = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql.query<any>("select id, broker, broker_trade_id as \"brokerTradeId\", symbol, exchange, company, side, quantity, price, trade_date as \"tradeDate\", charges, source from portfolio_transactions order by trade_date desc, created_at desc");
  return rows;
});

export const importPortfolioTransactions = createServerFn({ method: "POST" }).handler(async (ctx) => {
  const input = ctx.data as { transactions?: Tx[] };
  const items = Array.isArray(input?.transactions) ? input.transactions : [];
  if (!items.length) return { inserted: 0 };
  return { inserted: await insertTransactions(items.map((x) => ({ ...x, broker: x.broker || "manual-import", source: x.source || "angel-csv" }))) };
});

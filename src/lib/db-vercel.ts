import { Pool, types } from "pg";

export type DbSource = "neon" | "memory";

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;

// Artha no longer hard-fails when Vercel does not expose DATABASE_URL.
// If DATABASE_URL exists we use Postgres. Otherwise we use a lightweight
// server-memory fallback so the app can boot and the manual portfolio works.
export const dbSource: DbSource = process.env.DATABASE_URL?.trim() ? "neon" : "memory";

export interface Sql {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

type MemoryAccount = { id: string; name: string; sortOrder: number };
type MemoryTx = {
  id: string; accountId: string; broker: string; brokerTradeId: string | null;
  symbol: string; exchange: string; company: string; side: "BUY" | "SELL";
  quantity: number; price: number; tradeDate: string; charges: number; source: string;
};

const globalRef = globalThis as typeof globalThis & {
  __arthaPgSqlPromise__?: Promise<Sql>;
  __arthaMemoryAccounts__?: MemoryAccount[];
  __arthaMemoryTx__?: MemoryTx[];
};

const identity = (value: string) => value;
type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1] ?? ""}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) => run<T>(text, params);
  return sql;
}

function memoryRun<T>(text: string, params: unknown[]): Promise<T[]> {
  const q = text.replace(/\s+/g, " ").trim().toLowerCase();
  const accounts = (globalRef.__arthaMemoryAccounts__ ??= [1, 2, 3, 4, 5].map((n) => ({
    id: `account-${n}`, name: `Account ${n}`, sortOrder: n,
  })));
  const txs = (globalRef.__arthaMemoryTx__ ??= []);

  if (q === "select 1") return Promise.resolve([{ '?column?': 1 } as T]);

  if (q.includes("select id,name,sort_order as \"sortorder\" from portfolio_accounts")) {
    return Promise.resolve(accounts.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((a) => ({
      id: a.id, name: a.name, sortOrder: a.sortOrder,
    })) as T[]);
  }

  if (q.includes("select count(*)::int as count from portfolio_accounts")) {
    return Promise.resolve([{ count: accounts.length } as T]);
  }

  if (q.includes("select id from portfolio_accounts where id=")) {
    const id = String(params[0] ?? "");
    return Promise.resolve(accounts.filter((a) => a.id === id).map((a) => ({ id: a.id })) as T[]);
  }

  if (q.includes("update portfolio_accounts set name=")) {
    const name = String(params[0] ?? "");
    const id = String(params[1] ?? "");
    const account = accounts.find((a) => a.id === id);
    if (!account) return Promise.resolve([]);
    account.name = name;
    return Promise.resolve([{ id: account.id, name: account.name, sortOrder: account.sortOrder }] as T[]);
  }

  if (q.includes("insert into portfolio_accounts")) {
    const id = String(params[0] ?? `account-${Date.now()}`);
    const name = String(params[1] ?? "Account");
    const sortOrder = Number(params[2] ?? accounts.length + 1);
    if (!accounts.some((a) => a.id === id)) accounts.push({ id, name, sortOrder });
    return Promise.resolve([]);
  }

  if (q.includes("select count(*)::int as count from portfolio_transactions")) {
    return Promise.resolve([{ count: txs.length } as T]);
  }

  if (q.includes("select id,broker,broker_trade_id as \"brokertradeid\"")) {
    const accountId = String(params[0] ?? "");
    const rows = txs.filter((t) => t.accountId === accountId).sort((a, b) =>
      `${b.tradeDate}-${b.id}`.localeCompare(`${a.tradeDate}-${a.id}`));
    return Promise.resolve(rows.map((t) => ({
      id: t.id, broker: t.broker, brokerTradeId: t.brokerTradeId, symbol: t.symbol,
      exchange: t.exchange, company: t.company, side: t.side, quantity: t.quantity,
      price: t.price, tradeDate: t.tradeDate, charges: t.charges, source: t.source,
    })) as T[]);
  }

  if (q.includes("select coalesce(sum(case when side='buy'")) {
    const accountId = String(params[0] ?? "");
    const symbol = String(params[1] ?? "").toUpperCase();
    const exchange = String(params[2] ?? "NSE").toUpperCase();
    const quantity = txs.filter((t) => t.accountId === accountId && t.symbol === symbol && t.exchange === exchange)
      .reduce((sum, t) => sum + (t.side === "BUY" ? t.quantity : -t.quantity), 0);
    return Promise.resolve([{ quantity }] as T[]);
  }

  if (q.startsWith("insert into portfolio_transactions")) {
    // Values are ordered exactly like the portfolio INSERT statement.
    const [id, accountId, broker, brokerTradeId, symbol, exchange, company, side, quantity, price, tradeDate, charges, source] = params;
    txs.push({
      id: String(id), accountId: String(accountId), broker: String(broker),
      brokerTradeId: brokerTradeId == null ? null : String(brokerTradeId), symbol: String(symbol),
      exchange: String(exchange), company: String(company), side: String(side) as "BUY" | "SELL",
      quantity: Number(quantity), price: Number(price), tradeDate: String(tradeDate),
      charges: Number(charges ?? 0), source: String(source ?? "manual"),
    });
    return Promise.resolve([]);
  }

  if (q.startsWith("delete from portfolio_transactions")) {
    const id = String(params[0] ?? "");
    const accountId = String(params[1] ?? "");
    globalRef.__arthaMemoryTx__ = txs.filter((t) => !(t.id === id && t.accountId === accountId));
    return Promise.resolve([]);
  }

  // DDL used by the portfolio runtime schema is intentionally a no-op here.
  if (/^(create|alter|update|drop)\s/.test(q)) return Promise.resolve([]);

  // Keep unrelated legacy DB-backed screens from crashing the entire app.
  return Promise.resolve([]);
}

function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") throw new Error("Database access is server-only");
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) return Promise.resolve(toSql(memoryRun));

  if (globalRef.__arthaPgSqlPromise__) return globalRef.__arthaPgSqlPromise__;

  globalRef.__arthaPgSqlPromise__ = (async () => {
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);
    const pool = new Pool({ connectionString: databaseUrl, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
    await pool.query("select 1");
    return toSql(async <T>(text: string, params: unknown[]) => (await pool.query(text, params)).rows as T[]);
  })().catch((error) => {
    globalRef.__arthaPgSqlPromise__ = undefined;
    throw error;
  });
  return globalRef.__arthaPgSqlPromise__;
}

export function getSql(): Promise<Sql> { return createSql(); }
export function ensureDbReady(): Promise<void> { return getSql().then(() => undefined); }

import { Pool, types } from "pg";

export type DbSource = "neon";

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const databaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL?.trim() : undefined;

export const dbSource: DbSource = "neon";

export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

const globalRef = globalThis as typeof globalThis & {
  __arthaPgSqlPromise__?: Promise<Sql>;
};

const identity = (value: string) => value;

types Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) {
      text += `$${i + 1}${strings[i + 1] ?? ""}`;
    }
    return run<T>(text, values);
  }) as unknown as Sql;

  sql.query = <T = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ) => run<T>(text, params);

  return sql;
}

function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error("Database access is server-only");
  }

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured. Add a Neon/Postgres DATABASE_URL in Vercel Environment Variables.",
    );
  }

  globalRef.__arthaPgSqlPromise__ ??= (async () => {
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });

    return toSql(async <T>(text: string, params: unknown[]) => {
      const result = await pool.query(text, params);
      return result.rows as T[];
    });
  })().catch((error) => {
    globalRef.__arthaPgSqlPromise__ = undefined;
    throw error;
  });

  return globalRef.__arthaPgSqlPromise__;
}

export function getSql(): Promise<Sql> {
  return createSql();
}

export function ensureDbReady(): Promise<void> {
  return getSql().then(() => undefined);
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const DEFAULT_TIMEOUT_MS = 8000;

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return {
    "User-Agent": UA,
    Accept: "application/json, text/html, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    ...extra,
  };
}

async function once(url: string, extraHeaders: Record<string, string> | undefined, timeoutMs: number): Promise<string> {
  const r = await fetchWithTimeout(url, { headers: headers(extraHeaders) }, timeoutMs);
  if (!r.ok) throw new HttpError(`HTTP ${r.status} for ${url}`, r.status);
  return await r.text();
}

export async function fetchText(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; retries?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? 1;
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await once(url, opts.headers, timeoutMs);
    } catch (err) {
      last = err;
      if (i < retries) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text) as T;
  } catch {
    const s = text.trim();
    const a = s.indexOf("[");
    const o = s.indexOf("{");
    const start = a >= 0 && (o < 0 || a < o) ? a : o;
    if (start >= 0) {
      const end = Math.max(s.lastIndexOf("]"), s.lastIndexOf("}"));
      if (end > start) return JSON.parse(s.slice(start, end + 1)) as T;
    }
    throw new Error(`Non-JSON response from ${url}`);
  }
}

export async function settle<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

type Entry<T> = { expires: number; value: T };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) return undefined;
  return hit.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;
  const run = (async () => {
    try {
      const value = await loader();
      cacheSet(key, value, ttlMs);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}

export function cachePeek<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

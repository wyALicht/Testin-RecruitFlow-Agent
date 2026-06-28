/**
 * 进程内只读缓存工具。
 *
 * 用于候选人、岗位、原始输入、Agent 日志和 Dashboard 等读多写少页面。
 * 缓存仅存在于当前 Node.js 进程，写操作需要按前缀主动失效；它不是 Redis，也不跨实例共享。
 */
type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

declare global {
  var __recruitFlowServerCache: Map<string, CacheEntry<unknown>> | undefined;
}

const cacheStore = global.__recruitFlowServerCache ?? new Map<string, CacheEntry<unknown>>();

if (!global.__recruitFlowServerCache) {
  global.__recruitFlowServerCache = cacheStore;
}

function isFresh(entry: CacheEntry<unknown> | undefined, now: number) {
  return Boolean(entry && entry.expiresAt > now);
}

export async function readThroughCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  // 同一个 key 过期后只保留一个加载中的 promise，避免并发请求同时打到数据库。
  const now = Date.now();
  const existing = cacheStore.get(key);

  if (isFresh(existing, now)) {
    if (existing?.promise) {
      return existing.promise as Promise<T>;
    }

    return existing?.value as T;
  }

  const promise = loader()
    .then((value) => {
      cacheStore.set(key, {
        expiresAt: Date.now() + ttlMs,
        value
      });
      return value;
    })
    .catch((error) => {
      const current = cacheStore.get(key);
      if (current?.promise === promise) {
        cacheStore.delete(key);
      }
      throw error;
    });

  cacheStore.set(key, {
    expiresAt: now + ttlMs,
    promise
  });

  return promise;
}

export function invalidateCacheKeys(...keys: string[]) {
  for (const key of keys) {
    cacheStore.delete(key);
  }
}

export function invalidateCacheByPrefix(...prefixes: string[]) {
  if (!prefixes.length) {
    cacheStore.clear();
    return;
  }

  for (const key of cacheStore.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      cacheStore.delete(key);
    }
  }
}

export const READ_CACHE_TTL = {
  short: 10_000,
  medium: 30_000
} as const;

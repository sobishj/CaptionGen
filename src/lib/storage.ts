/**
 * Tiny JSON key-value storage used for admin settings (AI models, admin users).
 * Cloudflare KV in production; an in-memory map for tests and plain Node.
 * To move to a database (D1, SQLite, Postgres…), implement this interface.
 */
export interface JsonStore {
  readonly kind: "kv" | "memory";
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
}

/** The subset of the Workers KV API we use. */
export interface KvNamespaceLike {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

const PREFIX = "captiongen:";

export function createKvStore(kv: KvNamespaceLike): JsonStore {
  return {
    kind: "kv",
    async get<T>(key: string) {
      return ((await kv.get(PREFIX + key, "json")) as T | null) ?? null;
    },
    async put(key, value) {
      await kv.put(PREFIX + key, JSON.stringify(value));
    },
  };
}

export function createMemoryStore(): JsonStore {
  const map = new Map<string, string>();
  return {
    kind: "memory",
    async get<T>(key: string) {
      const v = map.get(key);
      return v === undefined ? null : (JSON.parse(v) as T);
    },
    async put(key, value) {
      map.set(key, JSON.stringify(value));
    },
  };
}

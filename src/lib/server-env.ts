import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadConfig } from "./config";
import { createMemoryRateLimiter, type RateLimiter } from "./rate-limit";
import { createKvStore, createMemoryStore, type JsonStore, type KvNamespaceLike } from "./storage";

/**
 * Server wiring for the current host. This is the only Cloudflare-specific file
 * in src/: off Cloudflare it falls back to process.env and in-memory storage.
 */

function cloudflareEnv(): Record<string, unknown> | null {
  try {
    return getCloudflareContext().env as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readServerEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const [k, v] of Object.entries(cloudflareEnv() ?? {})) if (typeof v === "string") env[k] = v;
  return env;
}

export function getConfig() {
  return loadConfig(readServerEnv());
}

let memoryStore: JsonStore | null = null;

/** Admin settings storage: the SETTINGS KV namespace when bound, otherwise memory. */
export function getStore(): JsonStore {
  const kv = cloudflareEnv()?.SETTINGS as KvNamespaceLike | undefined;
  if (kv && typeof kv.get === "function") return createKvStore(kv);
  memoryStore ??= createMemoryStore();
  return memoryStore;
}

export function getRuntime(): "cloudflare" | "node" {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers" ? "cloudflare" : "node";
}

let generateLimiter: { limit: number; instance: RateLimiter } | null = null;

export function getGenerateLimiter(limit: number): RateLimiter {
  if (!generateLimiter || generateLimiter.limit !== limit) {
    generateLimiter = { limit, instance: createMemoryRateLimiter(limit) };
  }
  return generateLimiter.instance;
}

export const loginLimiter = createMemoryRateLimiter(5, 15 * 60_000);

export interface RateLimiter {
  /** Returns true if the request is allowed. */
  check(key: string): boolean;
}

/**
 * Fixed-window in-memory limiter. On Cloudflare this is per isolate, which is
 * fine for an MVP; swap in the Workers Rate Limiting binding or KV for strict
 * global limits by implementing the same interface.
 */
export function createMemoryRateLimiter(limit: number, windowMs = 60_000, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key) {
      const t = now();
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        hits.set(key, { count: 1, resetAt: t + windowMs });
        return true;
      }
      if (entry.count >= limit) return false;
      entry.count++;
      return true;
    },
  };
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

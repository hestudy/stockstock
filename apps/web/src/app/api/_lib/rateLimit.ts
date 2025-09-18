// Simple in-memory rate limiter (per-process). Suitable for dev/test.
// Keyed by identifier (e.g., `${ownerId}:${path}`)
// Sliding window with fixed window approximation.

type Bucket = {
  count: number;
  windowStart: number; // ms
};

const store = new Map<string, Bucket>();

export type RateLimitOptions = {
  limit?: number; // max requests per window
  windowMs?: number; // window size in ms
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // epoch ms
};

export function rateLimit(key: string, opts: RateLimitOptions = {}): RateLimitResult {
  const limit = opts.limit ?? 30;
  const windowMs = opts.windowMs ?? 60_000;
  const now = Date.now();
  const bucket = store.get(key);
  if (!bucket) {
    const b: Bucket = { count: 1, windowStart: now };
    store.set(key, b);
    return { allowed: true, remaining: limit - 1, limit, resetAt: now + windowMs };
  }
  const elapsed = now - bucket.windowStart;
  if (elapsed >= windowMs) {
    bucket.count = 1;
    bucket.windowStart = now;
    return { allowed: true, remaining: limit - 1, limit, resetAt: now + windowMs };
  }
  if (bucket.count < limit) {
    bucket.count += 1;
    return { allowed: true, remaining: limit - bucket.count, limit, resetAt: bucket.windowStart + windowMs };
  }
  return { allowed: false, remaining: 0, limit, resetAt: bucket.windowStart + windowMs };
}

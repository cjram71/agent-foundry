type Entry = { count: number; resetAt: number };
const attempts = new Map<string, Entry>();
const MAX_ENTRIES = 10_000;

export function checkRateLimit(key: string, limit = 5, windowMs = 15 * 60_000): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  if (attempts.size >= MAX_ENTRIES) for (const [entryKey, entry] of attempts) if (entry.resetAt <= now) attempts.delete(entryKey);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + windowMs }); return { allowed: true, retryAfter: 0 }; }
  current.count += 1;
  return { allowed: current.count <= limit, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
}

export function clearRateLimit(key: string): void { attempts.delete(key); }

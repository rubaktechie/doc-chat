import { TOKEN_LIMIT_PER_HOUR } from '../config.js';

// Per-user hourly token budget (fixed window, in-memory — single-process
// backend). Chat completions and embedding calls both count toward it, so a
// user can't burn unbounded provider spend. TOKEN_LIMIT_PER_HOUR=0 disables.
const WINDOW_MS = 60 * 60 * 1000;
const buckets = new Map(); // userId -> { start, tokens }

function bucketFor(userId, now) {
  let b = buckets.get(userId);
  if (!b || now - b.start >= WINDOW_MS) {
    b = { start: now, tokens: 0 };
    buckets.set(userId, b);
  }
  return b;
}

// `now` is injectable for tests.
export function checkBudget(userId, now = Date.now()) {
  if (!TOKEN_LIMIT_PER_HOUR) return { allowed: true, remaining: Infinity };
  const b = bucketFor(userId, now);
  const remaining = Math.max(0, TOKEN_LIMIT_PER_HOUR - b.tokens);
  return { allowed: remaining > 0, remaining, resetInMs: b.start + WINDOW_MS - now };
}

export function recordUsage(userId, tokens, now = Date.now()) {
  if (!TOKEN_LIMIT_PER_HOUR || !tokens) return;
  bucketFor(userId, now).tokens += tokens;
}

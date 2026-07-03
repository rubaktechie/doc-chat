// Fixed-window request limiter, in-memory (the backend is a single process by
// design — a multi-instance deployment would move this to Redis or the LB).
export function makeLimiter({ windowMs, max, message }) {
  const hits = new Map(); // key -> { start, count }

  return (req, res, next) => {
    const now = Date.now();

    // Opportunistic sweep so long-running processes don't accumulate stale keys.
    if (hits.size > 10_000) {
      for (const [k, h] of hits) if (now - h.start >= windowMs) hits.delete(k);
    }

    const key = req.ip;
    let h = hits.get(key);
    if (!h || now - h.start >= windowMs) {
      h = { start: now, count: 0 };
      hits.set(key, h);
    }
    h.count += 1;
    if (h.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((h.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: message || 'Too many requests. Try again later.' });
    }
    next();
  };
}

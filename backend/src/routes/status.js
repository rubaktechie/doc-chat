import express from 'express';
import db from '../db.js';
import { DEFAULT_PROVIDER, PROVIDERS } from '../config.js';

const router = express.Router();

// Lightweight operational snapshot: row counts, configured providers, uptime.
// Open (no auth) so it can double as a readiness/metrics probe.
router.get('/', (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  res.json({
    ok: true,
    uptime_s: Math.round(process.uptime()),
    counts: {
      users: count('SELECT COUNT(*) AS n FROM users'),
      documents: count('SELECT COUNT(*) AS n FROM documents'),
      documents_ready: count("SELECT COUNT(*) AS n FROM documents WHERE status = 'ready'"),
      chunks: count('SELECT COUNT(*) AS n FROM chunks'),
    },
    default_provider: DEFAULT_PROVIDER,
    providers: Object.keys(PROVIDERS),
  });
});

export default router;

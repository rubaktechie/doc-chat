import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import db from './db.js'; // runs migrations on import
import { logger } from './logger.js';
import { requireAuth } from './middleware/auth.js';
import { makeLimiter } from './services/ratelimit.js';
import { AUTH_RATE_MAX, AUTH_RATE_WINDOW_MS } from './config.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import chatRoutes from './routes/chat.js';
import settingsRoutes from './routes/settings.js';
import statusRoutes from './routes/status.js';

export function createApp() {
  // Ingest runs in-process, so a document still 'processing' at startup can
  // only mean a previous process died mid-ingest. Surface those as retryable
  // failures instead of leaving clients polling a status that never resolves.
  const orphaned = db
    .prepare(
      "UPDATE documents SET status = 'error', error = 'Processing was interrupted by a server restart — retry to re-ingest.' WHERE status = 'processing'",
    )
    .run();
  if (orphaned.changes > 0) {
    logger.warn({ count: orphaned.changes }, 'marked interrupted ingests as failed');
  }

  const app = express();

  // Request logging + a request id on every request/response.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // Quiet the health probe.
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/status', statusRoutes);

  // Per-IP limiter on auth: slows credential stuffing / brute force.
  const authLimiter = makeLimiter({
    windowMs: AUTH_RATE_WINDOW_MS,
    max: AUTH_RATE_MAX,
    message: 'Too many attempts — try again later.',
  });
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/documents', requireAuth, documentRoutes);
  app.use('/api/chat', requireAuth, chatRoutes);
  app.use('/api/settings', requireAuth, settingsRoutes);

  // Fallback error handler.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File exceeds the 25 MB upload limit.' });
    }
    req.log?.error({ err }, 'unhandled error');
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  });

  return app;
}

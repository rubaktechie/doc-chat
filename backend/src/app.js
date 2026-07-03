import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import './db.js'; // runs migrations on import
import { logger } from './logger.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import chatRoutes from './routes/chat.js';
import settingsRoutes from './routes/settings.js';
import statusRoutes from './routes/status.js';

export function createApp() {
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

  app.use('/api/auth', authRoutes);
  app.use('/api/documents', requireAuth, documentRoutes);
  app.use('/api/chat', requireAuth, chatRoutes);
  app.use('/api/settings', requireAuth, settingsRoutes);

  // Fallback error handler (e.g. multer file-size errors).
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    req.log?.error({ err }, 'unhandled error');
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
  });

  return app;
}

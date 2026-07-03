import pino from 'pino';

// Structured JSON logger. Pretty-prints in dev when LOG_PRETTY=1 (requires
// pino-pretty, optional); otherwise emits one JSON object per line — ideal for
// shipping to a log aggregator in production.
const options = { level: process.env.LOG_LEVEL || 'info' };
if (process.env.LOG_PRETTY === '1') {
  options.transport = { target: 'pino-pretty', options: { colorize: true } };
}

export const logger = pino(options);

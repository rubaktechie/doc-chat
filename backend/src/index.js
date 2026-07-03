import { createApp } from './app.js';
import { logger } from './logger.js';
import { PORT } from './config.js';

const app = createApp();
app.listen(PORT, () => {
  logger.info({ port: PORT }, `doc-chat backend listening on http://localhost:${PORT}`);
});

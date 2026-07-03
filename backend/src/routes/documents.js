import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOADS_DIR } from '../config.js';
import { getResolvedProvider } from './settings.js';
import { runPython } from '../services/python.js';
import { indexPathFor } from '../services/retrieval.js';
import { chunkText } from '../services/chunk.js';
import { embedTexts } from '../services/embeddings.js';
import { enqueue } from '../services/queue.js';
import { checkBudget, recordUsage } from '../services/usage.js';
import { logger } from '../logger.js';
import db from '../db.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, String(req.userId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// Process a saved document: extract text (Python/markitdown), chunk + embed in
// Node, add the vectors to the user's FAISS index (Python), then persist rows.
async function processDocument(userId, docId, filePath, cfg) {
  const t0 = performance.now();
  try {
    // 1. Extract text via markitdown, then chunk it in Node.
    const { text } = await runPython('extract.py', ['--file', filePath]);
    const pieces = chunkText(text);

    // 2. Embed the chunks, then hand the vectors to FAISS (it assigns ids).
    // The add runs on the user's queue: add.py rewrites the whole index file,
    // so concurrent uploads must not interleave.
    const { vectors, tokens } = await embedTexts(cfg, pieces);
    recordUsage(userId, tokens);
    const { faiss_ids: faissIds = [] } = await enqueue(String(userId), () =>
      runPython(
        'add.py',
        ['--index', indexPathFor(userId, cfg.embedModel), '--embed-model', cfg.embedModel],
        { input: JSON.stringify({ vectors }) },
      ),
    );

    const chunks = pieces.map((text, i) => ({ faiss_id: faissIds[i], chunk_index: i, text }));
    const insert = db.prepare(
      'INSERT INTO chunks (document_id, user_id, faiss_id, chunk_index, text) VALUES (?, ?, ?, ?, ?)',
    );
    const insertMany = db.transaction((rows) => {
      for (const c of rows) insert.run(docId, userId, c.faiss_id, c.chunk_index, c.text);
    });
    insertMany(chunks);
    db.prepare(
      "UPDATE documents SET status = 'ready', chunk_count = ?, embed_model = ?, error = NULL WHERE id = ?",
    ).run(chunks.length, cfg.embedModel, docId);
    logger.info(
      { userId, docId, chunks: chunks.length, embedModel: cfg.embedModel, ms: Math.round(performance.now() - t0) },
      'ingest: ready',
    );
  } catch (err) {
    db.prepare("UPDATE documents SET status = 'error', error = ? WHERE id = ?").run(
      String(err.message || err),
      docId,
    );
    logger.error({ userId, docId, err: String(err.message || err) }, 'ingest: failed');
  }
}

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!checkBudget(req.userId).allowed) {
    fs.rm(req.file.path, { force: true }, () => {});
    return res.status(429).json({ error: 'Hourly token limit reached — try again later.' });
  }
  const cfg = getResolvedProvider(req.userId);
  const info = db
    .prepare(
      "INSERT INTO documents (user_id, stored_name, original_name, mime, status) VALUES (?, ?, ?, ?, 'processing')",
    )
    .run(req.userId, req.file.filename, req.file.originalname, req.file.mimetype);
  const docId = info.lastInsertRowid;

  // Process asynchronously; client polls status.
  processDocument(req.userId, docId, req.file.path, cfg);

  return res.status(202).json({ id: docId, status: 'processing', original_name: req.file.originalname });
});

router.get('/', (req, res) => {
  const docs = db
    .prepare(
      'SELECT id, original_name, status, chunk_count, embed_model, error, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC',
    )
    .all(req.userId);
  res.json({ documents: docs });
});

// Re-run ingestion for a document that failed processing (including ones
// marked failed after a server restart interrupted them).
router.post('/:id/retry', async (req, res) => {
  const doc = db
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (doc.status !== 'error') {
    return res.status(400).json({ error: 'Only failed documents can be retried' });
  }
  if (!checkBudget(req.userId).allowed) {
    return res.status(429).json({ error: 'Hourly token limit reached — try again later.' });
  }

  const filePath = path.join(UPLOADS_DIR, String(req.userId), doc.stored_name);
  if (!fs.existsSync(filePath)) {
    return res.status(409).json({ error: 'The original file is no longer on disk — delete and upload it again.' });
  }

  // Clear any partial state left by the failed attempt (vectors first, then
  // rows). Best effort on the index: ingest re-adds under fresh ids anyway.
  try {
    if (doc.embed_model) {
      const faissIds = db
        .prepare('SELECT faiss_id FROM chunks WHERE document_id = ? AND user_id = ?')
        .all(doc.id, req.userId)
        .map((r) => r.faiss_id);
      if (faissIds.length > 0) {
        await enqueue(String(req.userId), () =>
          runPython(
            'remove.py',
            ['--index', indexPathFor(req.userId, doc.embed_model), '--ids', faissIds.join(',')],
          ),
        );
      }
    }
  } catch (err) {
    req.log?.error({ docId: doc.id, err: err.message }, 'FAISS cleanup failed before retry');
  }
  db.prepare('DELETE FROM chunks WHERE document_id = ? AND user_id = ?').run(doc.id, req.userId);
  db.prepare(
    "UPDATE documents SET status = 'processing', error = NULL, chunk_count = 0 WHERE id = ?",
  ).run(doc.id);

  const cfg = getResolvedProvider(req.userId);
  processDocument(req.userId, doc.id, filePath, cfg);
  return res.status(202).json({ id: doc.id, status: 'processing', original_name: doc.original_name });
});

router.delete('/:id', async (req, res) => {
  const doc = db
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Drop this document's vectors from its model-specific FAISS index. Best
  // effort — proceed with row deletion even if the index cleanup fails.
  try {
    if (doc.embed_model) {
      const faissIds = db
        .prepare('SELECT faiss_id FROM chunks WHERE document_id = ? AND user_id = ?')
        .all(doc.id, req.userId)
        .map((r) => r.faiss_id);
      if (faissIds.length > 0) {
        await enqueue(String(req.userId), () =>
          runPython(
            'remove.py',
            ['--index', indexPathFor(req.userId, doc.embed_model), '--ids', faissIds.join(',')],
          ),
        );
      }
    }
  } catch (err) {
    req.log?.error({ docId: doc.id, err: err.message }, 'FAISS vector cleanup failed on delete');
  }

  const filePath = path.join(UPLOADS_DIR, String(req.userId), doc.stored_name);
  fs.rm(filePath, { force: true }, () => {});
  // Chunk rows are removed via ON DELETE CASCADE.
  db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true });
});

export default router;

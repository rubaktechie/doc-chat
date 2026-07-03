import path from 'node:path';
import db from '../db.js';
import { INDEXES_DIR } from '../config.js';
import { runPython } from './python.js';
import { embedTexts } from './embeddings.js';
import { enqueue } from './queue.js';
import { recordUsage } from './usage.js';

// Index files are keyed by (user, embed model) so switching embedding models is
// non-destructive: each model gets its own fixed-dimension index.
function sanitizeModel(name) {
  return String(name || 'default').replace(/[^\w.\-]+/g, '_');
}

export function indexPathFor(userId, embedModel) {
  return path.join(INDEXES_DIR, `${userId}__${sanitizeModel(embedModel)}.faiss`);
}

// Embed the question, search the active model's FAISS index, and hydrate the
// matching chunks with their text and source document name. Returns [] if none.
export async function retrieveContexts(userId, question, cfg, k = 5) {
  const { vectors: [vector], tokens } = await embedTexts(cfg, [question]);
  recordUsage(userId, tokens);
  // Reads share the user's queue too: on Windows the atomic index rename in
  // add.py/remove.py fails if a reader has the file open mid-swap.
  const result = await enqueue(String(userId), () =>
    runPython(
      'query.py',
      ['--index', indexPathFor(userId, cfg.embedModel), '--k', String(k)],
      { input: JSON.stringify({ vector }) },
    ),
  );
  const results = result.results || [];
  if (results.length === 0) return [];

  const faissIds = results.map((r) => r.faiss_id);
  const placeholders = faissIds.map(() => '?').join(',');
  // Filter by embed_model too: faiss_id counters are per-index, so the same id
  // can exist across models — the model filter disambiguates.
  const rows = db
    .prepare(
      `SELECT c.faiss_id, c.text, c.chunk_index, d.original_name, d.id AS document_id
       FROM chunks c JOIN documents d ON d.id = c.document_id
       WHERE c.user_id = ? AND d.embed_model = ? AND c.faiss_id IN (${placeholders})`,
    )
    .all(userId, cfg.embedModel, ...faissIds);

  const byFaiss = new Map(rows.map((r) => [r.faiss_id, r]));
  // Preserve FAISS ranking order and attach scores.
  return results
    .map((r) => {
      const row = byFaiss.get(r.faiss_id);
      return row ? { ...row, score: r.score } : null;
    })
    .filter(Boolean);
}

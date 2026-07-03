// Clear stored data. Usage:
//   node scripts/clear-db.js docs   -> remove documents, chunks, uploads, FAISS indexes (keeps users/settings)
//   node scripts/clear-db.js all    -> also remove users and settings (full wipe)
import fs from 'node:fs';
import path from 'node:path';
import db from '../src/db.js';
import { UPLOADS_DIR, INDEXES_DIR } from '../src/config.js';

const mode = process.argv[2] || 'docs';
if (!['docs', 'all'].includes(mode)) {
  console.error(`Unknown mode "${mode}". Use "docs" or "all".`);
  process.exit(1);
}

// Empty a directory's contents but keep the directory itself.
function emptyDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

const clearAll = db.transaction(() => {
  db.exec('DELETE FROM chunks; DELETE FROM documents;');
  if (mode === 'all') db.exec('DELETE FROM settings; DELETE FROM users;');
});
clearAll();

emptyDir(INDEXES_DIR);
emptyDir(UPLOADS_DIR);

console.log(
  mode === 'all'
    ? 'Cleared all users, settings, documents, chunks, uploads, and FAISS indexes.'
    : 'Cleared documents, chunks, uploads, and FAISS indexes (users kept).',
);
process.exit(0);

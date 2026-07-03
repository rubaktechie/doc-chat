import Database from 'better-sqlite3';
import fs from 'node:fs';
import { DATA_DIR, UPLOADS_DIR, INDEXES_DIR, DB_PATH } from './config.js';

// Ensure data directories exist before opening the DB.
for (const dir of [DATA_DIR, UPLOADS_DIR, INDEXES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime TEXT,
    status TEXT NOT NULL DEFAULT 'processing',   -- processing | ready | error
    chunk_count INTEGER NOT NULL DEFAULT 0,
    embed_model TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- FAISS vector id (assigned by add.py, unique per user index).
    faiss_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_user ON chunks(user_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_faiss ON chunks(user_id, faiss_id);

  CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT,
    chat_model TEXT,
    embed_model TEXT
  );
`);

export default db;

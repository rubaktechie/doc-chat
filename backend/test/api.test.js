import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockProvider } from './mock-provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server;
let base;
let mock;
let tmp;

// Shared state across the ordered tests below.
let tokenA;
let userA;
let tokenB;
let docId;

before(async () => {
  mock = await startMockProvider('Apollo 11 landed on the Moon on July 20, 1969 [1].');

  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docchat-test-'));
  // Env must be set before importing the app (config reads it at import time).
  process.env.DATA_DIR = tmp;
  process.env.LOG_LEVEL = 'silent';
  process.env.DEFAULT_PROVIDER = 'local';
  process.env.LOCAL_BASE_URL = mock.url;
  process.env.LOCAL_API_KEY = 'test';
  process.env.LOCAL_EMBED_MODEL = 'mock-embed';
  process.env.LOCAL_CHAT_MODEL = 'mock-chat';
  process.env.JWT_SECRET = 'test-secret';
  process.env.PYTHON_BIN = path.resolve(
    __dirname,
    process.platform === 'win32' ? '../python/.venv/Scripts/python.exe' : '../python/.venv/bin/python',
  );

  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mock?.close();
  // Close the SQLite handle so Windows will release the file, then clean up.
  try {
    const { default: db } = await import('../src/db.js');
    db.close();
  } catch { /* ignore */ }
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch { /* temp dir; OS will reclaim it */ }
});

// --- helpers ---
async function jpost(p, body, token) {
  const res = await fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function jget(p, token) {
  const res = await fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function upload(token, filename, content) {
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/plain' }), filename);
  const res = await fetch(base + '/api/documents', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json() };
}
async function waitReady(token, id, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { body } = await jget('/api/documents', token);
    const doc = body.documents?.find((d) => d.id === id);
    if (doc?.status === 'ready') return doc;
    if (doc?.status === 'error') throw new Error('ingest error: ' + doc.error);
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('timeout waiting for document to be ready');
}
async function chat(token, question) {
  const res = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question }),
  });
  const text = await res.text();
  const out = { answer: '', citations: null };
  for (const block of text.split('\n\n')) {
    const ev = block.split('\n').find((l) => l.startsWith('event:'))?.slice(6).trim();
    const data = block.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim();
    if (!ev || !data) continue;
    const parsed = JSON.parse(data);
    if (ev === 'token') out.answer += parsed.text;
    else if (ev === 'citations') out.citations = parsed.citations;
  }
  return out;
}

// --- tests (run in order) ---
test('rejects unauthenticated access', async () => {
  const { status } = await jget('/api/documents');
  assert.equal(status, 401);
});

test('signup issues a token', async () => {
  const { status, body } = await jpost('/api/auth/signup', { email: 'a@test.com', password: 'secret1' });
  assert.equal(status, 201);
  assert.ok(body.token);
  tokenA = body.token;
  userA = body.user;
});

test('login works and rejects a bad password', async () => {
  const ok = await jpost('/api/auth/login', { email: 'a@test.com', password: 'secret1' });
  assert.equal(ok.status, 200);
  const bad = await jpost('/api/auth/login', { email: 'a@test.com', password: 'wrong' });
  assert.equal(bad.status, 401);
});

test('upload → ingest → ready with chunks', async () => {
  const { status, body } = await upload(
    tokenA,
    'apollo.txt',
    'The Apollo program ran from 1961 to 1972. Apollo 11 was the first crewed mission to land on the Moon, on July 20, 1969. Neil Armstrong and Buzz Aldrin walked on the lunar surface.',
  );
  assert.equal(status, 202);
  docId = body.id;
  const doc = await waitReady(tokenA, docId);
  assert.ok(doc.chunk_count > 0);
  assert.equal(doc.embed_model, 'mock-embed');
});

test('index file is keyed by (user, embed model)', async () => {
  const files = fs.readdirSync(path.join(tmp, 'indexes'));
  assert.ok(files.some((f) => f === `${userA.id}__mock-embed.faiss`), `index file present: ${files.join(', ')}`);
});

test('chat returns a grounded answer with citations + snippet', async () => {
  const { answer, citations } = await chat(tokenA, 'When did Apollo 11 land on the Moon?');
  assert.match(answer, /1969/);
  assert.ok(Array.isArray(citations) && citations.length > 0);
  assert.equal(citations[0].original_name, 'apollo.txt');
  assert.ok(citations[0].snippet && citations[0].snippet.length > 0);
});

test('per-user isolation', async () => {
  const b = await jpost('/api/auth/signup', { email: 'b@test.com', password: 'secret2' });
  tokenB = b.body.token;

  // B sees no documents.
  const listB = await jget('/api/documents', tokenB);
  assert.equal(listB.body.documents.length, 0);

  // B cannot delete A's document.
  const del = await fetch(base + `/api/documents/${docId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokenB}` } });
  assert.equal(del.status, 404);

  // B's chat finds nothing (empty index for B).
  const { citations } = await chat(tokenB, 'When did Apollo 11 land on the Moon?');
  assert.equal(citations.length, 0);
});

test('status endpoint reports counts', async () => {
  const { status, body } = await jget('/api/status');
  assert.equal(status, 200);
  assert.equal(body.counts.users, 2);
  assert.ok(body.counts.chunks > 0);
});

test('delete removes the document and its vectors', async () => {
  const del = await fetch(base + `/api/documents/${docId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokenA}` } });
  assert.equal(del.status, 200);
  const { citations } = await chat(tokenA, 'When did Apollo 11 land on the Moon?');
  assert.equal(citations.length, 0);
});

test('concurrent uploads do not lose vectors (per-user queue)', async () => {
  // Both ingests race to rewrite the same FAISS index; without per-user
  // serialization the second write clobbers the first and one document's
  // vectors silently vanish while its DB rows say "ready".
  const [a, b] = await Promise.all([
    upload(tokenA, 'sun.txt', 'The Sun is a G-type main-sequence star at the center of the Solar System.'),
    upload(tokenA, 'mars.txt', 'Mars is the fourth planet from the Sun and is known as the red planet.'),
  ]);
  await Promise.all([waitReady(tokenA, a.body.id), waitReady(tokenA, b.body.id)]);

  // Both documents' content must be retrievable afterwards.
  const q1 = await chat(tokenA, 'What type of star is the Sun?');
  assert.ok(q1.citations.some((c) => c.original_name === 'sun.txt'), 'sun.txt vectors survived');
  const q2 = await chat(tokenA, 'Which planet is known as the red planet?');
  assert.ok(q2.citations.some((c) => c.original_name === 'mars.txt'), 'mars.txt vectors survived');
});

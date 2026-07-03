import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, CHUNK_CHARS, CHUNK_OVERLAP } from '../src/services/chunk.js';

// Ported from the former python/tests/test_chunk.py — the chunker moved from
// Python (ingest.py) to Node (chunk.js) but its behavior must not change.

test('empty input yields no chunks', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText('   \n  '), []);
  assert.deepEqual(chunkText(null), []);
});

test('short text is a single chunk', () => {
  assert.deepEqual(chunkText('A short document.'), ['A short document.']);
});

test('long text splits into multiple chunks', () => {
  const text = 'x'.repeat(CHUNK_CHARS * 2 + 500);
  const chunks = chunkText(text);
  assert.ok(chunks.length >= 3);
  // No chunk exceeds the configured size.
  assert.ok(chunks.every((c) => c.length <= CHUNK_CHARS));
});

test('chunks overlap', () => {
  // Distinct content so we can detect the overlap window between chunks.
  let text = '';
  for (let i = 0; i < CHUNK_CHARS + 1000; i++) text += String.fromCharCode(97 + (i % 26));
  const chunks = chunkText(text);
  assert.ok(chunks.length >= 2);
  const tail = chunks[0].slice(-CHUNK_OVERLAP);
  const head = chunks[1].slice(0, CHUNK_OVERLAP);
  assert.equal(tail, head); // the overlap region is shared between consecutive chunks
});

test('exact multiple of chunk size', () => {
  const text = 'y'.repeat(CHUNK_CHARS);
  const chunks = chunkText(text);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], text);
});

test('chunks start and end on word boundaries', () => {
  // Reproduces the reported bug: words must not be cut in the middle.
  const words = Array.from({ length: 3000 }, (_, i) => `token${String(i).padStart(4, '0')}`);
  const text = words.join(' '); // ~27k chars, forces many chunks
  const chunks = chunkText(text);
  assert.ok(chunks.length >= 2);
  const wordset = new Set(words);
  for (const c of chunks) {
    const toks = c.split(/\s+/);
    assert.ok(wordset.has(toks[0]), `chunk starts mid-word: ${toks[0]}`);
    assert.ok(wordset.has(toks[toks.length - 1]), `chunk ends mid-word: ${toks[toks.length - 1]}`);
  }
});

test('prefers sentence boundaries', () => {
  const sentence = 'This is a complete sentence about the topic. ';
  const text = sentence.repeat(200); // well over one chunk
  const chunks = chunkText(text);
  assert.ok(chunks.length >= 2);
  // Every non-final chunk ends cleanly on sentence punctuation.
  for (const c of chunks.slice(0, -1)) {
    assert.match(c.trimEnd().slice(-1), /[.!?]/, `did not end on a sentence: ...${c.slice(-30)}`);
  }
});

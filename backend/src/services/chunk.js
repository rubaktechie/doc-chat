// Split extracted document text into overlapping chunks on natural boundaries.
// Ported from the former ingest.py chunker so the behavior (and its tests) are
// unchanged — only the runtime moved from Python to Node.
const CHUNK_CHARS = 3000;
const CHUNK_OVERLAP = 300;
const MIN_CHUNK = 500; // never break earlier than this into a window (avoids tiny fragments)

// Break points tried in priority order: paragraph, then line, then sentence
// terminators, then clause punctuation. Whitespace is the final fallback so we
// never cut in the middle of a word.
const BREAKS = ['\n\n', '\n', '. ', '! ', '? ', '.\n', '; ', ': '];

// Pick an index in (start, end] to end a chunk on a natural boundary, as close
// to `end` as possible but not before start + MIN_CHUNK.
function breakAt(text, start, end) {
  const lo = Math.min(start + MIN_CHUNK, end);
  const region = text.slice(lo, end);
  let best = -1;
  for (const sep of BREAKS) {
    const idx = region.lastIndexOf(sep);
    if (idx !== -1) best = Math.max(best, idx + sep.length);
  }
  if (best !== -1) return lo + best;
  // No sentence/paragraph boundary — fall back to the last whitespace.
  const idx = region.lastIndexOf(' ');
  if (idx !== -1) return lo + idx + 1;
  return end; // a single token longer than the window: hard cut as last resort
}

// Start of the next chunk: back up ~CHUNK_OVERLAP chars, then snap to the start
// of a word so the overlap never begins mid-word.
function overlapStart(text, end) {
  const target = Math.max(0, end - CHUNK_OVERLAP);
  // Search strictly before `target` (matches Python's rfind(sub, 0, target)).
  const from = target - 1;
  const boundary = Math.max(text.lastIndexOf(' ', from), text.lastIndexOf('\n', from));
  return boundary > 0 ? boundary + 1 : target;
}

export function chunkText(raw) {
  const text = (raw || '').trim();
  if (!text) return [];
  const n = text.length;
  if (n <= CHUNK_CHARS) return [text];

  const chunks = [];
  let start = 0;
  while (start < n) {
    let end = Math.min(start + CHUNK_CHARS, n);
    if (end < n) end = breakAt(text, start, end);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= n) break;
    start = overlapStart(text, end);
  }
  return chunks;
}

export { CHUNK_CHARS, CHUNK_OVERLAP };

import express from 'express';
import { getResolvedProvider } from './settings.js';
import { retrieveContexts } from '../services/retrieval.js';
import { streamAnswer } from '../services/llm.js';
import { checkBudget, recordUsage } from '../services/usage.js';

const router = express.Router();

// Collapse the ranked chunk hits into one source per document, preserving
// retrieval order (best-ranked chunk decides a document's position + number).
// Each source carries its chunks so the prompt can include all their text.
function groupByDocument(contexts) {
  const byDoc = new Map();
  for (const c of contexts) {
    let src = byDoc.get(c.document_id);
    if (!src) {
      src = { document_id: c.document_id, original_name: c.original_name, score: c.score, chunks: [] };
      byDoc.set(c.document_id, src);
    }
    src.chunks.push(c.text);
    if (c.score > src.score) src.score = c.score; // report the document's best match
  }
  return [...byDoc.values()].map((src, i) => ({ n: i + 1, ...src }));
}

// Server-Sent Events: streams the answer token-by-token, then a citations
// event, then a done event.
router.post('/', async (req, res) => {
  const question = (req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'A question is required' });
  // Enforce the hourly token budget before any provider call (and before SSE
  // headers, so the client gets a plain 429).
  if (!checkBudget(req.userId).allowed) {
    return res.status(429).json({ error: 'Hourly token limit reached — try again later.' });
  }

  const cfg = getResolvedProvider(req.userId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const t0 = performance.now();
    const contexts = await retrieveContexts(req.userId, question, cfg, 5);
    const retrieveMs = Math.round(performance.now() - t0);

    if (contexts.length === 0) {
      req.log?.info({ provider: cfg.provider, retrieveMs, hits: 0 }, 'chat: no matching context');
      send('token', { text: 'I could not find anything relevant in your documents. Try uploading more, or rephrasing the question.' });
      send('citations', { citations: [] });
      send('done', {});
      return res.end();
    }

    // One citation per document (chunks collapsed). The snippet previews the
    // document's best-matching chunk, which sorts first within the group.
    const sources = groupByDocument(contexts);
    const citations = sources.map((s) => {
      const best = s.chunks[0];
      return {
        n: s.n,
        document_id: s.document_id,
        original_name: s.original_name,
        score: s.score,
        snippet: best.length > 320 ? `${best.slice(0, 320)}…` : best,
      };
    });

    const t1 = performance.now();
    const { usage } = await streamAnswer(cfg, question, sources, (text) => send('token', { text }));
    const llmMs = Math.round(performance.now() - t1);
    recordUsage(req.userId, usage?.total_tokens || 0);

    send('citations', { citations });
    send('done', {});
    res.end();

    req.log?.info(
      {
        provider: cfg.provider,
        chatModel: cfg.chatModel,
        embedModel: cfg.embedModel,
        retrieveMs,
        llmMs,
        hits: contexts.length,
        usage: usage || undefined,
      },
      'chat: answered',
    );
  } catch (err) {
    req.log?.error({ err }, 'chat: failed');
    send('error', { error: String(err.message || err) });
    res.end();
  }
});

export default router;

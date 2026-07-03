import OpenAI from 'openai';

// Build an OpenAI SDK client for the resolved provider (mirrors llm.js). Only
// baseURL / apiKey differ between the real OpenAI and a local OpenAI-compatible
// server.
function clientFor(cfg) {
  return new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey || 'not-needed' });
}

// Embed texts via the provider's OpenAI-compatible embeddings endpoint. Returns
// one vector per input, in input order. (Previously done in Python's
// llm_provider.embed_texts; the vectors are now handed to FAISS via stdin.)
export async function embedTexts(cfg, texts) {
  if (!texts || texts.length === 0) return [];
  const client = clientFor(cfg);
  const resp = await client.embeddings.create({ model: cfg.embedModel, input: texts });
  // The API returns an index per item; sort to preserve request order.
  return [...resp.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

import OpenAI from 'openai';

// Build an OpenAI SDK client for the resolved provider (mirrors llm.js). Only
// baseURL / apiKey differ between the real OpenAI and a local OpenAI-compatible
// server.
function clientFor(cfg) {
  return new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey || 'not-needed' });
}

// Providers cap inputs per embeddings request (OpenAI: 2048 items and a token
// ceiling), so large documents must be embedded in batches.
const BATCH_SIZE = 256;

// Embed texts via the provider's OpenAI-compatible embeddings endpoint.
// Returns { vectors, tokens }: one vector per input in input order, plus the
// total token usage reported by the provider (0 when it doesn't report any).
export async function embedTexts(cfg, texts) {
  if (!texts || texts.length === 0) return { vectors: [], tokens: 0 };
  const client = clientFor(cfg);
  const vectors = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const resp = await client.embeddings.create({ model: cfg.embedModel, input: batch });
    // The API returns an index per item; sort to preserve request order.
    vectors.push(...[...resp.data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
    tokens += resp.usage?.total_tokens || 0;
  }
  return { vectors, tokens };
}

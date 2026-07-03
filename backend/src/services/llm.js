import OpenAI from 'openai';

// Build an OpenAI SDK client for the resolved provider (real OpenAI or a local
// OpenAI-compatible server). Only baseURL / apiKey / model differ.
function clientFor(cfg) {
  return new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey || 'not-needed' });
}

const SYSTEM_PROMPT =
  'You are a helpful assistant that answers questions strictly using the provided ' +
  'document excerpts. Each numbered source [1], [2] is one document (it may contain ' +
  'several excerpts). Cite sources inline as [1], [2] matching the numbered documents. ' +
  'If the answer is not contained in the excerpts, say you could not find it in the documents.';

// `sources` is one entry per document: { n, original_name, chunks: string[] }.
function buildMessages(question, sources) {
  const contextBlock = sources
    .map((s) => `[${s.n}] (from "${s.original_name}")\n${s.chunks.join('\n\n')}`)
    .join('\n\n');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Document excerpts:\n\n${contextBlock}\n\nQuestion: ${question}`,
    },
  ];
}

// Stream a grounded answer. onToken(text) is called for each delta. Returns
// token usage when the provider reports it (OpenAI does with include_usage).
export async function streamAnswer(cfg, question, sources, onToken) {
  const client = clientFor(cfg);
  const stream = await client.chat.completions.create({
    model: cfg.chatModel,
    messages: buildMessages(question, sources),
    temperature: 0.2,
    stream: true,
    stream_options: { include_usage: true },
  });
  let usage = null;
  for await (const part of stream) {
    const delta = part.choices?.[0]?.delta?.content;
    if (delta) onToken(delta);
    if (part.usage) usage = part.usage; // final chunk carries usage
  }
  return { usage };
}

import http from 'node:http';

const DIM = 256;

// Deterministic bag-of-words embedding: semantically-overlapping text lands
// near each other, enough to exercise retrieval without a real model.
function embed(text) {
  const v = new Array(DIM).fill(0);
  for (const tok of String(text).toLowerCase().match(/[a-z0-9]+/g) || []) {
    let h = 0;
    for (const ch of tok) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % DIM] += 1;
  }
  return v;
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => resolve(b ? JSON.parse(b) : {}));
  });
}

// Start an OpenAI-compatible mock server on an ephemeral port.
// Returns { url, close }.
export function startMockProvider(answer = 'The answer is 42 [1].') {
  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.url.endsWith('/embeddings')) {
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        object: 'list',
        model: body.model,
        data: inputs.map((t, i) => ({ object: 'embedding', index: i, embedding: embed(t) })),
      }));
      return;
    }
    if (req.url.endsWith('/chat/completions')) {
      res.setHeader('Content-Type', 'text/event-stream');
      for (const word of answer.split(' ')) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: word + ' ' } }] })}\n\n`);
      }
      // Final usage chunk (exercises include_usage handling).
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 } })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ url: `http://localhost:${port}/v1`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Chat with Docs" — a RAG portal where authenticated users upload documents and ask questions answered strictly from their own collection, streamed with citations. See `README.md` for the full requirements/assumptions/key-decisions/guardrails write-up; that document is the source of truth for *why* things are built this way and should be consulted (and updated) alongside any architectural change. `ARCHITECTURE.md` holds the system/flow diagrams (mermaid) and should be updated too when flows or storage change. UI screenshots live in `screenshots/` and are embedded in the README — regenerate them (Playwright, both themes) after visible UI changes.

## Commands

Backend (`backend/`):
- `npm run dev` — run with `node --watch` (auto-restart)
- `npm start` — run normally
- `npm test` — full test suite (`node --test --test-concurrency=1 "test/**/*.test.js"`); concurrency is pinned to 1 because tests share a temp SQLite/FAISS data dir
- `node --test test/chunk.test.js` — run a single test file (same pattern for any file under `test/`)
- `npm run db:clear` — wipe documents/chunks (keeps users)
- `npm run db:reset` — wipe everything

Frontend (`frontend/`):
- `npm run dev` — Vite dev server
- `npm run build` — production build
- `npm run preview` — preview the production build

Python (`backend/python/`) — invoked by the backend as subprocesses, not run directly in normal operation. See `backend/python/setup.md` for venv creation. Uses Python 3.12 in a local `.venv`. `PYTHON_BIN` (env var, see `backend/.env`) points at the interpreter; if given as a relative path it's resolved against the backend root in `src/config.js` (a bare command like `python` resolves via `PATH` instead).

Docker (repo root): `cp .env.docker.example .env.docker` (fill in provider keys), then `docker compose up --build`. Nothing model-related runs in compose — LLM/embedding providers are external (OpenAI or a host-run Ollama via `host.docker.internal`).

## Architecture

**Split by strength, not by convenience.** Node/Express orchestrates the whole request lifecycle; Python only does the two things with no good Node equivalent — `markitdown` text extraction and `faiss` vector search — and runs as short-lived subprocesses (not a service), spawned via `runPython()` in `backend/src/services/python.js`. Embeddings are computed in Node (via the OpenAI-compatible SDK) and handed to Python over stdin as raw vectors, because Node already has the HTTP client and the vectors are too large for argv.

**Data split by strength too:**
- SQLite (`backend/src/db.js`) holds users, document metadata, and full chunk text.
- FAISS holds only vectors + integer ids, one index file per `(user_id, embed_model)` (`indexPathFor` in `backend/src/services/retrieval.js`). Keying by embed model means switching models is non-destructive — each model gets its own fixed-dimension index instead of corrupting a shared one.
- A `chunks.faiss_id` column links the two: retrieval searches FAISS first, then hydrates matching rows from SQLite. Because FAISS id counters are per-index, queries also filter by `embed_model` to disambiguate ids that collide across models.

**Python scripts are dumb and stateless**, one per operation, each doing read → mutate in memory → atomic write (temp file + rename) so a crash never leaves a torn index or meta sidecar:
- `extract.py` — file → markdown text (markitdown)
- `add.py` — normalizes + adds pre-computed vectors, owns the meta sidecar (`<index>.meta.json`) that pins an index's dimension/embed-model and the next id counter
- `query.py` — searches with a pre-computed query vector
- `remove.py` — deletes vectors by id

**Concurrency control:** `backend/src/services/queue.js` provides a per-key async queue. All FAISS operations for a given user (add/remove/query) are serialized through `enqueue(String(userId), ...)` because add.py/remove.py rewrite the whole index file — concurrent runs would race on the same on-disk snapshot and silently drop vectors (a bug that was reproduced and fixed). Reads share the queue too, since a reader with the file open can make the writer's atomic rename fail on Windows. This in-memory queue is sufficient only because the backend is a single Node process; a multi-instance deployment would need to replace it with a real job queue or cross-process lock.

**Ingest is async:** `POST /api/documents` returns `202 processing` immediately; `processDocument()` in `backend/src/routes/documents.js` runs extract → chunk (Node, `services/chunk.js`) → embed (Node) → add-to-FAISS (Python, queued) → insert chunk rows → mark `ready`/`error`, and the client polls `GET /api/documents`. A document still `processing` at server startup means a prior process died mid-ingest — `app.js` marks those `error` on boot so clients aren't left polling forever. `/:id/retry` re-runs ingestion, best-effort cleaning up any partial FAISS vectors first.

**Chat (`backend/src/routes/chat.js`)** streams over SSE (not WebSockets): embed question → `retrieveContexts` → if zero hits, respond directly without calling the LLM (grounding is enforced, not just prompted) → group chunks by document → `streamAnswer` tokens → emit a `citations` event → `done`. One citation per source document, not per chunk. An optional `document_ids` body field scopes retrieval to specific documents (ownership-validated in the route); the scoped chunk faiss ids are passed to `query.py` as an `allowed_ids` allow-list, which searches the full index and post-filters — the IDSelector search-params API isn't exposed in every faiss build, and the index is exact brute-force anyway so cost is identical.

**Prompt-injection containment (`backend/src/services/llm.js`)** is structural, not just prompted: document excerpts are wrapped in `<excerpt n="..." from="...">` delimiters that document text cannot fake or close — `neutralizeDelimiters()` escapes any literal `<excerpt`/`</excerpt>` sequence found in the source text or filename before it's interpolated, and filenames are flattened to one line first. The system prompt then declares everything inside those markers untrusted data. Tested structurally in `test/llm.test.js` — verify delimiter escaping stays intact if this code changes, since that's what actually blocks the smuggling (the system prompt instruction alone would not).

**Provider abstraction:** one OpenAI-SDK code path for both `openai` and `local` (Ollama/llama.cpp) — they differ only in `baseURL`/`apiKey`/model names (`backend/src/config.js` `PROVIDERS`). Per-user overrides live in the `settings` table; `resolveProvider()` / `getResolvedProvider()` (`routes/settings.js`) merge profile defaults with a user's chosen provider/models. Both `embeddings.js` and `llm.js` build their client the same way from this resolved config.

**Auth** is a bare JWT bearer scheme (`middleware/auth.js`): `signToken`/`requireAuth`, no refresh tokens or sessions table. All `/api/documents`, `/api/chat`, `/api/settings` routes require it; `/api/auth/*` is rate-limited per-IP (`services/ratelimit.js`) instead.

**Abuse/cost controls:** per-user hourly token budget (`services/usage.js`, in-memory fixed window, `TOKEN_LIMIT_PER_HOUR`, 0 disables) checked before every provider call (embed or chat) and enforced with a 429; 25 MB upload cap enforced by multer in `routes/documents.js`.

## Conventions worth knowing before editing

- No RAG framework (no LangChain/LlamaIndex) — the whole pipeline is explicit code across `chunk.js` → `embeddings.js` → `retrieval.js`/Python → `llm.js`. Keep additions in that style rather than introducing a framework dependency.
- The chunker (`services/chunk.js`) was ported from a former Python `ingest.py` — behavior (chunk boundaries, overlap) must stay identical to what its tests pin down (`test/chunk.test.js` mirrors the old `test_chunk.py`).
- `test/mock-provider.js` stands up a fake OpenAI-compatible HTTP server (deterministic bag-of-words embeddings) so `api.test.js` can exercise real ingest/retrieval/chat flows without hitting a real provider.
- Frontend talks to the backend only through `frontend/src/api.js`; SSE chat uses `fetch` + manual stream parsing (not `EventSource`) because `EventSource` can't send POST bodies/auth headers.

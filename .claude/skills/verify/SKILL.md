---
name: verify
description: How to launch and drive this app end-to-end to verify a change (backend + frontend + Playwright recipe).
---

# Verifying doc-chat changes end-to-end

## Launch

```bash
# Backend (port 3001; uses backend/.env — needs Ollama running for the "local" provider)
cd backend && npm start &

# Frontend dev server (port 5173, proxies /api → 3001 via vite.config.js)
cd frontend && npm run dev &

curl -s http://localhost:3001/api/health   # {"ok":true}
```

Provider check: `curl -s http://localhost:11434/v1/models` — the models named by
`LOCAL_CHAT_MODEL` / `LOCAL_EMBED_MODEL` in `backend/.env` must be in the list, or
chat/ingest will fail at the provider call.

## Drive (Playwright, headless)

Install into a scratch dir (not the repo): `npm i playwright && npx playwright install chromium`.
Flow that exercises the whole stack: sign up a throwaway `*-@test.local` account →
upload small `.txt` files via `setInputFiles` on `input[type=file]` → wait for the
Documents table to show "Ready" (poll `.doc-table td` text) → go to Chat via the
app sidebar (`.sidebar-nav .nav-link`, hasText), fill `.composer textarea`, press
Enter → wait for `.bubble.streaming` to disappear (don't wait for the submit
button — it races on fast responses) → inspect `.msg.assistant .bubble` HTML.
Navigation lives in the left sidebar (nav at the bottom, conversations on top);
the topbar has only the brand + theme toggle, plus ☰ when the sidebar is closed.
Conversation delete buttons are hover-revealed — `.hover()` the `.conv-item` first.

## Gotchas

- Ingest is async; "Ready" typically takes a few seconds for a small txt (markitdown
  subprocess + Ollama embedding). Use generous timeouts (60 s).
- The small local chat model (llama3.2:3b) often omits `[1]` citation markers unless
  the question explicitly asks for them — retry up to 3× when testing inline-citation UI.
- Verification accounts/documents persist in `backend/data/docchat.db`. Don't run
  `npm run db:clear` to clean up — it wipes ALL users' documents, including real dev data.
- Theme default comes from `prefers-color-scheme` on a fresh browser profile.

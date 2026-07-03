import express from 'express';
import db from '../db.js';
import { PROVIDERS, resolveProvider } from '../config.js';

const router = express.Router();

function getSettingsRow(userId) {
  return db.prepare('SELECT provider, chat_model, embed_model FROM settings WHERE user_id = ?').get(userId);
}

// Shared helper used by documents/chat routes to get the effective provider
// config (baseURL, apiKey, chatModel, embedModel) for a user.
export function getResolvedProvider(userId) {
  return resolveProvider(getSettingsRow(userId));
}

router.get('/', (req, res) => {
  const row = getSettingsRow(req.userId) || {};
  const resolved = resolveProvider(row);
  res.json({
    settings: { provider: resolved.provider, chat_model: resolved.chatModel, embed_model: resolved.embedModel },
    // Expose available providers + their defaults so the UI can offer choices.
    providers: Object.fromEntries(
      Object.entries(PROVIDERS).map(([name, p]) => [
        name,
        { baseURL: p.baseURL, chatModel: p.chatModel, embedModel: p.embedModel, hasKey: Boolean(p.apiKey) },
      ]),
    ),
  });
});

router.put('/', (req, res) => {
  const { provider, chat_model, embed_model } = req.body || {};
  if (provider && !PROVIDERS[provider]) {
    return res.status(400).json({ error: `Unknown provider "${provider}"` });
  }
  db.prepare(
    `INSERT INTO settings (user_id, provider, chat_model, embed_model) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET provider = excluded.provider,
       chat_model = excluded.chat_model, embed_model = excluded.embed_model`,
  ).run(req.userId, provider || null, chat_model || null, embed_model || null);
  const resolved = resolveProvider(getSettingsRow(req.userId));
  res.json({ settings: { provider: resolved.provider, chat_model: resolved.chatModel, embed_model: resolved.embedModel } });
});

export default router;

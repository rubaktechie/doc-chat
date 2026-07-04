import { getToken } from './api.js';

// Conversations persist in localStorage, namespaced per user id (decoded from
// the JWT payload — no signature check needed, it's only a storage key).
// Shape: [{ id, title, updatedAt, messages: [{ role, text, citations? }] }],
// most recently updated first.
const MAX_CONVERSATIONS = 50;

function storageKey() {
  let userId = 'anon';
  try {
    const token = getToken();
    if (token) userId = JSON.parse(atob(token.split('.')[1])).id ?? 'anon';
  } catch { /* malformed token — fall back to the shared key */ }
  return `docchat_chats_${userId}`;
}

function readAll() {
  try {
    const raw = localStorage.getItem(storageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(conversations) {
  const list = [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
  // On quota pressure, shed the oldest conversations until the write fits.
  while (list.length > 0) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(list));
      return;
    } catch {
      list.pop();
    }
  }
  try { localStorage.removeItem(storageKey()); } catch { /* storage unavailable */ }
}

export function listConversations() {
  return readAll().map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
}

export function loadConversation(id) {
  return readAll().find((c) => c.id === id) || null;
}

export function saveConversation(id, messages) {
  if (!messages || messages.length === 0) return;
  const all = readAll();
  const firstQuestion = messages.find((m) => m.role === 'user')?.text || 'New chat';
  const title = firstQuestion.length > 60 ? `${firstQuestion.slice(0, 60)}…` : firstQuestion;
  const existing = all.find((c) => c.id === id);
  if (existing) {
    existing.messages = messages;
    existing.title = title;
    existing.updatedAt = Date.now();
  } else {
    all.push({ id, title, updatedAt: Date.now(), messages });
  }
  writeAll(all);
}

export function deleteConversation(id) {
  writeAll(readAll().filter((c) => c.id !== id));
}

export function newConversationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

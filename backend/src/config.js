import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
// DATA_DIR is overridable via env so tests can use a temp dir and Docker can
// bind-mount a host directory (defaults to <backend>/data for local dev).
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const INDEXES_DIR = path.join(DATA_DIR, 'indexes');
export const PYTHON_DIR = path.join(ROOT, 'python');
export const DB_PATH = path.join(DATA_DIR, 'docchat.db');

export const PORT = parseInt(process.env.PORT || '3001', 10);
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
export const PYTHON_BIN = process.env.PYTHON_BIN || 'python';
export const DEFAULT_PROVIDER = process.env.DEFAULT_PROVIDER || 'openai';

// Provider profiles. Both providers speak the OpenAI-compatible API; we only
// swap baseURL / apiKey / model names. "local" points at Ollama or llama.cpp.
export const PROVIDERS = {
  openai: {
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
    embedModel: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
  },
  local: {
    baseURL: process.env.LOCAL_BASE_URL || 'http://localhost:11434/v1',
    apiKey: process.env.LOCAL_API_KEY || 'local',
    chatModel: process.env.LOCAL_CHAT_MODEL || 'llama3.1',
    embedModel: process.env.LOCAL_EMBED_MODEL || 'nomic-embed-text',
  },
};

// Resolve a user's effective provider config: profile defaults overridden by
// any per-user model choices stored in the settings table.
export function resolveProvider(settings) {
  const providerName = settings?.provider && PROVIDERS[settings.provider]
    ? settings.provider
    : DEFAULT_PROVIDER;
  const profile = PROVIDERS[providerName] || PROVIDERS.openai;
  return {
    provider: providerName,
    baseURL: profile.baseURL,
    apiKey: profile.apiKey,
    chatModel: settings?.chat_model || profile.chatModel,
    embedModel: settings?.embed_model || profile.embedModel,
  };
}

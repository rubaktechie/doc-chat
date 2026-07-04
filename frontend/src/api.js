// Thin fetch wrapper that attaches the JWT and unwraps JSON errors.
const TOKEN_KEY = 'docchat_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// Registered by the auth layer; invoked when the server rejects our token
// (401) so the app can drop the session and route back to the login page.
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => { unauthorizedHandler = fn; };
const handleUnauthorized = () => (unauthorizedHandler || clearToken)();

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form; // FormData — let the browser set the multipart boundary.
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error(data.error || 'Session expired. Please log in again.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  signup: (email, password) => request('/auth/signup', { method: 'POST', body: { email, password } }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  listDocuments: () => request('/documents'),
  uploadDocument: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/documents', { method: 'POST', form });
  },
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),
  retryDocument: (id) => request(`/documents/${id}/retry`, { method: 'POST' }),
  getSettings: () => request('/settings'),
  updateSettings: (s) => request('/settings', { method: 'PUT', body: s }),
};

// Chat uses SSE via fetch streaming (EventSource can't send POST bodies/headers).
// Pass an AbortController's `signal` to support stopping mid-stream; aborting
// finishes via onDone (a user action, not an error). `documentIds` (optional)
// scopes retrieval to those documents; omitted = search all.
export async function streamChat(question, { onToken, onCitations, onError, onDone, signal, documentIds }) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({
        question,
        ...(documentIds && documentIds.length > 0 ? { document_ids: documentIds } : {}),
      }),
      signal,
    });
    if (res.status === 401) {
      handleUnauthorized();
      onError?.('Session expired. Please log in again.');
      return;
    }
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      onError?.(data.error || `Request failed (${res.status})`);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const block of events) {
        const evLine = block.split('\n').find((l) => l.startsWith('event:'));
        const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
        if (!evLine || !dataLine) continue;
        const event = evLine.slice(6).trim();
        const data = JSON.parse(dataLine.slice(5).trim());
        if (event === 'token') onToken?.(data.text);
        else if (event === 'citations') onCitations?.(data.citations);
        else if (event === 'error') onError?.(data.error);
        else if (event === 'done') onDone?.();
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') { onDone?.(); return; }
    throw err;
  }
}

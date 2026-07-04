import { useEffect, useRef, useState } from 'react';
import { api, streamChat } from '../api.js';
import Markdown from '../components/Markdown.jsx';
import {
  listConversations,
  loadConversation,
  saveConversation,
  deleteConversation,
  newConversationId,
} from '../chatStore.js';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable (e.g. http) — button just does nothing */ }
  };
  return (
    <button className="link-btn icon-btn copy-btn" aria-label="Copy answer" onClick={copy}>
      {copied ? '✓' : '⧉'}
    </button>
  );
}

export default function Chat() {
  const [conversations, setConversations] = useState(listConversations);
  const [activeId, setActiveId] = useState(() => conversations[0]?.id || newConversationId());
  const [messages, setMessages] = useState(() => loadConversation(activeId)?.messages || []);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [docs, setDocs] = useState([]); // ready documents, for the scope picker
  const [scope, setScope] = useState(() => new Set()); // empty = all documents
  const [pickerOpen, setPickerOpen] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  const loadDocs = async () => {
    try {
      const { documents } = await api.listDocuments();
      setDocs(documents.filter((d) => d.status === 'ready'));
    } catch { /* picker just stays empty; chat still works unscoped */ }
  };

  // Stop an in-flight stream when leaving the page.
  useEffect(() => {
    loadDocs();
    return () => abortRef.current?.abort();
  }, []);

  const toggleScope = (id) => {
    setScope((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    });
  };

  const persist = (msgs) => {
    if (msgs.length === 0) return;
    saveConversation(activeId, msgs);
    setConversations(listConversations());
  };

  const switchTo = (id) => {
    if (busy) abortRef.current?.abort();
    setActiveId(id);
    setMessages(loadConversation(id)?.messages || []);
    setSidebarOpen(false);
    scrollToEnd();
  };

  const startNew = () => switchTo(newConversationId());

  const removeConversation = (id) => {
    deleteConversation(id);
    const rest = listConversations();
    setConversations(rest);
    if (id === activeId) {
      const next = rest[0]?.id || newConversationId();
      setActiveId(next);
      setMessages(loadConversation(next)?.messages || []);
    }
  };

  const autogrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const ask = async (e) => {
    e?.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput('');
    requestAnimationFrame(autogrow);
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', text: question }, { role: 'assistant', text: '', citations: [] }]);
    scrollToEnd();

    // Track the latest messages outside React state so persistence on done
    // doesn't race the async state updates.
    let latest = null;
    const appendToLast = (patch) => {
      setMessages((m) => {
        const copy = [...m];
        const last = { ...copy[copy.length - 1] };
        patch(last);
        copy[copy.length - 1] = last;
        latest = copy;
        return copy;
      });
      scrollToEnd();
    };

    const controller = new AbortController();
    abortRef.current = controller;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setBusy(false);
      abortRef.current = null;
      if (latest) persist(latest);
    };

    await streamChat(question, {
      signal: controller.signal,
      documentIds: scope.size > 0 ? [...scope] : undefined,
      onToken: (t) => appendToLast((msg) => { msg.text += t; }),
      onCitations: (c) => appendToLast((msg) => { msg.citations = c; }),
      onError: (err) => appendToLast((msg) => { msg.text += `\n\n⚠️ ${err}`; }),
      onDone: finish,
    });
    finish();
    textareaRef.current?.focus();
  };

  const suggest = (text) => {
    setInput(text);
    textareaRef.current?.focus();
    requestAnimationFrame(autogrow);
  };

  const onComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  };

  return (
    <div className="page chat-page">
      <div className="chat-layout">
        <aside className={`chat-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <button className="new-chat-btn" onClick={startNew}>+ New chat</button>
          <div className="conv-list">
            {conversations.length === 0 && <p className="muted small">No previous chats.</p>}
            {conversations.map((c) => (
              <div key={c.id} className={`conv-item ${c.id === activeId ? 'active' : ''}`}>
                <button className="conv-title" title={c.title} onClick={() => switchTo(c.id)}>
                  {c.title}
                </button>
                <button
                  className="link-btn danger icon-btn"
                  aria-label={`Delete chat "${c.title}"`}
                  onClick={() => removeConversation(c.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="chat-main">
          <div className="chat-header">
            <button
              className="link-btn icon-btn sidebar-toggle"
              aria-label="Toggle chat list"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              ☰
            </button>
            <h1>Chat</h1>
            {messages.length > 0 && (
              <span className="chat-title muted">
                {conversations.find((c) => c.id === activeId)?.title || ''}
              </span>
            )}
            <div className="scope-picker">
              <button
                className="scope-btn"
                aria-expanded={pickerOpen}
                onClick={() => { setPickerOpen((v) => !v); if (!pickerOpen) loadDocs(); }}
              >
                📚 {scope.size === 0 ? 'All documents' : `${scope.size} selected`} ▾
              </button>
              {pickerOpen && (
                <>
                  <div className="scope-backdrop" onClick={() => setPickerOpen(false)} />
                  <div className="scope-menu" role="menu">
                    <label className="scope-option">
                      <input
                        type="checkbox"
                        checked={scope.size === 0}
                        onChange={() => setScope(new Set())}
                      />
                      All documents
                    </label>
                    <div className="scope-divider" />
                    {docs.map((d) => (
                      <label key={d.id} className="scope-option" title={d.original_name}>
                        <input
                          type="checkbox"
                          checked={scope.has(d.id)}
                          onChange={() => toggleScope(d.id)}
                        />
                        <span className="scope-name">{d.original_name}</span>
                      </label>
                    ))}
                    {docs.length === 0 && <p className="muted small scope-empty">No ready documents yet.</p>}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="messages" ref={scrollRef} aria-busy={busy}>
            {messages.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true">💬</div>
                <p>Ask a question about your uploaded documents — answers come with citations you can check.</p>
                <div className="suggestions">
                  <button className="suggestion-chip" onClick={() => suggest('Summarize the key points across my documents.')}>Summarize key points</button>
                  <button className="suggestion-chip" onClick={() => suggest('What topics do my documents cover?')}>What topics are covered?</button>
                  <button className="suggestion-chip" onClick={() => suggest('List any dates, names, or figures mentioned in my documents.')}>Extract names &amp; figures</button>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <div className="avatar" aria-hidden="true">{m.role === 'user' ? '🧑' : '🤖'}</div>
                <div className={`bubble ${m.role === 'assistant' && busy && i === messages.length - 1 ? 'streaming' : ''}`}>
                  {m.role === 'assistant' ? (
                    <>
                      {m.text && <Markdown text={m.text} citations={m.citations} msgIdx={i} />}
                      {m.citations?.length > 0 && (
                        <div className="citations">
                          {m.citations.map((c) => (
                            <details key={c.n} className="cite" id={`cite-${i}-${c.n}`}>
                              <summary title={`relevance ${c.score?.toFixed(3)}`}>
                                [{c.n}] {c.original_name}
                              </summary>
                              {c.snippet && <p className="cite-snippet">{c.snippet}</p>}
                            </details>
                          ))}
                        </div>
                      )}
                      {m.text && !(busy && i === messages.length - 1) && <CopyButton text={m.text} />}
                    </>
                  ) : (
                    m.text
                  )}
                </div>
              </div>
            ))}
          </div>
          <form className="composer" onSubmit={ask}>
            <textarea
              ref={textareaRef}
              rows={1}
              autoFocus
              value={input}
              onChange={(e) => { setInput(e.target.value); autogrow(); }}
              onKeyDown={onComposerKeyDown}
              placeholder="Ask a question…"
              title="Enter to send · Shift+Enter for a new line"
            />
            {busy ? (
              <button type="button" className="stop-btn" onClick={() => abortRef.current?.abort()}>Stop</button>
            ) : (
              <button type="submit" disabled={!input.trim()}>Send</button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

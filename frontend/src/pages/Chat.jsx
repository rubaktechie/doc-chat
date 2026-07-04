import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, streamChat } from '../api.js';
import Markdown from '../components/Markdown.jsx';
import Icon from '../components/Icon.jsx';
import {
  listConversations,
  loadConversation,
  saveConversation,
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
      <Icon name={copied ? 'check' : 'copy'} size={15} />
    </button>
  );
}

// The conversation list lives in the app sidebar; this page tracks the active
// conversation via the ?c= query param (falling back to the most recent one).
export default function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramId = searchParams.get('c');
  const [activeId, setActiveId] = useState(() => paramId || listConversations()[0]?.id || newConversationId());
  const [messages, setMessages] = useState(() => loadConversation(activeId)?.messages || []);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState([]); // all documents (hint checks any exist)
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [scope, setScope] = useState(() => new Set()); // empty = all documents
  const [pickerOpen, setPickerOpen] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  const readyDocs = docs.filter((d) => d.status === 'ready'); // scope picker options
  const noDocs = docsLoaded && docs.length === 0; // composer disabled until an upload exists

  const loadDocs = async () => {
    try {
      const { documents } = await api.listDocuments();
      setDocs(documents);
      setDocsLoaded(true);
    } catch { /* picker just stays empty; chat still works unscoped */ }
  };

  // Stop an in-flight stream when leaving the page.
  useEffect(() => {
    loadDocs();
    return () => abortRef.current?.abort();
  }, []);

  // Sidebar navigation changes ?c= — switch conversations to follow it.
  useEffect(() => {
    const id = paramId || listConversations()[0]?.id || newConversationId();
    if (id !== activeId) {
      abortRef.current?.abort();
      setActiveId(id);
      setMessages(loadConversation(id)?.messages || []);
      scrollToEnd();
    }
  }, [paramId]);

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
    // The assistant message is built imperatively and mirrored into state:
    // relying on state-updater side effects to capture "latest" is racy when
    // token and done events arrive in the same network chunk (React defers
    // updater execution, so done could observe nothing).
    const assistant = { role: 'assistant', text: '', citations: [] };
    const baseMsgs = [...messages, { role: 'user', text: question }];
    const snapshot = () => [...baseMsgs, { ...assistant }];
    setMessages(snapshot());
    scrollToEnd();
    // Reflect the active conversation in the URL so the sidebar highlights it.
    if (paramId !== activeId) setSearchParams({ c: activeId }, { replace: true });

    const sync = () => {
      setMessages(snapshot());
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
      saveConversation(activeId, snapshot());
    };

    await streamChat(question, {
      signal: controller.signal,
      documentIds: scope.size > 0 ? [...scope] : undefined,
      onToken: (t) => { assistant.text += t; sync(); },
      onCitations: (c) => { assistant.citations = c; sync(); },
      onError: (err) => { assistant.text += `\n\n⚠️ ${err}`; sync(); },
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

  const title = messages.find((m) => m.role === 'user')?.text || '';

  return (
    <div className="page chat-page">
      <div className="chat-header">
        <h1>Chat</h1>
        {title && <span className="chat-title muted">{title}</span>}
        <div className="scope-picker">
          <button
            className="scope-btn"
            aria-expanded={pickerOpen}
            disabled={noDocs}
            onClick={() => { setPickerOpen((v) => !v); if (!pickerOpen) loadDocs(); }}
          >
            <Icon name="layers" size={15} /> {scope.size === 0 ? 'All documents' : `${scope.size} selected`} <Icon name="chevronDown" size={14} />
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
                {readyDocs.map((d) => (
                  <label key={d.id} className="scope-option" title={d.original_name}>
                    <input
                      type="checkbox"
                      checked={scope.has(d.id)}
                      onChange={() => toggleScope(d.id)}
                    />
                    <span className="scope-name">{d.original_name}</span>
                  </label>
                ))}
                {readyDocs.length === 0 && <p className="muted small scope-empty">No ready documents yet.</p>}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="messages" ref={scrollRef} aria-busy={busy}>
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true"><Icon name="chat" size={30} /></div>
            {docsLoaded && docs.length === 0 ? (
              <>
                <p>You don't have any documents yet — answers are grounded in what you upload.</p>
                <Link to="/documents" className="upload-hint-link"><Icon name="upload" size={15} /> Upload your first document</Link>
              </>
            ) : (
              <>
                <p>Ask a question about your uploaded documents — answers come with citations you can check.</p>
                <div className="suggestions">
                  <button className="suggestion-chip" onClick={() => suggest('Summarize the key points across my documents.')}>Summarize key points</button>
                  <button className="suggestion-chip" onClick={() => suggest('What topics do my documents cover?')}>What topics are covered?</button>
                  <button className="suggestion-chip" onClick={() => suggest('List any dates, names, or figures mentioned in my documents.')}>Extract names &amp; figures</button>
                </div>
              </>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="avatar" aria-hidden="true"><Icon name={m.role === 'user' ? 'user' : 'bot'} size={17} /></div>
            <div className={`bubble ${m.role === 'assistant' && busy && i === messages.length - 1 ? 'streaming' : ''}`}>
              {m.role === 'assistant' ? (
                <>
                  {m.text && <Markdown text={m.text} citations={m.citations} msgIdx={i} />}
                  {m.citations?.length > 0 && (
                    <div className="citations">
                      {m.citations.map((c) => (
                        <div key={c.n} className="cite" id={`cite-${i}-${c.n}`} title={`relevance ${c.score?.toFixed(3)}`}>
                          [{c.n}] {c.original_name}
                        </div>
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
          disabled={noDocs}
          onChange={(e) => { setInput(e.target.value); autogrow(); }}
          onKeyDown={onComposerKeyDown}
          placeholder={noDocs ? 'Upload a document to start chatting…' : 'Ask a question…'}
          title="Enter to send · Shift+Enter for a new line"
        />
        {busy ? (
          <button type="button" className="stop-btn" onClick={() => abortRef.current?.abort()}>Stop</button>
        ) : (
          <button type="submit" disabled={!input.trim() || noDocs}>Send</button>
        )}
      </form>
    </div>
  );
}

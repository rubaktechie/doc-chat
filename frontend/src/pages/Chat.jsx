import { useRef, useState } from 'react';
import { streamChat } from '../api.js';

export default function Chat() {
  const [messages, setMessages] = useState([]); // {role, text, citations?}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    });
  };

  const ask = async (e) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput('');
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', text: question }, { role: 'assistant', text: '', citations: [] }]);
    scrollToEnd();

    const appendToLast = (patch) => {
      setMessages((m) => {
        const copy = [...m];
        const last = { ...copy[copy.length - 1] };
        patch(last);
        copy[copy.length - 1] = last;
        return copy;
      });
      scrollToEnd();
    };

    await streamChat(question, {
      onToken: (t) => appendToLast((msg) => { msg.text += t; }),
      onCitations: (c) => appendToLast((msg) => { msg.citations = c; }),
      onError: (err) => appendToLast((msg) => { msg.text += `\n\n⚠️ ${err}`; }),
      onDone: () => setBusy(false),
    });
    setBusy(false);
  };

  return (
    <div className="page chat-page">
      <h1>Chat</h1>
      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && <p className="muted">Ask a question about your uploaded documents.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="bubble">
              {m.text || (m.role === 'assistant' && busy ? '…' : '')}
              {m.citations?.length > 0 && (
                <div className="citations">
                  {m.citations.map((c) => (
                    <details key={c.n} className="cite">
                      <summary title={`relevance ${c.score?.toFixed(3)}`}>
                        [{c.n}] {c.original_name}
                      </summary>
                      {c.snippet && <p className="cite-snippet">{c.snippet}</p>}
                    </details>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={ask}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" disabled={busy} />
        <button type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}

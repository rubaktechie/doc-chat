import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Turn bare [1] / [2] citation markers into markdown links targeting the
// citation elements rendered below the message. Only numbers that actually
// have a citation are linked; `(?!\()` skips markers that are already links.
function linkCitations(text, citationNumbers, msgIdx) {
  if (!citationNumbers || citationNumbers.size === 0) return text;
  return text.replace(/\[(\d+)\](?!\()/g, (match, n) =>
    citationNumbers.has(Number(n)) ? `[${n}](#cite-${msgIdx}-${n})` : match,
  );
}

function CitationLink({ href, children, ...props }) {
  if (href?.startsWith('#cite-')) {
    const onClick = (e) => {
      e.preventDefault();
      const target = document.getElementById(href.slice(1));
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      target.classList.remove('cite-flash');
      // Reflow so re-clicking the same citation restarts the flash animation.
      void target.offsetWidth;
      target.classList.add('cite-flash');
    };
    return (
      <a href={href} className="cite-ref" onClick={onClick}>
        <sup>[{children}]</sup>
      </a>
    );
  }
  // External links from document content open in a new tab.
  return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
}

// Assistant-message markdown. `citations` is the message's citation list; the
// numbers found in the text become clickable references to them.
export default function Markdown({ text, citations, msgIdx }) {
  const numbers = new Set((citations || []).map((c) => c.n));
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: CitationLink }}>
        {linkCitations(text, numbers, msgIdx)}
      </ReactMarkdown>
    </div>
  );
}

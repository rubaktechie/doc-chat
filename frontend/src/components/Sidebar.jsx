import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { listConversations, deleteConversation, newConversationId, onChange } from '../chatStore.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import Icon from './Icon.jsx';

const isMobile = () => window.matchMedia('(max-width: 700px)').matches;

// App-wide sidebar: brand + close on top (mobile only — the topbar carries the
// brand on desktop), chat conversations in the middle, navigation pinned at
// the bottom. Conversations link to /chat?c=<id>; the Chat page reads that
// param. Destructive actions (delete chat, log out) confirm via modal.
export default function Sidebar({ open, onClose }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [convs, setConvs] = useState(listConversations);
  const [confirm, setConfirm] = useState(null); // { type: 'logout' } | { type: 'conv', id, title }

  useEffect(() => onChange(() => setConvs(listConversations())), []);

  // The Chat page falls back to the most recent conversation when no ?c= is
  // present, so mirror that here for the active highlight.
  const activeConvId = pathname === '/chat' ? (searchParams.get('c') || convs[0]?.id) : null;

  // On phones the sidebar is an overlay — navigating should dismiss it.
  const go = (to) => {
    navigate(to);
    if (isMobile()) onClose();
  };

  const removeConv = (id) => {
    deleteConversation(id);
    if (pathname === '/chat' && id === activeConvId) {
      const rest = listConversations();
      navigate(rest[0] ? `/chat?c=${rest[0].id}` : `/chat?c=${newConversationId()}`, { replace: true });
    }
  };

  const onConfirm = () => {
    if (confirm?.type === 'logout') logout();
    else if (confirm?.type === 'conv') removeConv(confirm.id);
    setConfirm(null);
  };

  const navItem = (to, icon, label) => (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      onClick={() => isMobile() && onClose()}
    >
      <Icon name={icon} /> {label}
    </NavLink>
  );

  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-head">
          <span className="brand"><Icon name="logo" className="brand-icon" /> Chat with Docs</span>
          <button className="link-btn icon-btn" aria-label="Close sidebar" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <button className="new-chat-btn" onClick={() => go(`/chat?c=${newConversationId()}`)}>
          <Icon name="plus" size={16} /> New chat
        </button>
        <div className="conv-list">
          {convs.length === 0 && <p className="muted small">No previous chats.</p>}
          {convs.map((c) => (
            <div key={c.id} className={`conv-item ${c.id === activeConvId ? 'active' : ''}`}>
              <button className="conv-title" title={c.title} onClick={() => go(`/chat?c=${c.id}`)}>
                <Icon name="chat" size={15} className="conv-icon" /> <span className="conv-label">{c.title}</span>
              </button>
              <button
                className="link-btn danger icon-btn"
                aria-label={`Delete chat "${c.title}"`}
                onClick={() => setConfirm({ type: 'conv', id: c.id, title: c.title })}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>

        <nav className="sidebar-nav">
          {navItem('/chat', 'chat', 'Chat')}
          {navItem('/documents', 'documents', 'Documents')}
          {navItem('/settings', 'settings', 'Settings')}
          <button className="nav-link logout-btn" onClick={() => setConfirm({ type: 'logout' })}>
            <Icon name="logout" /> Log out
          </button>
        </nav>
      </aside>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.type === 'logout' ? 'Log out?' : 'Delete this chat?'}
        message={
          confirm?.type === 'logout'
            ? 'You will need to sign in again to access your documents.'
            : `"${confirm?.title}" will be removed from this device. This cannot be undone.`
        }
        confirmLabel={confirm?.type === 'logout' ? 'Log out' : 'Delete'}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Sidebar from './components/Sidebar.jsx';
import Icon from './components/Icon.jsx';
import ThemeSwitch from './components/ThemeSwitch.jsx';
import Login from './pages/Login.jsx';
import Documents from './pages/Documents.jsx';
import Chat from './pages/Chat.jsx';
import Settings from './pages/Settings.jsx';

// Top bar: just the app title and the theme switch. The ☰ appears only while
// the sidebar is closed (navigation lives in the sidebar).
function TopBar({ sidebarOpen, onOpenSidebar }) {
  return (
    <header className="topbar">
      {!sidebarOpen && (
        <button className="link-btn icon-btn" aria-label="Open sidebar" onClick={onOpenSidebar}>
          <Icon name="menu" />
        </button>
      )}
      <span className="brand"><Icon name="logo" className="brand-icon" /> Chat with Docs</span>
      <div className="theme-btn"><ThemeSwitch /></div>
    </header>
  );
}

function Protected({ children }) {
  const { isAuthed } = useAuth();
  return isAuthed ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { isAuthed } = useAuth();
  // Open by default on desktop; phones start closed (the sidebar overlays).
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 700);
  return (
    <div className="app">
      {isAuthed && <TopBar sidebarOpen={sidebarOpen} onOpenSidebar={() => setSidebarOpen(true)} />}
      <div className="shell">
        {isAuthed && <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
        <main className="content">
          <Routes>
            <Route path="/login" element={isAuthed ? <Navigate to="/documents" replace /> : <Login />} />
            <Route path="/documents" element={<Protected><Documents /></Protected>} />
            <Route path="/chat" element={<Protected><Chat /></Protected>} />
            <Route path="/settings" element={<Protected><Settings /></Protected>} />
            <Route path="*" element={<Navigate to={isAuthed ? '/documents' : '/login'} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

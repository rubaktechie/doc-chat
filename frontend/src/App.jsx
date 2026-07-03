import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Documents from './pages/Documents.jsx';
import Chat from './pages/Chat.jsx';
import Settings from './pages/Settings.jsx';

function NavBar() {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const link = (to, label) => (
    <Link to={to} className={pathname === to ? 'nav-link active' : 'nav-link'}>{label}</Link>
  );
  return (
    <nav className="navbar">
      <span className="brand">📄 Chat With Your Docs</span>
      <div className="nav-links">
        {link('/documents', 'Documents')}
        {link('/chat', 'Chat')}
        {link('/settings', 'Settings')}
        <button className="link-btn" onClick={logout}>Log out</button>
      </div>
    </nav>
  );
}

function Protected({ children }) {
  const { isAuthed } = useAuth();
  return isAuthed ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { isAuthed } = useAuth();
  return (
    <div className="app">
      {isAuthed && <NavBar />}
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
  );
}

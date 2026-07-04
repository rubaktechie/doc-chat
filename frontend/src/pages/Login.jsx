import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';
import ThemeSwitch from '../components/ThemeSwitch.jsx';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setError('');
    setConfirm('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const fn = mode === 'login' ? api.login : api.signup;
      const { token } = await fn(email, password);
      login(token);
      navigate('/documents');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="auth-theme-switch"><ThemeSwitch /></div>
      <div className="auth-card">
        <div className="auth-brand"><Icon name="logo" className="brand-icon" /> Chat with Docs</div>

      {/* Sliding segmented toggle between the two modes. */}
      <div className="auth-tabs" role="tablist" aria-label="Sign in or create an account">
        <span className={`auth-tab-indicator ${mode}`} aria-hidden="true" />
        <button
          type="button" role="tab" aria-selected={mode === 'login'}
          className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
          onClick={() => switchMode('login')}
        >
          Log in
        </button>
        <button
          type="button" role="tab" aria-selected={mode === 'signup'}
          className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
          onClick={() => switchMode('signup')}
        >
          Sign up
        </button>
      </div>

      <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <form onSubmit={submit}>
        <label>Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </label>
        {/* Stays mounted so the reveal animates; disabled while logging in. */}
        <div className={`confirm-field ${mode === 'signup' ? 'show' : ''}`}>
          <label>Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required={mode === 'signup'}
              disabled={mode !== 'signup'}
              minLength={6}
            />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
      </div>
    </>
  );
}

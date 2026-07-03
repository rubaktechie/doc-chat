import { createContext, useContext, useEffect, useState } from 'react';
import { getToken, setToken, clearToken, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTok] = useState(getToken());

  const login = (t) => { setToken(t); setTok(t); };
  const logout = () => { clearToken(); setTok(null); };

  // When any API call gets a 401 (invalid/expired token), drop the session.
  // Clearing the token flips isAuthed to false, so <Protected> routes redirect
  // back to /login automatically.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, isAuthed: Boolean(token), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

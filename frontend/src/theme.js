// Theme persistence: dark is the stylesheet default; "light" is applied via
// data-theme on <html>. Falls back to the OS preference on first visit.
const THEME_KEY = 'docchat_theme';

export function getTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

export function toggleTheme() {
  const next = getTheme() === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  return next;
}

// Apply on import so there's no flash of the wrong theme before React mounts.
applyTheme(getTheme());

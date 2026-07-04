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

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  return theme;
}

export function toggleTheme() {
  return setTheme(getTheme() === 'light' ? 'dark' : 'light');
}

// Apply on import so there's no flash of the wrong theme before React mounts.
applyTheme(getTheme());

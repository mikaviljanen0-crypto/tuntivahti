import { useEffect, useState } from 'react';

export const themeKey = 'tjt.workspace.theme';
const normalize = value => value === 'dark' ? 'dark' : 'light';
function readTheme() {
  try { return normalize(localStorage.getItem(themeKey)); }
  catch { return normalize(document.documentElement.dataset.theme); }
}
function applyTheme(value) {
  const theme = normalize(value);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#102721' : '#153d33');
  return theme;
}
// This external module is loaded before React mounts and works with the portal CSP.
if (typeof document !== 'undefined') applyTheme(readTheme());

export function useWorkspaceTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    setTheme(applyTheme(readTheme()));
    const sync = event => {
      if (event.key === themeKey || event.key === null) setTheme(applyTheme(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function toggleTheme() {
    const next = applyTheme(theme === 'dark' ? 'light' : 'dark');
    setTheme(next);
    try { localStorage.setItem(themeKey, next); } catch { /* Private storage may be unavailable. */ }
  }
  return [theme, toggleTheme];
}

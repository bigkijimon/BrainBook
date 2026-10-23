import { DEFAULT_THEME, isThemeName } from './theme-palette.mjs';

const STORE = 'brainbook-theme';

// Sets the palette the stylesheet (:root[data-theme]) and the JS-only renderers (xterm, Three.js) read.
export function applyTheme(name: string | null | undefined) {
  const next = isThemeName(name) ? (name as string) : DEFAULT_THEME;
  if (document.documentElement.dataset.theme === next) return next;
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(STORE, next); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('brainbook-themechange', { detail: next }));
  return next;
}

// First paint: reuse the last choice so the page does not flash the default palette before /api/setup answers.
export function restoreTheme() {
  let saved: string | null = null;
  try { saved = localStorage.getItem(STORE); } catch { /* private mode */ }
  applyTheme(saved);
}

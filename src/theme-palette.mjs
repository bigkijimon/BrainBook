// Owner-selected sunset reference. CSS, SVG, canvas and Three.js share this
// palette; none of those renderers needs to parse another renderer's colors.
export const themePalette = Object.freeze({
  pink: '#efa7bd',
  rose: '#e8a0b8',
  coral: '#ee9e8a',
  peach: '#eebdb4',
  lavender: '#bba8d2',
  lilac: '#d5b9dd',
  mauve: '#c69ab5',
  text: '#f8e4d9',
  secondary: '#ded0e5',
  muted: '#bba8c9',
  night: '#1d1420',
  surface: '#2a1c2e',
  deep: '#251928',
  danger: '#f18ca3',
  // Synthwave hues are decoration only; approved text/control tones above stay fixed.
  cyanGlow: '#54e3e1',
  magentaGlow: '#d65be8',
  violetGlow: '#8061c5',
  // Department identity hues (owner 2026-10-11: every department its own colour). Decoration only.
  sunGlow: '#ffb35c',
  mintGlow: '#6ff0b5',
  skyGlow: '#7aa8ff',
  hotGlow: '#ff6fb0',
  limeGlow: '#e8e36a',
});

export function themeDeclarations() {
  return ':root {\n' + Object.entries(themePalette).flatMap(([key, hex]) => {
    const rgb = [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ');
    return [`  --theme-${key}: ${hex};`, `  --theme-${key}-rgb: ${rgb};`];
  }).join('\n') + '\n}';
}


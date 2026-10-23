// Owner-selected sunset reference. CSS, SVG, canvas and Three.js share this
// palette; none of those renderers needs to parse another renderer's colors.
// Named palettes (owner 2026-10-23): `miami` is the default and the only one the unscoped
// :root block carries; every palette is also emitted as :root[data-theme="<name>"] so a theme
// switch is just `document.documentElement.dataset.theme = name`.
const miami = Object.freeze({
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
  // Page backdrop gradient stops and the phone bottom bar (were hard-coded hex in the CSS).
  skyA: '#241031',
  skyB: '#33153f',
  skyC: '#451a45',
  barA: '#20142f',
  barB: '#171125',
});

// Alternates only restate the accent/surface keys; department identity hues stay shared.
const variant = (overrides) => Object.freeze({ ...miami, ...overrides });

export const themePalettes = Object.freeze({
  miami,
  aurora: variant({
    pink: '#7fd8c9', rose: '#8fd0d8', coral: '#8ec9f0', peach: '#b6e6e0',
    lavender: '#9fb8e8', lilac: '#b9c9f0', mauve: '#87b4cf',
    text: '#e4f3f2', secondary: '#c6dde2', muted: '#9bb4c0',
    night: '#0f1a1f', surface: '#18262d', deep: '#142027',
    danger: '#f19a9a', magentaGlow: '#5fa8ff', violetGlow: '#4f7fd1',
    skyA: '#0f2229', skyB: '#12303a', skyC: '#163f4a', barA: '#14262d', barB: '#0e1a20',
  }),
  ember: variant({
    pink: '#f2a38a', rose: '#ee9b86', coral: '#f0b062', peach: '#f3c9a8',
    lavender: '#d9a98c', lilac: '#e6bfa0', mauve: '#cf9a82',
    text: '#fbeadb', secondary: '#e8d3c0', muted: '#c4a898',
    night: '#1c1411', surface: '#2b1d18', deep: '#241813',
    danger: '#f4857a', magentaGlow: '#ff7a45', violetGlow: '#c2512f',
    skyA: '#2a1710', skyB: '#3b1d12', skyC: '#4d2412', barA: '#2a1b15', barB: '#1c120e',
  }),
  slate: variant({
    pink: '#b4c0e0', rose: '#aebbdc', coral: '#c8b8a8', peach: '#d4cbc4',
    lavender: '#a8b4d6', lilac: '#bfc6e2', mauve: '#9aa6c4',
    text: '#e8ecf5', secondary: '#cdd3e2', muted: '#9ca5bb',
    night: '#12151c', surface: '#1b2029', deep: '#171b23',
    danger: '#f09aa8', magentaGlow: '#8a9bff', violetGlow: '#5b6bc0',
    skyA: '#171c2b', skyB: '#1d2438', skyC: '#252d47', barA: '#1c2230', barB: '#13171f',
  }),
});

export const DEFAULT_THEME = 'miami';
export const themeNames = Object.freeze(Object.keys(themePalettes));
export const themeLabels = Object.freeze({ miami: 'Miami neon', aurora: 'Aurora', ember: 'Ember', slate: 'Slate' });

// Back-compat: every existing import keeps getting the default palette.
export const themePalette = themePalettes[DEFAULT_THEME];

export const isThemeName = (name) => typeof name === 'string' && Object.hasOwn(themePalettes, name);

// The palette the page is showing right now (canvas / terminal code that cannot read CSS vars).
export function activePalette() {
  const name = typeof document === 'undefined' ? DEFAULT_THEME : document.documentElement.dataset.theme;
  return themePalettes[isThemeName(name) ? name : DEFAULT_THEME];
}

export const hexToInt = (hex) => Number.parseInt(hex.slice(1), 16);

const body = (palette) => Object.entries(palette).flatMap(([key, hex]) => {
  const rgb = [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ');
  return [`  --theme-${key}: ${hex};`, `  --theme-${key}-rgb: ${rgb};`];
}).join('\n');

// Default palette on :root, then one scoped block per named palette.
export function themeDeclarations() {
  const scoped = Object.entries(themePalettes).map(([name, palette]) => `:root[data-theme="${name}"] {\n${body(palette)}\n}`);
  return [`:root {\n${body(themePalette)}\n}`, ...scoped].join('\n');
}

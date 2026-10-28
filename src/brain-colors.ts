// Life-area colours for the brain map. Kept out of BrainScene.tsx so App can read them without
// pulling Three.js into the first-load bundle (BrainScene itself is lazy-loaded).
import { themePalette } from './theme-palette.mjs';
import type { LifeArea } from './types';

export const areaColors = (palette: typeof themePalette): Record<LifeArea, number> => ({ finance: Number.parseInt(palette.coral.slice(1), 16), learning: Number.parseInt(palette.lavender.slice(1), 16), 'mental-health': Number.parseInt(palette.peach.slice(1), 16), work: Number.parseInt(palette.pink.slice(1), 16), play: Number.parseInt(palette.coral.slice(1), 16) });
export const AREA_COLOR = areaColors(themePalette);

# BrainBook sunset theme

## Approved warm foreground plus synthwave decoration

The owner's follow-up preserves the approved fonts and warm text/control/data palette. `cyanGlow`, `magentaGlow` and `violetGlow` are decorative-only accents; `src/neon-navigation.css` adds the supplied synthwave background and small neon frames without changing quantity/state semantics. The provided reference is reused locally, not newly generated or published. Primary navigation uses a shared set of nine licensed Lucide department symbols (`team-marks.mjs` / `TeamMark.tsx`); labels remain available through ARIA, status descriptions and pointer/keyboard hints. Runtime menu membership still comes from the real department feed, not the symbol catalog; a SecurityAgent symbol is not proof of connected inference or completed registration.

Regressions: `node --test tests/team-marks.test.mjs tests/icon-navigation.test.mjs tests/icon-provenance.test.mjs`; `BRAINBOOK_TEST_URL=http://127.0.0.1:4199 node scripts/test-icon-navigation.mjs` checks actual focus-label/Escape/touch/filter/background paths against a no-autopilot isolated server. Main navigation, all affected pages and portrait/landscape geometry need the shared full browser suite. Capture fingerprints include department glyphs/styles, and renderer hashes include the reference background. Root-source, independent review and installed-native acceptance remain separate gates.

The canonical palette is `src/theme-palette.mjs`. It supplies warm pink, coral, peach, lavender, plum surfaces and cream text to CSS, inline SVG, canvas and Three.js. Source data, progress/unknown states, semantic labels and motion are unchanged by a palette change.

`node scripts/sync-theme-palette.mjs` regenerates only the delimited token block at the start of `src/styles.css`. The official `npm run build` executes this synchronization. `--check` rejects drift without changing the stylesheet. CSS token availability must not depend on which JavaScript entry a component harness loads.

Verification:

- `node --test tests/theme-palette.test.mjs tests/neon-polish.test.mjs tests/relationship-scene.test.mjs`
- `node scripts/sync-theme-palette.mjs --check`
- `node scripts/test-theme-colors.mjs` — actual isolated CSS cascade, not an installed-app test.
- `npx tsc --noEmit` and `npm run build`.
- Caller-owned isolated no-autopilot server plus `scripts/test-neon-browser.mjs` for real application navigation, viewport/touch emulation and normal/reduced motion. Keep intercepted mutations and physical-device evidence distinct.

Capture fingerprints include both the generated stylesheet and the canonical palette. Never use stale captures after changing either. Reproduce old cyan/green bars against the baseline, and measure real fills, text, button hover/background/focus/disabled states after rendering. Shared default button rules must not fall back to platform gray; pastel-filled controls need dark readable text.

Local evidence and recovery artifacts belong outside Obsidian. A candidate build or a passing isolated cascade does not establish independent review, installed application loading or a physical-phone pass. Preserve those gates explicitly.

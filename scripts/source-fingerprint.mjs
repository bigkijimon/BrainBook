// One fingerprint of the files that decide a measured layout, read by the gates that need it.
//
// scripts/test-team-sheet-fit.mjs and scripts/test-control-center.mjs write theirs into
// evidence/*-manifest.json so a capture can be attributed to the source that produced it, and
// scripts/check-harness-build.mjs re-reads them during `npm run build` so a build after a source change
// says out loud that the last measurement is stale.
//
// It is a hash of file contents, not of timestamps and not of the repository: an mtime changes on a
// checkout that changed nothing, and a hash of git state would not cover a file that is not committed.
// The content hash answers the only question a reviewer has, which is "does this picture describe the
// source I am looking at".
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));

// Everything the popup's measured layout depends on: the component that walks the chain, the stylesheet
// that places every box, the roster the names come from, and the harness page the measurement runs
// against. A change to any of them can move a card, so a change to any of them invalidates a capture.
export const LAYOUT_SOURCES = [
  'src/TeamRail.tsx',
  'src/TeamMark.tsx',
  'src/team-marks.mjs',
  'src/neon-navigation.css',
  'src/styles.css',
  'src/theme-palette.mjs',
  'src/agentRoster.ts',
  'scripts/team-sheet-harness/main.tsx',
];

// The same four questions for the Control Center / Next Work List captures, answered about the files
// that decide those rows. `src/next-work.mjs` is here and not in LAYOUT_SOURCES because it is what
// builds every row label: a change to it can put different words in the same box, which a picture of
// the card cannot distinguish from no change at all. Two measured surfaces sharing a stylesheet is
// why the shared file appears in both lists - each list is its own surface's answer to "what can move
// this picture", and neither is a subset of the other.
export const CARD_SOURCES = [
  'src/ControlCenter.tsx',
  'src/next-work.mjs',
  'src/styles.css',
  'src/theme-palette.mjs',
  'scripts/control-center-harness/main.tsx',
];

// 16 hex characters is 64 bits, far past any collision a repo of this size can produce, and it stays
// readable in a log line and in a diff.
const fingerprintOf = (sources) => {
  const hash = createHash('sha256');
  for (const relative of sources) {
    const file = path.join(root, relative);
    hash.update(`${relative} `);
    // A missing file hashes as absent rather than throwing: the gate that reads this runs inside
    // `npm run build`, and a fingerprint helper that takes the build down when a file is renamed says
    // nothing about the layout it was asked to describe.
    hash.update(existsSync(file) ? readFileSync(file) : Buffer.from('<missing>'));
  }
  return hash.digest('hex').slice(0, 16);
};

export const layoutFingerprint = () => fingerprintOf(LAYOUT_SOURCES);
export const cardFingerprint = () => fingerprintOf(CARD_SOURCES);

// The manifests a measurement run leaves behind, and the one thing that makes an evidence folder
// self-describing. Absent means no run has ever finished here; `running` means a run started and did not
// finish; `complete` with a fingerprint is the only state that describes a picture. One definition per
// measured surface, imported by both the writer and the reader: a manifest name written as a literal in
// two places is two chances for them to disagree about what they are looking at. The Control Center has
// its own rather than a shared one because it is a different surface measured by a different run — the
// two must be able to be complete and stale independently, which a single shared name would prevent.
export const MANIFEST = 'team-sheet-manifest.json';
export const CARD_MANIFEST = 'control-center-manifest.json';

// The eight screenshots one measurement run owes, in one place. It was a literal inside
// scripts/test-team-sheet-fit.mjs and nothing else could name one: `npm run build` had no way to say
// *which* files in evidence/ are popup captures, so the one warning it could print about them was
// "the team popup has never been measured on this tree" — printed while five `team-sheet-*.png` files
// sat in the same folder. That reads as "nothing was ever produced" when the truth is the worse one:
// pictures were produced, by a stylesheet that no longer exists, and nothing on disk says so. The
// writer imports this list so it deletes and rewrites exactly these eight, and the reader imports it so
// it can name the ones sitting on disk unattributed. Two literals for the same folder is two chances for
// a capture to be written that the build cannot recognise as one.
export const POPUP_CAPTURES = [
  'team-sheet-apppro-1440x900.png',
  'team-sheet-moviepro-1440x900.png',
  'team-sheet-blogpro-1440x900.png',
  'team-sheet-stresspro-1440x900.png',
  'team-sheet-moviepro-1440x700-fallback.png',
  'team-sheet-moviepro-390x844.png',
  'team-sheet-moviepro-390x844-composer.png',
  'team-sheet-investpro-evolution-1440x900.png',
];

// The two captures the Control Center / Next Work List finish line is stated in, in one place for the
// same reason POPUP_CAPTURES is one place: the run writes them and `npm run build` has to be able to
// name the ones sitting on disk unattributed. They used to be a literal inside
// scripts/test-control-center.mjs, so the folder holding two screenshots of a list nobody could open
// and nothing to attribute was the state the build was blind to.
export const CARD_CAPTURES = [
  'control-center-1440x900.png',
  'control-center-390x844.png',
];

export const readManifest = (dir) => {
  const file = path.join(dir, MANIFEST);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    // A manifest that will not parse is not a manifest. Reporting it as absent is the honest reading for
    // both callers: nothing on disk describes those captures, and both of them say so out loud.
    return { status: 'unreadable', error: error instanceof Error ? error.message : String(error) };
  }
};

// The Control Center's manifest, same states and same reasons, kept as its own reader rather than a
// parameter: the name it looks for and the folder it describes are the whole contract, and a reader
// that takes them as arguments is a reader that will be called with the wrong pair.
export const readCardManifest = (dir) => {
  const file = path.join(dir, CARD_MANIFEST);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { status: 'unreadable', error: error instanceof Error ? error.message : String(error) };
  }
};
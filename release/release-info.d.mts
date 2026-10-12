// The typed surface of release/release-info.mjs for src/, which imports it (`import { release } from
// '../release/release-info.mjs'` in App.tsx). The declaration itself stays plain JavaScript because
// the packaging step, the check script and the tests all run it under Node; this file is the same
// shape in the form TypeScript can read.
//
// It has to exist. tsconfig sets `allowJs: false`, so an .mjs import resolves to its sibling .d.mts and
// to nothing else: without this file `npx tsc --noEmit` fails with TS7016 (no declaration file for the
// module) and the screen footer cannot read the app number from the one declaration. src/ carries the
// same pair for its .mjs modules (task-focus.d.mts, next-work.d.mts), so this is that convention
// applied to the one module outside src/.
//
// tsconfig "include" lists "release" so these types are inside the tsc program and a mistake in them
// fails `npx tsc --noEmit` (scripts/check-ts-scope.mjs walks src/ and scripts/ only, so that entry is
// what covers this directory). Keep it in step with the object: a field added to `release` without a
// line here is invisible to the app instead of a compile error.

export type Purchase = {
  /** 'undecided' until the owner sets the offer; no amount and no link exist in that state. */
  status: string;
  currency: string | null;
  amount: number | null;
  provider: string | null;
  checkoutUrl: string | null;
};

export type Release = {
  name: string;
  version: string;
  build: number;
  bundleId: string;
  minMacOS: string;
  arch: string;
  /** Markdown-relative so the README install step works in the repository and on the releases page. */
  releasesUrl: string;
  licence: string;
  licenceFile: string;
  purchase: Purchase;
};

export const release: Release;

/** The packaged zip name macos/build-app.sh prints: name, declared version, architecture. */
export const assetName: string;

/** The same shape with the version elided, for prose: BrainBook-…-arm64.zip. */
export const assetNameElided: string;

/** The licence as one Markdown sentence, so the README and a release note cannot word it differently. */
export function licenceLine(): string;

/** The one offer sentence a surface may show; it carries no figure while the offer is unset. */
export function purchaseNotice(): string;

/** Why a half-declared purchase is refused, or null when the declaration is coherent. */
export function purchaseProblem(): string | null;

/** Where the app's checkout action points, or null while nothing is declared to buy. */
export function purchaseLink(): string | null;

/** The whole Info.plist, every bundle fact read from `release`. */
export function plistXml(): string;

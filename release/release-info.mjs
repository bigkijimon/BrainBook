// The one declaration of what is being shipped and where it is downloaded from.
//
// Version, build, bundle id, the packaged asset name and the download link were written out by hand
// in three places — the Info.plist heredoc in macos/build-app.sh, the zip name in the same script,
// and the install step in README.md — so nothing forced them to agree. Everything here is now read
// from this file: the build writes Info.plist and names the zip from it, and
// scripts/check-release-info.mjs recomputes those surfaces against README.md instead of trusting any
// of them. Change a figure here once; nothing else is allowed to repeat it. The UI reads this module
// too, so a screen names the version instead of typing it.
//
// package.json keeps its own `version` because npm cannot read a module. That field is private and
// never published, so it is not a release figure and must not be read as the app version.
//
// The licence and the purchase path are declared here for the same reason the version is: one
// wording, read by every surface. The licence is MIT because LICENSE in this repository is MIT, and
// scripts/check-release-info.mjs reads that file and fails when the two disagree. Amount, currency,
// provider and checkout link are declared unset — they are the owner's decision (provider account,
// tax, refund policy), and an invented figure must never reach a download page. Setting them is a
// one-line edit in the object below, and the same script is where a check grows to cover them, so
// the price in the app and the price in a release note are compared rather than typed twice.
// The app's own account menu is the third surface that reads this module (the sidebar footer names the
// version, and it reads the licence and the offer from here), so the funnel needs no screen edit.
export const release = {
  name: 'BrainBook',
  version: '1.2.0',
  build: 3,
  bundleId: 'com.bku.brainbook',
  minMacOS: '13.0',
  arch: 'arm64',
  // Markdown-relative so README keeps working in the repository and on the releases page; the GitHub
  // account that owns it is the owner's to fill in, so no absolute URL is guessed here.
  releasesUrl: '../../releases/latest',
  // MIT, because LICENSE in this repository is MIT. check-release-info.mjs reads that file, so the
  // declared name and the licence text cannot disagree.
  licence: 'MIT',
  licenceFile: 'LICENSE',
  // Price and payment. null means "not decided", never "zero": a surface may not render a figure or a
  // link that is not set here, and purchaseNotice() is the sentence it shows instead.
  purchase: {
    status: 'undecided',
    currency: null,
    amount: null,
    provider: null,
    checkoutUrl: null,
  },
};

// What macos/build-app.sh names the packaged zip, and the same shape with the version elided for
// prose. Both are derived, so the README pattern cannot become a third hand-written version.
export const assetName = `${release.name}-${release.version}-${release.arch}.zip`;
export const assetNameElided = `${release.name}-…-${release.arch}.zip`;

// The licence as one Markdown sentence, so the README's License section and a release note carry the
// words the declaration holds instead of a second hand-written wording.
export const licenceLine = () => `${release.licence}. See [${release.licenceFile}](${release.licenceFile}).`;

// The offer sentence, and the only one any surface may show. It names the price and nothing else:
// the licence has its own line next to it, so a screen never states the same fact twice. While the
// offer is unset this is the whole sentence — no amount, no provider, no link. Once the owner sets
// them it becomes the price and the provider, so the app and a download page cannot advertise two
// different offers.
export const purchaseNotice = () => (release.purchase.amount === null
  ? `${release.name} has no plan or price set yet, so there is no checkout to link to.`
  : `${release.name} costs ${release.purchase.currency} ${release.purchase.amount}, paid through ${release.purchase.provider}.`);

// Why a half-declared offer is refused, or null when the declaration is coherent. An amount with no
// currency or provider, or a checkout link with no amount, would put a price on a page nobody decided;
// the check script reports this instead of letting it render.
export const purchaseProblem = () => {
  const { status, currency, amount, provider, checkoutUrl } = release.purchase;
  if (amount === null) {
    if (status !== 'undecided') return `purchase.status is "${status}" but no amount is set`;
    if (checkoutUrl !== null) return 'purchase.checkoutUrl is set but purchase.amount is not';
    return null;
  }
  if (currency === null) return 'purchase.amount is set but purchase.currency is not';
  if (provider === null) return 'purchase.amount is set but purchase.provider is not';
  if (checkoutUrl === null) return 'purchase.amount is set but purchase.checkoutUrl is not';
  if (status === 'undecided') return 'an amount is set but purchase.status is still "undecided"';
  return null;
};

// Where a screen's checkout action points, or null while there is nothing to buy. It is gated on the
// whole offer being declared, not on the link alone, so half a declared price renders no button that
// goes nowhere. This is the whole purchase path in the app: it appears by itself once the owner fills
// the object in, with no screen edited.
export const purchaseLink = () => (purchaseProblem() === null && release.purchase.checkoutUrl
  ? release.purchase.checkoutUrl
  : null);

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// What macOS asks the person to read in a permission dialog, so those sentences are edited next to
// the other bundle metadata rather than inside a shell heredoc.
const USAGE = {
  microphone: "BrainBook listens only while its mic button is on, to turn your spoken instruction into text you check before sending.",
  speech: 'BrainBook turns your spoken instruction into text you check before sending.',
};

// The whole Info.plist, so every bundle fact comes from the declaration above. Callers write this
// file; they do not assemble plist keys of their own.
export const plistXml = () => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>${esc(release.name)}</string>
  <key>CFBundleDisplayName</key><string>${esc(release.name)}</string>
  <key>CFBundleIdentifier</key><string>${esc(release.bundleId)}</string>
  <key>CFBundleExecutable</key><string>${esc(release.name)}</string>
  <key>CFBundleIconFile</key><string>${esc(release.name)}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${esc(release.version)}</string>
  <key>CFBundleVersion</key><string>${esc(release.build)}</string>
  <key>LSMinimumSystemVersion</key><string>${esc(release.minMacOS)}</string>
  <key>LSArchitecturePriority</key><array><string>${esc(release.arch)}</string></array>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>${esc(USAGE.microphone)}</string>
  <key>NSSpeechRecognitionUsageDescription</key><string>${esc(USAGE.speech)}</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
`;
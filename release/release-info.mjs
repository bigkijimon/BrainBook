// The one declaration of what is being shipped and where it is downloaded from.
//
// Version, build, bundle id, the packaged asset name and the download link were written out by hand
// in three places — the Info.plist heredoc in macos/build-app.sh, the zip name in the same script,
// and the install step in README.md — so nothing forced them to agree. Everything here is now read
// from this file: the build writes Info.plist and names the zip from it, and
// scripts/check-release-info.mjs recomputes those surfaces against README.md instead of trusting any
// of them. Change a figure here once; nothing else is allowed to repeat it.
//
// package.json keeps its own `version` because npm cannot read a module. That field is private and
// never published, so it is not a release figure and must not be read as the app version.
//
// Plan, price and payment provider are deliberately absent. They are the owner's decision (provider,
// account, tax, licence), and an invented figure must never reach a download page. When they are
// decided they are declared here, and check-release-info.mjs is where a checker grows to cover them.
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
};

// What macos/build-app.sh names the packaged zip, and the same shape with the version elided for
// prose. Both are derived, so the README pattern cannot become a third hand-written version.
export const assetName = `${release.name}-${release.version}-${release.arch}.zip`;
export const assetNameElided = `${release.name}-…-${release.arch}.zip`;

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
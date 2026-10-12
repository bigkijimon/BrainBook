// Recomputes every release figure from release/release-info.mjs and fails when a surface that ships
// or shows one disagrees: the generated Info.plist, the zip name macos/build-app.sh packages, the
// README install step, the licence text, the price wording and the offer the app shows. Read-only:
// it reads the repository and writes nothing.
// Run: node scripts/check-release-info.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetName, assetNameElided, licenceLine, plistXml, purchaseNotice, purchaseProblem, release } from '../release/release-info.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Directories and files that are not surfaces a person reads a release figure in: build output,
// dependencies, and the lockfile (which carries every dependency's own version).
const SKIP = new Set(['node_modules', 'dist', '.git', '.run', '.playwright-cli', '.venv', '__pycache__',
  'data', 'evidence', 'inputs', 'build', 'coverage', 'package-lock.json']);
// Only text can state a release figure, and reading the icon or a screenshot as text is noise.
// `mts` is here for the typed surfaces (*.d.mts): they are shipped text too, and the one holding the
// release declaration's shape is exactly where a hand-written app number would land next.
const TEXT = /\.(mjs|js|ts|tsx|mts|cts|json|md|html|css|py|swift|sh|zsh|txt|yml|yaml|plist|xml)$/;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  if (SKIP.has(entry.name)) return [];
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return walk(full);
  return entry.isFile() && TEXT.test(entry.name) ? [full] : [];
});

let checks = 0;
const ok = () => { checks++; };

// 1. The declaration's own derivations. Both asset names are built from the same facts, so a caller
//    can never be handed a shape the packager does not produce.
assert.equal(assetName, `${release.name}-${release.version}-${release.arch}.zip`, 'assetName derivation');
assert.equal(assetNameElided, `${release.name}-…-${release.arch}.zip`, 'assetNameElided derivation');
assert.ok(release.releasesUrl, 'release.releasesUrl is empty: the README download link has nothing to point at');
ok();

// 2. The generated Info.plist carries every declared bundle fact and no version literal of its own.
const plist = plistXml();
const value = (key) => {
  const found = plist.match(new RegExp(`<key>${key}</key><string>([^<]*)</string>`));
  assert.ok(found, `Info.plist has no <string> value for ${key}`);
  return found[1];
};
for (const [key, expected] of [
  ['CFBundleName', release.name], ['CFBundleDisplayName', release.name],
  ['CFBundleIdentifier', release.bundleId], ['CFBundleExecutable', release.name],
  ['CFBundleShortVersionString', release.version], ['CFBundleVersion', String(release.build)],
  ['LSMinimumSystemVersion', release.minMacOS],
]) {
  assert.equal(value(key), expected, `Info.plist ${key}`);
  ok();
}
assert.ok(plist.includes(`<key>LSArchitecturePriority</key><array><string>${release.arch}</string></array>`),
  `Info.plist LSArchitecturePriority is not [${release.arch}]`);
ok();
// A second version literal inside the plist is the drift this check exists for: the bundle would
// advertise one version while the declaration, the zip name and the README say another.
const versions = [...plist.matchAll(/<string>(\d+\.\d+\.\d+)<\/string>/g)].map((m) => m[1]);
assert.deepEqual(versions, [release.version], 'Info.plist carries a version literal that is not the declared one');
ok();

// 3. macos/build-app.sh reads the declaration instead of repeating it. The plist used to be a
//    hand-written heredoc here and the zip name a hand-written pattern, so the bundle, the packaged
//    name and the README could each state a different version.
const build = read('macos/build-app.sh');
assert.ok(build.includes('scripts/write-macos-plist.mjs'), 'build-app.sh does not generate Info.plist from the declaration');
assert.ok(build.includes('ASSET=$("$NODE" scripts/write-macos-plist.mjs'), 'build-app.sh does not take the packaged asset name from the declaration');
assert.ok(build.includes('ZIP="$OUT/$ASSET"'), 'build-app.sh still names the zip by its own pattern');
// A bundle key, the bundle id and the zip pattern are each one figure too many: if any of them
// appears here, the declaration is no longer the only place a release figure is written.
for (const retyped of [/CFBundle/, /com\.bku\.brainbook/, /-arm64\.zip/]) {
  assert.ok(!retyped.test(build), `build-app.sh retypes a release figure (${retyped})`);
  ok();
}

// 4. The README install step points at the declared download and the declared asset shape.
const readme = read('README.md');
assert.ok(readme.includes(`\`${assetNameElided}\``), `README does not name the download as \`${assetNameElided}\``);
assert.ok(readme.includes(`](${release.releasesUrl})`), `README does not link the declared release URL ${release.releasesUrl}`);
ok();

// 5. Nothing else in the repository repeats the product name with a concrete version. This is the
//    net that catches the next surface that is added by hand instead of read from the declaration.
const declared = path.join(root, 'release/release-info.mjs');
const strays = walk(root)
  .filter((file) => file !== declared)
  .filter((file) => /BrainBook-\d+\.\d+\.\d+/.test(fs.readFileSync(file, 'utf8')))
  .map((file) => path.relative(root, file));
assert.deepEqual(strays, [], `a concrete BrainBook version is written outside release/release-info.mjs: ${strays.join(', ')}`);
ok();

// Every text file the two nets below read, one entry per line, so a failure names the line and not
// only the file. The declaration itself is left out: a figure is allowed to exist there.
const lines = walk(root)
  .filter((file) => file !== declared)
  .flatMap((file) => fs.readFileSync(file, 'utf8').split('\n')
    .map((line, at) => ({ at: `${path.relative(root, file)}:${at + 1}`, line })));

// 6. The licence. The declaration names it and LICENSE in this repository is the text with the final
//    word, so a README, a release note or a bundle that says something else is a wrong licence.
const licenceText = read(release.licenceFile);
assert.ok(licenceText.startsWith(`${release.licence} License`),
  `${release.licenceFile} is not the ${release.licence} licence the declaration names`);
ok();
assert.ok(readme.includes(licenceLine()), `README does not carry the declared licence line: ${licenceLine()}`);
ok();

// 7. The price sentence is the only one a surface may show, and the declaration behind it is whole:
//    an amount with no currency, provider or link would put a price on a page nobody decided.
assert.equal(purchaseProblem(), null, `purchase is half-declared: ${purchaseProblem()}`);
ok();
assert.ok(readme.includes(purchaseNotice()), `README does not carry the declared price wording: ${purchaseNotice()}`);
ok();
// The app is the second surface that states the offer, and it is where a reader decides whether to
// pay at all — so the account menu reads the same declaration instead of holding its own sentence.
// The README claimed this while the app showed nothing, and no check could see it: the wording and the
// checkout link are both looked up here, so dropping either one fails instead of silently shipping
// an app that says less than its own download page.
const app = read('src/App.tsx');
for (const called of ['purchaseNotice()', 'purchaseLink()', 'release.licence']) {
  assert.ok(app.includes(called), `src/App.tsx does not read ${called} from release/release-info.mjs`);
  ok();
}

// 8. No concrete price is written outside the declaration. A figure only counts on a line that also
//    talks about price, plan, payment or a refund: the Router's own cost ceiling is a cost, not a
//    price, and a note about a payment feature is not an amount.
const MONEY = /[$¥€£]\s?\d|\b(?:USD|JPY|EUR|GBP|CAD|AUD)\s?\d/i;
const ABOUT_PRICE = /\b(price|prices|pricing|plan|plans|subscription|subscribe|checkout|payment|payments|refund|refunds|purchase|purchases)\b/i;
const priced = lines.filter((entry) => MONEY.test(entry.line) && ABOUT_PRICE.test(entry.line)).map((entry) => entry.at);
assert.deepEqual(priced, [], `a concrete price is written outside release/release-info.mjs: ${priced.join(', ')}`);
ok();

// 9. Every screen reads the version from the declaration instead of typing it. One sidebar footer
//    carried a version literal while the bundle shipped a newer one, and the net in step 5 did not
//    see it because that label is not a `BrainBook-x.y.z` string.
const retyped = lines.filter((entry) => /BRAINBOOK\s*[/:]\s*v?\d/i.test(entry.line)).map((entry) => entry.at);
assert.deepEqual(retyped, [], `a screen writes the app version by hand instead of reading it: ${retyped.join(', ')}`);
ok();
assert.match(app, /from '\.\.\/release\/release-info\.mjs'/,
  'src/App.tsx does not import the release declaration, so its version label cannot read it');
ok();

console.log(`PASS ${checks} release checks (version ${release.version}, build ${release.build}, licence ${release.licence}, ${release.purchase.status === 'undecided' ? 'no price set' : `${release.purchase.currency} ${release.purchase.amount} via ${release.purchase.provider}`}, asset ${assetName})`);
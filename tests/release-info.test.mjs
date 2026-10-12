// Release contract (owner 2026-10-04: "set up the price, payment and download path"). Version,
// build, bundle id, the packaged asset name and the download link used to be written out by hand in
// the Info.plist heredoc, the zip name and the README install step, and they drifted. These tests
// pin the one declaration (release/release-info.mjs) and the facts the build crosses for: the plist
// it writes, the asset name it prints, the licence that LICENSE must agree with, and the price
// declaration — whose figures are the owner's decision, so what is pinned here is that they are unset
// and that no wording shows an amount until they are.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetName, assetNameElided, licenceLine, plistXml, purchaseLink, purchaseNotice, purchaseProblem, release } from '../release/release-info.mjs';

test('one declaration produces both asset names and the whole Info.plist', () => {
  assert.equal(assetName, `${release.name}-${release.version}-${release.arch}.zip`);
  assert.equal(assetNameElided, `${release.name}-…-${release.arch}.zip`);
  const plist = plistXml();
  const value = (key) => plist.match(new RegExp(`<key>${key}</key><string>([^<]*)</string>`))?.[1];
  assert.equal(value('CFBundleShortVersionString'), release.version);
  assert.equal(value('CFBundleVersion'), String(release.build));
  assert.equal(value('CFBundleIdentifier'), release.bundleId);
  assert.equal(value('LSMinimumSystemVersion'), release.minMacOS);
  assert.ok(plist.includes(`<key>LSArchitecturePriority</key><array><string>${release.arch}</string></array>`));
  // macOS reads these two before recording a permission, so dropping either one silently breaks the
  // mic and the dictation; they are facts about the app, declared next to the rest of the metadata.
  for (const key of ['NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription']) {
    assert.ok(value(key)?.length > 20, `Info.plist ${key} is empty`);
  }
  // One version literal only: a second one would be a bundle advertising something the zip name,
  // the README and the declaration do not.
  assert.deepEqual([...plist.matchAll(/<string>(\d+\.\d+\.\d+)<\/string>/g)].map((m) => m[1]), [release.version]);
});

test('the build writes the plist and is told the packaged asset name', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'release-info-'));
  const out = path.join(dir, 'Contents/Info.plist');
  const argv = process.argv;
  const real = process.stdout.write.bind(process.stdout);
  const spoken = [];
  let written;
  process.argv = [argv[0], argv[1], out];
  process.stdout.write = (chunk) => { spoken.push(String(chunk)); return true; };
  try {
    // Re-imported per run: the generator runs on import, like the build step that calls it.
    await import(`../scripts/write-macos-plist.mjs?run=${Date.now()}`);
    written = await fs.readFile(out, 'utf8');
  } finally {
    process.stdout.write = real;
    process.argv = argv;
    await fs.rm(dir, { recursive: true, force: true });
  }
  // stdout carries the name only: macos/build-app.sh reads it into ASSET and names the zip from it.
  assert.equal(spoken.join(''), `${assetName}\n`);
  assert.equal(written, plistXml());
});

test('the declared licence is the licence in LICENSE, and the README carries those words', async () => {
  const text = await fs.readFile(new URL(`../${release.licenceFile}`, import.meta.url), 'utf8');
  assert.ok(text.startsWith(`${release.licence} License`),
    `LICENSE is not the ${release.licence} licence the declaration names`);
  assert.equal(licenceLine(), `${release.licence}. See [${release.licenceFile}](${release.licenceFile}).`);
  const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(licenceLine()), 'README must carry the declared licence line');
});

test('the price is the owner\'s to set, and no wording shows an amount until it is', async () => {
  // Unset is a coherent state: nothing to render, and no amount anywhere in the wording.
  assert.equal(purchaseProblem(), null, `purchase is half-declared: ${purchaseProblem()}`);
  assert.equal(release.purchase.amount, null);
  assert.equal(release.purchase.checkoutUrl, null);
  assert.equal(purchaseNotice(),
    `${release.name} has no plan or price set yet, so there is no checkout to link to.`);
  assert.doesNotMatch(purchaseNotice(), /[$¥€£]\s?\d/, 'the price sentence must not carry a figure while none is set');
  // No dead button: the app's checkout action is null, not an empty or invented href.
  assert.equal(purchaseLink(), null);
  const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(purchaseNotice()), 'README must carry the declared price wording');
  const app = await fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes('purchaseNotice()'), 'the app must read the offer sentence from the declaration');
  assert.ok(app.includes('release.licence'), 'the app must show the declared licence, not a name of its own');
});

test('declaring the whole offer is the only edit the purchase path needs', () => {
  // What the owner will do: fill the object in. Nothing else may have to change, so the sentence gains
  // the price and the app's checkout action appears — and a half-declared offer gets neither, which is
  // what stops a link going nowhere with a price on the page. Restored in finally, since the checks
  // that read this module afterwards expect it undecided.
  const undecided = { ...release.purchase };
  try {
    Object.assign(release.purchase, {
      status: 'available',
      currency: 'JPY',
      amount: 1200,
      provider: 'the payment page the owner sets up',
      checkoutUrl: 'https://example.invalid/checkout',
    });
    assert.equal(purchaseProblem(), null);
    assert.match(purchaseNotice(), /1200/, 'a declared amount must reach the sentence');
    assert.equal(purchaseLink(), 'https://example.invalid/checkout');

    Object.assign(release.purchase, { provider: null });
    assert.match(purchaseProblem(), /provider/, 'an amount with no provider must be refused');
    assert.equal(purchaseLink(), null, 'a half-declared offer must not produce a checkout link');
  } finally {
    Object.assign(release.purchase, undecided);
  }
  assert.equal(purchaseLink(), null);
});
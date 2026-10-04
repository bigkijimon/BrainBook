// Release contract (owner 2026-10-04: "set up the price, payment and download path"). Version,
// build, bundle id, the packaged asset name and the download link used to be written out by hand in
// the Info.plist heredoc, the zip name and the README install step, and they drifted. These tests
// pin the one declaration (release/release-info.mjs) and the two facts the build crosses for: the
// plist it writes, and the asset name it prints. Price and provider are the owner's decision, so
// there is nothing to pin for them here yet.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assetName, assetNameElided, plistXml, release } from '../release/release-info.mjs';

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
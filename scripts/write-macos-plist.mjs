// Writes the app's Info.plist from release/release-info.mjs and prints the release asset name, so
// macos/build-app.sh gets the bundle metadata and the packaged zip name from one declaration.
// Read: node scripts/write-macos-plist.mjs <out.plist>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetName, plistXml } from '../release/release-info.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/write-macos-plist.mjs <out.plist>');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(root, out);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, plistXml());
// stdout is the build's only channel for the asset name, so nothing else may be printed here.
process.stdout.write(`${assetName}\n`);
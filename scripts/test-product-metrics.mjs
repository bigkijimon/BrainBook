// Every product card on the Home page is one row of numbers, and every row is a proxy route in
// server.mjs. Nothing else connects the two lists, so a product can be added on one side and stay
// invisible (or show "Not found") on the other. This pins that contract at the interface:
//   1. the route exists and names its config key when no admin token is configured (500, not 404),
//   2. server.mjs and the products array in src/App.tsx list exactly the same slugs, both ways,
//   3. a configured token makes the route actually proxy (never 404/500).
// The token value is never read or asserted, so this stays offline-safe: 3 accepts whatever the
// upstream answers (200 upstream, 401 upstream, or 502 when unreachable) and only rejects the two
// statuses that mean "the proxy itself is not wired up".
// Run: node scripts/test-product-metrics.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_TOKEN_ENV = ['STUDYABROADOS_ADMIN_TOKEN', 'EIKENPREP_ADMIN_TOKEN', 'MRINV_ADMIN_TOKEN', 'RESERVATIONSAAS_ADMIN_TOKEN'];
const baseEnv = () => {
  const env = { ...process.env, ASTER_HERMES_BIN: path.join(os.tmpdir(), 'no-hermes') };
  delete env.OBSIDIAN_VAULT_PATH;
  delete env.MORNING_VAULT;
  delete env.NODE_OPTIONS;
  for (const name of ADMIN_TOKEN_ENV) delete env[name];
  return env;
};

let nextPort = 4780 + Math.floor(Math.random() * 40);
const startServer = async (extraEnv = {}) => {
  const port = nextPort++;
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'brainbook-metrics-'));
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...baseEnv(), PORT: String(port), BRAINBOOK_HOME: home, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { base, server, home, log: () => log };
};

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); } };

const unconfigured = await startServer();
try {
  await check('a route with no admin token reports its config key instead of 404', async () => {
    for (const [slug, key] of [['studyabroados', 'studyabroadosAdminToken'], ['eikenprep', 'eikenprepAdminToken'], ['mrinv', 'mrinvAdminToken'], ['reservation-saas', 'reservationsaasAdminToken']]) {
      const response = await fetch(`${unconfigured.base}/api/product-metrics/${slug}`);
      assert.equal(response.status, 500, `${slug} should answer 500 without a token, got ${response.status}`);
      assert.match((await response.json()).error, new RegExp(key));
    }
    assert.equal((await fetch(`${unconfigured.base}/api/product-metrics/not-a-product`)).status, 404, 'an unregistered slug must stay a 404');
  });

  await check('every proxied product has a Home card, and every card has a route', async () => {
    const server = await fs.readFile(path.join(root, 'server.mjs'), 'utf8');
    const app = await fs.readFile(path.join(root, 'src', 'App.tsx'), 'utf8');
    const slugs = (text, re) => [...new Set([...text.matchAll(re)].map((m) => m[1]))].sort();
    const routed = slugs(server, /url\.pathname === '\/api\/product-metrics\/([a-z0-9-]+)'/g);
    const shown = slugs(app, /apiUrl: '\/api\/product-metrics\/([a-z0-9-]+)'/g);
    assert.ok(routed.includes('mrinv'), 'server.mjs has no /api/product-metrics/mrinv route');
    assert.deepEqual(shown, routed, 'src/App.tsx products array and the server.mjs proxy routes have drifted apart');
  });

  await check('a configured Mr.INV token makes the route proxy upstream', async () => {
    const configured = await startServer({ MRINV_ADMIN_TOKEN: 'test-token-not-a-secret' });
    try {
      const response = await fetch(`${configured.base}/api/product-metrics/mrinv`);
      assert.notEqual(response.status, 404, 'route is not registered');
      assert.notEqual(response.status, 500, 'MRINV_ADMIN_TOKEN was not read from the environment');
      const body = await response.text();
      if (response.status !== 502) assert.doesNotMatch(body, /not configured/);
    } finally {
      configured.server.kill('SIGTERM');
      await fs.rm(configured.home, { recursive: true, force: true });
    }
  });
} finally {
  unconfigured.server.kill('SIGTERM');
  await fs.rm(unconfigured.home, { recursive: true, force: true });
}

console.log(results.join('\n'));
if (results.some((line) => line.startsWith('FAIL'))) { console.log(`--- server log ---\n${unconfigured.log().trim().split('\n').slice(-10).join('\n')}`); process.exit(1); }
console.log(`\n${results.length} passed`);
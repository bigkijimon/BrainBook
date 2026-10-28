import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLsof, openableServices, readLocalPorts, LOCAL_SERVICES } from '../local-ports.mjs';

const LSOF = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
Python    11111 yuma    5u  IPv4 0xabc      0t0  TCP 127.0.0.1:8189 (LISTEN)
Python    11111 yuma    6u  IPv4 0xabc      0t0  TCP 127.0.0.1:8189 (LISTEN)
node      22222 yuma   18u  IPv6 0xdef      0t0  TCP *:5678 (LISTEN)
qwen      33333 yuma    9u  IPv4 0x123      0t0  TCP 127.0.0.1:8080 (LISTEN)
mystery   44444 yuma    9u  IPv4 0x456      0t0  TCP 127.0.0.1:9999 (LISTEN)
python3   55555 yuma    7u  IPv4 0x789      0t0  TCP 127.0.0.1:8642 (LISTEN)
`;

test('parses lsof like the Swift app: one entry per pid+endpoint, port from the endpoint token', () => {
  const entries = parseLsof(LSOF);
  assert.equal(entries.length, 5);
  assert.deepEqual(entries.find((e) => e.port === 5678), { command: 'node', pid: 22222, address: '*:5678', port: 5678 });
});

test('only owner-openable services are shown, labelled from the table, sorted by port', () => {
  const shown = openableServices(parseLsof(LSOF));
  assert.deepEqual(shown.map((s) => [s.port, s.label]), [[5678, 'n8n'], [8189, 'ComfyUI'], [8642, 'Hermes Gateway']]);
  assert.ok(!shown.some((s) => s.port === 8080 || s.port === 9999), 'monitor-only and unknown ports are not surfaced');
});

test('the table keeps every port from the original app', () => {
  assert.deepEqual(LOCAL_SERVICES.map((s) => s.port).sort((a, b) => a - b), [3000, 5678, 5679, 8080, 8082, 8189, 8191, 8642, 8765, 8770, 8792, 8799]);
});

test('lsof failure is reported, not hidden as an empty list', async () => {
  const bad = await readLocalPorts({ run: async () => { throw new Error('boom'); } });
  assert.match(bad.error, /boom/);
  const ok = await readLocalPorts({ run: async () => LSOF });
  assert.equal(ok.error, null);
  assert.equal(ok.services.length, 3);
});

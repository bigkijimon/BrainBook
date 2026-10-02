// Mac and phone get separate Hermes sessions, and each starts at its own screen size
// (owner 2026-09-29: the shared session was drawn at the Mac's width and wrapped on the iPhone).
// Uses a fake pty host that prints its start size, so no real Hermes is started.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createHermesTerminal } from '../terminal.mjs';

const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'bb-term-'));
const fakeHost = path.join(dir, 'fake-pty.py');
fs.writeFileSync(fakeHost, 'import os,sys,time\nsys.stdout.write("SIZE=" + os.environ["ASTER_PTY_SIZE"] + "\\n"); sys.stdout.flush()\ntime.sleep(30)\n');

class FakeSocket {
  constructor() { this.readyState = 1; this.sent = []; this.handlers = {}; }
  send(data) { this.sent.push(Buffer.isBuffer(data) ? data.toString() : String(data)); }
  on(event, fn) { this.handlers[event] = fn; }
  emit(event, ...args) { this.handlers[event]?.(...args); }
  text() { return this.sent.join(''); }
}
const make = (name) => createHermesTerminal({ root: dir, cwd: dir, python: 'python3', hermes: { bin: '/bin/echo', path: process.env.PATH }, log: () => {}, name, ptyHost: fakeHost });
const waitFor = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

test('phone and Mac run separate sessions, each started at its own width', async () => {
  const mac = make('mac');
  const phone = make('phone');
  try {
    const macWs = new FakeSocket();
    const phoneWs = new FakeSocket();
    mac.attach(macWs);
    phone.attach(phoneWs);
    macWs.emit('message', JSON.stringify({ type: 'resize', rows: 50, cols: 180 }), false);
    phoneWs.emit('message', JSON.stringify({ type: 'resize', rows: 40, cols: 44 }), false);
    assert.ok(await waitFor(() => macWs.text().includes('SIZE=')), 'mac session started');
    assert.ok(await waitFor(() => phoneWs.text().includes('SIZE=')), 'phone session started');
    assert.match(macWs.text(), /SIZE=50,180/);
    assert.match(phoneWs.text(), /SIZE=40,44/);
    assert.doesNotMatch(phoneWs.text(), /SIZE=50,180/, 'phone never sees the Mac session');
    assert.equal(phone.status().size.cols, 44);
    assert.equal(mac.status().size.cols, 180);
  } finally {
    mac.stop();
    phone.stop();
  }
});

test('a screen that never reports its size still gets a session', async () => {
  const term = make('late');
  try {
    const ws = new FakeSocket();
    term.attach(ws);
    assert.ok(await waitFor(() => ws.text().includes('SIZE=30,100')), 'started with the default size after the grace period');
  } finally {
    term.stop();
  }
});

// Owner 2026-09-29: the phone's Hermes froze (keys went in, the input line never changed) and
// the page still said LIVE, with no way out. A forced restart replaces the frozen process.
test('a forced restart replaces a running (frozen) session with a new one', async () => {
  const term = make('frozen');
  try {
    const ws = new FakeSocket();
    term.attach(ws);
    ws.emit('message', JSON.stringify({ type: 'resize', rows: 40, cols: 44 }), false);
    assert.ok(await waitFor(() => ws.text().includes('SIZE=')), 'first session started');
    const starts = () => ws.sent.filter((m) => m.includes('"type":"started"')).length;
    const before = starts();
    ws.emit('message', JSON.stringify({ type: 'restart' }), false);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(starts(), before, 'a plain restart never kills a running session');
    ws.emit('message', JSON.stringify({ type: 'restart', force: true }), false);
    assert.ok(await waitFor(() => starts() > before, 8000), 'a forced restart starts a fresh session');
    assert.equal(term.status().running, true);
  } finally {
    term.stop();
  }
});

test('an attachment path is pasted without pressing Enter', async () => {
  const term = make('attach');
  try {
    const ws = new FakeSocket();
    term.attach(ws);
    ws.emit('message', JSON.stringify({ type: 'resize', rows: 40, cols: 44 }), false);
    assert.ok(await waitFor(() => ws.text().includes('SIZE=')));
    assert.deepEqual(term.pasteRaw('/tmp/a b.png \r\n'), { ok: true });
    assert.deepEqual(term.pasteRaw('\r\n'), { ok: false, reason: 'empty' });
  } finally {
    term.stop();
  }
});

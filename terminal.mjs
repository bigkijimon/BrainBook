// A Hermes terminal session shared by the screens attached to it. The server runs two:
// one for the Mac window and one for paired phones (owner 2026-09-29), because a
// full-screen TUI drawn at the Mac's width wraps into a mess on a 44-column iPhone.
// The session only ever runs the Hermes CLI: the command is resolved on this Mac at startup and
// clients can send keystrokes and window sizes, never a command line.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SCROLLBACK_BYTES = 256 * 1024;
const CANDIDATES = ['/opt/homebrew/bin/hermes', '/usr/local/bin/hermes', `${process.env.HOME}/.local/bin/hermes`];

// Finder-launched apps get a minimal PATH, so ask the user's login shell where Hermes lives.
export const resolveHermes = async (configured) => {
  let loginPath = process.env.PATH || '';
  try {
    const { stdout } = await execFileAsync('/bin/zsh', ['-lc', 'printf "%s\\n%s" "$PATH" "$(command -v hermes)"'], { timeout: 8000 });
    const [shellPath, found] = stdout.split('\n');
    loginPath = shellPath || loginPath;
    const bin = configured || found || CANDIDATES.find((candidate) => fs.existsSync(candidate));
    return { bin: bin && fs.existsSync(bin) ? bin : null, path: loginPath };
  } catch {
    const bin = configured || CANDIDATES.find((candidate) => fs.existsSync(candidate));
    return { bin: bin && fs.existsSync(bin) ? bin : null, path: loginPath };
  }
};

const frame = (kind, payload) => {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const head = Buffer.alloc(5);
  head.write(kind, 0, 'latin1');
  head.writeUInt32BE(body.length, 1);
  return Buffer.concat([head, body]);
};

// Text pasted from an idea: strip control characters so it can never press Enter or escape the paste.
export const cleanPasteText = (text) => String(text || '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);

export const createHermesTerminal = ({ root, cwd, python = '/usr/bin/python3', hermes, log = console.log, name = 'hermes', ptyHost = null }) => {
  let child = null;
  let scrollback = [];
  let scrollbackBytes = 0;
  let size = { rows: 30, cols: 100 };
  let lastExit = null;
  const clients = new Set();

  const broadcast = (data, binary) => { for (const ws of clients) if (ws.readyState === 1) ws.send(data, { binary }); };
  const remember = (chunk) => {
    scrollback.push(chunk);
    scrollbackBytes += chunk.length;
    while (scrollbackBytes > SCROLLBACK_BYTES && scrollback.length > 1) scrollbackBytes -= scrollback.shift().length;
  };

  const start = () => {
    if (child) return true;
    if (!hermes.bin) {
      broadcast(JSON.stringify({ type: 'error', message: 'Hermes CLI was not found on this Mac. Install Hermes, then press Restart.' }), false);
      return false;
    }
    scrollback = [];
    scrollbackBytes = 0;
    lastExit = null;
    child = spawn(python, [ptyHost || path.join(root, 'pty-host.py')], {
      cwd,
      env: { ...process.env, PATH: hermes.path, TERM: 'xterm-256color', COLORTERM: 'truecolor', LANG: process.env.LANG || 'en_US.UTF-8', ASTER_PTY_ARGV: JSON.stringify([hermes.bin]), ASTER_PTY_SIZE: `${size.rows},${size.cols}` },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    log(`${name} terminal started pid=${child.pid} size=${size.cols}x${size.rows} bin=${hermes.bin}`);
    child.stdout.on('data', (chunk) => { remember(chunk); broadcast(chunk, true); });
    child.stdin.on('error', () => {});
    child.on('exit', (code) => {
      log(`${name} terminal exited code=${code}`);
      child = null;
      lastExit = code;
      broadcast(JSON.stringify({ type: 'exit', code }), false);
    });
    broadcast(JSON.stringify({ type: 'started' }), false);
    return true;
  };

  const write = (data) => { if (child) child.stdin.write(frame('d', data)); };
  const resize = (rows, cols) => {
    const next = { rows: Math.max(10, Math.min(300, rows | 0)), cols: Math.max(40, Math.min(500, cols | 0)) };
    if (next.rows === size.rows && next.cols === size.cols) return;
    size = next;
    if (child) child.stdin.write(frame('r', `${size.rows},${size.cols}`));
  };

  // A reattaching screen (an iPhone returning from the background) gets the raw scrollback,
  // which for a full-screen TUI is a pile of partial redraws: measured 2026-09-29, the phone
  // came back to a blank screen. Nudging the size makes Hermes repaint the whole screen.
  const repaint = () => {
    if (!child) return;
    child.stdin.write(frame('r', `${size.rows},${Math.max(40, size.cols - 1)}`));
    setTimeout(() => { if (child) child.stdin.write(frame('r', `${size.rows},${size.cols}`)); }, 120);
  };

  const attach = (ws) => {
    clients.add(ws);
    let mySize = null;
    ws.send(JSON.stringify({ type: 'hello', running: Boolean(child), lastExit, hermes: Boolean(hermes.bin) }));
    if (scrollback.length) ws.send(Buffer.concat(scrollback), { binary: true });
    if (child) setTimeout(repaint, 300);
    // Start after the screen reports its size, so Hermes draws its first screen at the
    // right width (starting at the 100-column default wrapped the banner on a phone).
    let startTimer = null;
    if (!child && lastExit === null) startTimer = setTimeout(() => { startTimer = null; if (!child && lastExit === null) start(); }, 1500);
    const startNow = () => { if (startTimer) { clearTimeout(startTimer); startTimer = null; if (!child && lastExit === null) start(); } };
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // The screen someone is typing on decides the terminal size.
        if (mySize) resize(mySize.rows, mySize.cols);
        return write(Buffer.from(data));
      }
      let message;
      try { message = JSON.parse(String(data)); } catch { return; }
      if (message.type === 'resize') { mySize = { rows: message.rows, cols: message.cols }; resize(message.rows, message.cols); startNow(); }
      if (message.type === 'restart' && !child) start();
      // A frozen Hermes (measured 2026-09-29: the phone's Hermes stopped reading keystrokes while
      // the page still said LIVE) can be replaced from the screen. The conversation stays saved
      // in Hermes' session history; /resume brings it back.
      if (message.type === 'restart' && child && message.force === true) {
        const old = child;
        old.once('exit', () => { if (!child) start(); });
        old.kill('SIGTERM');
        setTimeout(() => { if (child === old) { execFile('/usr/bin/pkill', ['-KILL', '-P', String(old.pid)], () => old.kill('SIGKILL')); } }, 4000);
      }
    });
    ws.on('close', () => { clients.delete(ws); if (startTimer) clearTimeout(startTimer); });
  };

  // Put text on the Hermes input line without submitting it (bracketed paste).
  const paste = (text) => {
    const clean = cleanPasteText(text);
    if (!clean) return { ok: false, reason: 'empty' };
    if (!child && !start()) return { ok: false, reason: 'hermes-missing' };
    write(`\u001b[200~${clean}\u001b[201~`);
    return { ok: true };
  };

  // Paste a server-built attachment path (not user text) without submitting it.
  const pasteRaw = (text) => {
    const clean = String(text || '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, '');
    if (!clean.trim()) return { ok: false, reason: 'empty' };
    if (!child && !start()) return { ok: false, reason: 'hermes-missing' };
    write(`\u001b[200~${clean}\u001b[201~`);
    return { ok: true };
  };

  const stop = () => { if (child) child.kill('SIGTERM'); };
  return { attach, paste, pasteRaw, stop, status: () => ({ running: Boolean(child), clients: clients.size, hermes: hermes.bin, size: { ...size } }) };
};

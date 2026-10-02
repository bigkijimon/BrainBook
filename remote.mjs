// Phone access for BrainBook: pair an iPhone or Android phone with this Mac over Tailscale.
//
// - BrainBook listens for phones ONLY on this Mac's Tailscale address (a private network that only
//   the owner's own devices can join). It never listens on the public internet or home Wi-Fi.
// - A phone is paired by scanning a one-time QR code shown in the Mac app (valid 5 minutes, one use).
// - A paired phone keeps a long-lived device key in a cookie; only its SHA-256 hash is stored here.
//   Any device can be removed from the Mac app at any time.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const COOKIE = 'brainbook_device';
const PAIR_TTL_MS = 5 * 60 * 1000;
const TAILSCALE_BINS = ['/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const isTailscaleAddress = (address) => {
  const match = /^100\.(\d+)\.\d+\.\d+$/.exec(address || '');
  return Boolean(match) && Number(match[1]) >= 64 && Number(match[1]) <= 127;
};

export const findTailscaleAddress = () => {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) if (entry.family === 'IPv4' && !entry.internal && isTailscaleAddress(entry.address)) return entry.address;
  }
  return null;
};

const tailscaleName = async () => {
  for (const bin of TAILSCALE_BINS) {
    try {
      const { stdout } = await execFileAsync(bin, ['status', '--json'], { timeout: 4000 });
      const self = JSON.parse(stdout).Self;
      return { dnsName: (self?.DNSName || '').replace(/\.$/, '') || null, hostName: self?.HostName || null };
    } catch { /* try the next location */ }
  }
  return { dnsName: null, hostName: null };
};

export const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((part) => part.trim().split('=')).filter(([key]) => key).map(([key, ...rest]) => [key, decodeURIComponent(rest.join('='))]));

export const createRemote = async ({ stateDir }) => {
  const file = path.join(stateDir, 'remote.json');
  let state = { enabled: false, devices: [] };
  try { state = { ...state, ...JSON.parse(await fs.readFile(file, 'utf8')) }; } catch { /* first run */ }
  const pairings = new Map();
  let lastSeenSave = 0;

  const save = async () => {
    await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temp, file);
  };

  const publicDevice = ({ id, name, createdAt, lastSeenAt }) => ({ id, name, createdAt, lastSeenAt });

  return {
    get enabled() { return state.enabled; },
    async setEnabled(enabled) { state.enabled = Boolean(enabled); await save(); },

    async status(port) {
      const address = findTailscaleAddress();
      const names = address ? await tailscaleName() : { dnsName: null, hostName: null };
      return { enabled: state.enabled, tailscale: Boolean(address), address, ...names, url: address ? `http://${address}:${port}/` : null, devices: state.devices.map(publicDevice) };
    },

    createPairing() {
      const now = Date.now();
      for (const [code, entry] of pairings) if (entry.expiresAt < now) pairings.delete(code);
      const code = crypto.randomBytes(18).toString('base64url');
      pairings.set(code, { expiresAt: now + PAIR_TTL_MS });
      return { code, expiresAt: new Date(now + PAIR_TTL_MS).toISOString() };
    },

    async claim(code, name) {
      const entry = pairings.get(code);
      pairings.delete(code);
      if (!entry || entry.expiresAt < Date.now()) return null;
      const token = crypto.randomBytes(32).toString('base64url');
      const device = { id: `dev-${crypto.randomUUID().slice(0, 8)}`, name: String(name || 'Phone').trim().slice(0, 60) || 'Phone', tokenHash: sha256(token), createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
      state.devices.push(device);
      await save();
      return { device: publicDevice(device), token };
    },

    authenticate(cookieHeader) {
      const token = parseCookies(cookieHeader)[COOKIE];
      if (!token) return null;
      const hash = sha256(token);
      const device = state.devices.find((entry) => entry.tokenHash.length === hash.length && crypto.timingSafeEqual(Buffer.from(entry.tokenHash), Buffer.from(hash)));
      if (!device) return null;
      device.lastSeenAt = new Date().toISOString();
      if (Date.now() - lastSeenSave > 60_000) { lastSeenSave = Date.now(); save().catch(() => {}); }
      return publicDevice(device);
    },

    async revoke(id) {
      const before = state.devices.length;
      state.devices = state.devices.filter((device) => device.id !== id);
      if (state.devices.length !== before) await save();
      return state.devices.length !== before;
    },
  };
};

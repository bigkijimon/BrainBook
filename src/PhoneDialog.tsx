import { useCallback, useEffect, useState } from 'react';
import { Smartphone, Trash2, X } from 'lucide-react';

type Device = { id: string; name: string; createdAt: string; lastSeenAt: string };
type RemoteStatus = { enabled: boolean; tailscale: boolean; address: string | null; dnsName: string | null; url: string | null; devices: Device[] };
type Pairing = { url: string; qrSvg: string; expiresAt: string };

const when = (value: string) => new Intl.DateTimeFormat('en-GB', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

// Mac-only settings: turn phone access on, pair a phone with a QR code, remove phones.
export default function PhoneDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/remote');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setStatus(body);
    return body as RemoteStatus;
  }, []);

  useEffect(() => { load().catch((err) => setError(String(err.message || err))); }, [load]);
  // Refresh the device list while the QR code is showing, so a new phone appears as soon as it pairs.
  useEffect(() => {
    if (!pairing) return undefined;
    const known = status?.devices.length || 0;
    const timer = window.setInterval(async () => {
      const next = await load().catch(() => null);
      if (next && next.devices.length > known) setPairing(null);
      if (Date.parse(pairing.expiresAt) < Date.now()) setPairing(null);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [pairing, load, status?.devices.length]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  const setEnabled = (enabled: boolean) => run(async () => {
    const response = await fetch('/api/remote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setStatus(body);
    if (!enabled) setPairing(null);
  });
  const showQr = () => run(async () => {
    const response = await fetch('/api/remote/pair', { method: 'POST' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    setPairing(body);
  });
  const remove = (device: Device) => run(async () => {
    await fetch(`/api/remote/devices/${encodeURIComponent(device.id)}`, { method: 'DELETE' });
    await load();
  });

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="help-dialog phone-dialog" role="dialog" aria-modal="true" aria-labelledby="phone-title">
        <div className="help-head">
          <div><span className="eyebrow">BRAINBOOK / PHONE</span><h2 id="phone-title">Use BrainBook on your phone</h2></div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}><X size={17} strokeWidth={1.5} /></button>
        </div>

        {!status ? <p className="phone-muted">{error || 'Loading…'}</p> : <>
          <ol className="phone-steps">
            <li className={status.tailscale ? 'done' : ''}><strong>Tailscale</strong>{status.tailscale ? <span>Connected · {status.dnsName || status.address}</span> : <span>Install <a href="https://tailscale.com/download" target="_blank" rel="noreferrer">Tailscale (free)</a> on this Mac and on your phone, and sign in to the same account on both.</span>}</li>
            <li className={status.enabled ? 'done' : ''}><strong>Phone access</strong>
              <label className="phone-switch"><input type="checkbox" checked={status.enabled} disabled={busy || (!status.tailscale && !status.enabled)} onChange={(event) => setEnabled(event.target.checked)} /><span>{status.enabled ? 'ON — only paired phones on your Tailscale network can connect' : 'OFF'}</span></label>
            </li>
            <li className={status.devices.length ? 'done' : ''}><strong>Pair</strong>
              {pairing ? <div className="phone-qr">
                <div className="phone-qr-code" dangerouslySetInnerHTML={{ __html: pairing.qrSvg }} />
                <p>Scan this code with your phone's camera, then tap “Connect this phone”.<br /><small>Valid for 5 minutes, one use only</small></p>
              </div> : <button className="submit-button" type="button" disabled={busy || !status.enabled} onClick={showQr}><Smartphone size={14} strokeWidth={1.5} /> Show QR code</button>}
            </li>
          </ol>

          <div className="phone-devices">
            <span className="eyebrow">PAIRED DEVICES</span>
            {status.devices.length === 0 ? <p className="phone-muted">None yet.</p> : <ul>{status.devices.map((device) => <li key={device.id}>
              <Smartphone size={15} strokeWidth={1.5} /><div><strong>{device.name}</strong><small>Paired {when(device.createdAt)} · last seen {when(device.lastSeenAt)}</small></div>
              <button type="button" className="icon-button" aria-label={`Remove ${device.name}`} disabled={busy} onClick={() => remove(device)}><Trash2 size={14} strokeWidth={1.5} /></button>
            </li>)}</ul>}
          </div>
          {error && <p className="pair-error" role="alert">{error}</p>}
          <p className="phone-muted">The terminal runs Hermes only — it cannot open a shell. Phones work while this Mac is awake and BrainBook is open.</p>
        </>}
      </section>
    </div>
  );
}

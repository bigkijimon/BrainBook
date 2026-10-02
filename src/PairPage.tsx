import { useEffect, useState } from 'react';

// Opened on the phone from the QR code shown in BrainBook on the Mac.
export default function PairPage() {
  const code = new URLSearchParams(window.location.search).get('code') || '';
  const [name, setName] = useState(() => (/iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : /Android/.test(navigator.userAgent) ? 'Android' : 'Phone'));
  const [state, setState] = useState<'ready' | 'working' | 'done' | 'error'>(code ? 'ready' : 'error');
  const [message, setMessage] = useState(code ? '' : 'Open BrainBook on your Mac → Phone → Show QR code, then scan it with this phone.');

  useEffect(() => { document.title = 'Pair with BrainBook'; }, []);

  const pair = async () => {
    setState('working');
    try {
      const response = await fetch('/api/pair/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, name }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Pairing failed');
      setState('done');
      window.history.replaceState(null, '', '/');
      window.setTimeout(() => window.location.assign('/'), 700);
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Pairing failed');
    }
  };

  return (
    <div className="pair-page">
      <div className="vice-sky" aria-hidden="true"><span className="vice-sun" /><span className="vice-grid" /></div>
      <section className="pair-card">
        <p className="brand-name">BrainBook</p>
        <p className="brand-subtitle">IDEAS · FOR · HERMES</p>
        {state === 'done' ? <p className="pair-ok">Paired ✓ Opening BrainBook…</p> : <>
          <p className="pair-lede">Connect this phone to BrainBook on your Mac.</p>
          {code && <label className="pair-field"><span>Name for this phone</span><input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></label>}
          {message && <p className="pair-error" role="alert">{message}</p>}
          {code && state !== 'error' && <button type="button" className="primary-button" disabled={state === 'working' || !name.trim()} onClick={pair}><span>{state === 'working' ? 'Connecting…' : 'Connect this phone'}</span></button>}
        </>}
        <p className="pair-note">Works only while your Mac is on and both devices are signed in to Tailscale.</p>
      </section>
    </div>
  );
}

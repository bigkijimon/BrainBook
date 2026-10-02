import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

// Dark terminal palette with restrained Hermes teal and magenta accents.
const theme = {
  background: '#050505',
  foreground: '#e8e8e8',
  cursor: '#31e6d0',
  cursorAccent: '#050505',
  selectionBackground: 'rgba(49, 230, 208, 0.28)',
  black: '#111111', red: '#ff5964', green: '#51e6b0', yellow: '#e8c36a',
  blue: '#7b9cff', magenta: '#ec4ca6', cyan: '#31e6d0', white: '#e8e8e8',
  brightBlack: '#777777', brightRed: '#ff7a83', brightGreen: '#79f0c3', brightYellow: '#f3d78e',
  brightBlue: '#9bb2ff', brightMagenta: '#f278bd', brightCyan: '#78eee0', brightWhite: '#ffffff',
};

type Status = 'connecting' | 'live' | 'exited' | 'offline' | 'missing';

// iPhone photos are often HEIC, which Hermes' vision path does not read; re-encode to JPEG.
const toJpeg = (file: File) => new Promise<Blob>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/jpeg', 0.9);
  };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
  image.src = url;
});

// Keys a phone keyboard does not have. Hermes uses Esc to interrupt, Tab to complete, arrows for history.
const PHONE_KEYS: { label: string; data: string }[] = [
  { label: 'esc', data: '\u001b' }, { label: 'tab', data: '\t' }, { label: '↑', data: '\u001b[A' }, { label: '↓', data: '\u001b[B' },
  { label: '←', data: '\u001b[D' }, { label: '→', data: '\u001b[C' }, { label: '^C', data: '\u0003' }, { label: '/', data: '/' },
];

export default function HermesTerminal({ compact = false, phoneKeys = false }: { compact?: boolean; phoneKeys?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [generation, setGeneration] = useState(0);
  const [scrolledUp, setScrolledUp] = useState(false);

  useEffect(() => {
    if (!host.current) return undefined;
    const term = new Terminal({
      theme, allowProposedApi: true, cursorBlink: true, fontSize: compact ? 11 : 13, lineHeight: 1.15,
      fontFamily: '"SF Mono", ui-monospace, Menlo, monospace', scrollback: 8000, macOptionIsMeta: true,
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    term.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, '_blank')));
    term.open(host.current);
    fit.fit();
    if (!compact) term.focus();

    let disposed = false;
    let retry: number | undefined;
    const sendResize = () => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN && term.cols && term.rows) socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };
    // Phone touch scroll (owner 2026-09-29: the phone terminal could not scroll, so
    // long output pushed the layout around). xterm.js scrolls on wheel, not touch.
    // A vertical drag becomes line scrolling in the normal buffer, and a synthetic
    // wheel event in the alternate buffer (full-screen TUIs read it as mouse wheel).
    // A short tap still reaches xterm, so it keeps focusing the keyboard.
    const screen = host.current;
    let touchY: number | null = null;
    let carry = 0;
    let dragging = false;
    const lineHeight = () => Math.max(8, (screen.querySelector('.xterm-rows') as HTMLElement | null)?.getBoundingClientRect().height ?? 0) / Math.max(1, term.rows);
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { touchY = null; return; }
      touchY = event.touches[0].clientY; carry = 0; dragging = false;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (touchY === null || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const delta = touchY - y;
      if (!dragging && Math.abs(delta) < 6) return;
      dragging = true;
      event.preventDefault();
      event.stopPropagation();
      touchY = y;
      carry += delta;
      const step = lineHeight();
      const lines = Math.trunc(carry / step);
      if (!lines) return;
      carry -= lines * step;
      if (term.buffer.active.type === 'normal') term.scrollLines(lines);
      else screen.querySelector('.xterm-screen')?.dispatchEvent(new WheelEvent('wheel', { deltaY: lines * step, deltaMode: 0, bubbles: true, cancelable: true, clientX: event.touches[0].clientX, clientY: y }));
    };
    const onTouchEnd = () => { touchY = null; dragging = false; };
    screen.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    screen.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    screen.addEventListener('touchend', onTouchEnd, { capture: true });
    screen.addEventListener('touchcancel', onTouchEnd, { capture: true });
    // Fit after layout settles. Measured 2026-09-29 on the paired-phone layout: fitting
    // inside the ResizeObserver callback used the previous size, so the terminal was
    // always one step behind (530px wide in a 390px portrait screen, the portrait size
    // after turning to landscape). Fitting now and again shortly after catches the final size.
    // A timer, not requestAnimationFrame: frames do not run while the page is in the
    // background (an iPhone app switching back), so a frame-based fit never happened.
    let fitFrame = 0;
    const fitNow = () => {
      if (!screen.offsetWidth || !screen.offsetHeight) return; // hidden tab: fit when shown
      // The phone creates the terminal inside a hidden tab, where xterm measures a 0px
      // character cell. It never re-measures on its own, so fit() had no size and the
      // terminal stayed at the 80x24 default (530px wide on a 390px screen). Changing the
      // font size forces a fresh measurement.
      const proposed = fit.proposeDimensions();
      if (!proposed || !Number.isFinite(proposed.cols) || !Number.isFinite(proposed.rows)) {
        const size = term.options.fontSize ?? 11;
        term.options.fontSize = size + 1;
        term.options.fontSize = size;
      }
      try { fit.fit(); term.refresh(0, term.rows - 1); } catch { /* not measurable yet */ }
      sendResize();
    };
    const refit = () => {
      window.clearTimeout(fitFrame);
      fitNow();
      // Again once the rotation has settled, and once more after xterm has re-measured
      // its character cell (it measures 0 while the phone tab is hidden).
      fitFrame = window.setTimeout(() => { fitNow(); fitFrame = window.setTimeout(fitNow, 400); }, 120);
    };
    const observer = new ResizeObserver(refit);
    observer.observe(host.current);
    window.addEventListener('orientationchange', refit);
    window.visualViewport?.addEventListener('resize', refit);
    void document.fonts?.ready.then(() => { if (!disposed) refit(); });
    const encoder = new TextEncoder();
    term.onScroll(() => { const buffer = term.buffer.active; setScrolledUp(buffer.viewportY < buffer.baseY); });
    term.onData((data) => { const socket = socketRef.current; if (socket?.readyState === WebSocket.OPEN) socket.send(encoder.encode(data)); });

    const connect = () => {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${scheme}://${window.location.host}/api/terminal/socket`);
      socket.binaryType = 'arraybuffer';
      socketRef.current = socket;
      let firstFrame = true;
      socket.onopen = () => { setStatus('live'); sendResize(); };
      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const message = JSON.parse(event.data);
          if (message.type === 'hello') {
            if (firstFrame) term.reset();
            firstFrame = false;
            if (!message.hermes) setStatus('missing');
            else if (!message.running && message.lastExit !== null) setStatus('exited');
          }
          if (message.type === 'started') { term.reset(); setStatus('live'); sendResize(); }
          if (message.type === 'exit') { setStatus('exited'); term.write(`\r\n\x1b[35m[Hermes ended (code ${message.code}). Press Start Hermes to open it again.]\x1b[0m\r\n`); }
          if (message.type === 'error') { setStatus('missing'); term.write(`\r\n\x1b[31m${message.message}\x1b[0m\r\n`); }
          return;
        }
        term.write(new Uint8Array(event.data));
      };
      socket.onclose = () => {
        if (disposed) return;
        setStatus((current) => (current === 'missing' ? current : 'offline'));
        retry = window.setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      disposed = true;
      window.clearTimeout(retry);
      observer.disconnect();
      window.clearTimeout(fitFrame);
      window.removeEventListener('orientationchange', refit);
      window.visualViewport?.removeEventListener('resize', refit);
      screen.removeEventListener('touchstart', onTouchStart, { capture: true });
      screen.removeEventListener('touchmove', onTouchMove, { capture: true });
      screen.removeEventListener('touchend', onTouchEnd, { capture: true });
      screen.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      socketRef.current?.close();
      term.dispose();
      termRef.current = null;
    };
  }, [generation, compact]);

  const sendKey = (data: string) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(new TextEncoder().encode(data));
    termRef.current?.focus();
  };
  // Hermes keeps animating while frozen, so a hang cannot be detected from output; the owner
  // decides. The conversation is kept in Hermes' session history (/resume brings it back).
  const forceRestart = () => {
    const socket = socketRef.current;
    if (!window.confirm('Restart Hermes on this phone? Use this when it stops responding. The conversation is saved; type /resume to reopen it.')) return;
    if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ type: 'restart', force: true })); setStatus('connecting'); }
  };
  // Attach an image from the phone: the server saves it on the Mac and puts its path on the
  // Hermes input line (not submitted), so Hermes attaches it to the next message.
  const imageInput = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<string | null>(null);
  const sendImage = async (file: File | undefined) => {
    if (!file) return;
    setUpload('Sending image…');
    try {
      const type = file.type === 'image/heic' || file.type === 'image/heif' || !file.type ? await toJpeg(file) : file;
      const response = await fetch('/api/terminal/image', { method: 'POST', headers: { 'content-type': type.type || 'image/jpeg' }, body: type });
      const data = await response.json().catch(() => ({}));
      setUpload(response.ok ? '📎 Image attached. Add a message and press Enter.' : data.error || 'The image could not be sent.');
    } catch {
      setUpload('The image could not be sent.');
    }
    window.setTimeout(() => setUpload(null), 4000);
    if (imageInput.current) imageInput.current.value = '';
    termRef.current?.focus();
  };
  const restart = () => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ type: 'restart' })); setStatus('connecting'); }
    else setGeneration((value) => value + 1);
  };

  const label = { connecting: 'CONNECTING', live: 'LIVE', exited: 'ENDED', offline: 'RECONNECTING', missing: 'HERMES NOT FOUND' }[status];
  return (
    <div className={`terminal-page ${compact ? 'compact' : ''}`}>
      <header className="terminal-head">
        <span className={`terminal-dot ${status}`} />
        <strong>Hermes</strong>
        <span className="terminal-sub">idea · terminal</span>
        <span className="terminal-status">{label}</span>
        {(status === 'exited' || status === 'missing') && <button type="button" onClick={restart}>Start Hermes</button>}
      </header>
      <div className="terminal-body">
        <div className="terminal-host" ref={host} />
        {scrolledUp && <button type="button" className="terminal-bottom" aria-label="Jump to the latest output" onClick={() => { termRef.current?.scrollToBottom(); setScrolledUp(false); }}>↓ Latest</button>}
      </div>
      {upload && <div className="terminal-upload" role="status">{upload}</div>}
      {phoneKeys && <div className="terminal-keys" role="toolbar" aria-label="Terminal keys">
        <button type="button" className="terminal-attach" aria-label="Attach an image" onMouseDown={(event) => event.preventDefault()} onClick={() => imageInput.current?.click()}>📎</button>
        <input ref={imageInput} type="file" accept="image/*" hidden onChange={(event) => void sendImage(event.target.files?.[0])} />
        {PHONE_KEYS.map((key) => <button type="button" key={key.label} onMouseDown={(event) => event.preventDefault()} onClick={() => sendKey(key.data)}>{key.label}</button>)}
        <button type="button" className="terminal-restart" aria-label="Restart Hermes" onMouseDown={(event) => event.preventDefault()} onClick={forceRestart}>↻</button>
      </div>}
    </div>
  );
}

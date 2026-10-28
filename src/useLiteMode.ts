import { useEffect, useState } from 'react';

// Lite mode (owner 2026-10-28: BrainBook must not compete with MoviePro's GPU video generation).
// The signal is the same one the team sheet trusts: /api/agents/live, whose `gpu: true` rows come
// from agent-feed.py's read-only process scan (gpu_job_supervisor / bku-gpu-run ...). Nothing is
// guessed: no confirmed GPU row, no lite mode. While on, <html data-lite> lets lite-mode.css switch
// off every animation, blur and decorative full-window layer, and App unmounts the 3D canvas.
const POLL_MS = 20000;

export function useLiteMode(): boolean {
  const [lite, setLite] = useState(false);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return; // a hidden window already costs ~0% GPU
      try {
        const response = await fetch('/api/agents/live', { cache: 'no-store' });
        if (!response.ok) return; // unknown keeps the last known mode instead of flapping
        const body = await response.json() as { running?: Array<{ gpu?: boolean; session?: boolean }> };
        if (alive) setLite((body.running || []).some((row) => row.gpu === true && !row.session));
      } catch { /* server unreachable: keep the last known mode */ }
    };
    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, []);
  useEffect(() => {
    document.documentElement.toggleAttribute('data-lite', lite);
    return () => document.documentElement.removeAttribute('data-lite');
  }, [lite]);
  return lite;
}

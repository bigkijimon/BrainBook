// Receiver half of the usage measurement (sender: scripts/usage-beacon.mjs, rules + report: scripts/usage-metrics.mjs).
// Fetch-standard, so the same handler runs in a Worker or locally; nothing here is deployed.
//   handleUsage(request, store) -> Promise<Response>
//     Accepts one POSTed event body (any content type; the sender uses navigator.sendBeacon with a plain string
//     so the browser sends no CORS preflight). The body goes through acceptEvent, so a request with an extra
//     key is rejected whole. Request headers (IP, User-Agent, cookies) are never read, so they cannot be stored.
//     204 stored, 400 rejected, 405 not POST, 413 body over 1 KB, 503 store failed. Never throws.
//   store.append(event) is the seam: memory in tests, fileStore(path) in scripts/usage-local.mjs for a local
//     trial; a D1 adapter comes only after the owner picks the hosting (goal note decision 6).
// Runtime-neutral: no `node:*` imports and no `process`, so it bundles for a Worker unchanged.
import { acceptEvent } from './usage-metrics.mjs';

const MAX_BODY = 1024;
const reply = (status, reason) => new Response(reason ?? null, { status });

export async function handleUsage(request, store) {
  if (request.method !== 'POST') return reply(405, 'POST only');
  let raw;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_BODY) return reply(413, 'body too large');
    raw = JSON.parse(body);
  } catch {
    return reply(400, 'not JSON');
  }
  const r = acceptEvent(raw);
  if (!r.ok) return reply(400, r.reason);
  try {
    await store.append(r.event);
  } catch {
    return reply(503, 'store failed');
  }
  return reply(204);
}

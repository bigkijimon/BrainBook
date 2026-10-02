// Node-only adapters for the usage measurement, kept apart so usage-metrics.mjs, usage-beacon.mjs and
// usage-receiver.mjs stay runtime-neutral (they load in a Worker or a browser with no `process` or `node:*`).
//   fileStore(path)              -> store for handleUsage; appends one JSONL line per accepted event
//   reportFile(path, today)      -> { today, accepted, rejected, ...usageReport } from a JSONL file
//   serveLocal({ file, port })   -> http.Server on 127.0.0.1 that runs handleUsage + fileStore (local trial only)
// CLI (local files and loopback only, nothing is sent anywhere):
//   node scripts/usage-local.mjs report events.jsonl [YYYY-MM-DD]
//   node scripts/usage-local.mjs serve events.jsonl [port]
import { appendFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { acceptEvent, usageReport } from './usage-metrics.mjs';
import { handleUsage } from './usage-receiver.mjs';

export const fileStore = (path) => ({ append: (event) => appendFileSync(path, `${JSON.stringify(event)}\n`) });

export function reportFile(path, today) {
  const accepted = [];
  let rejected = 0;
  for (const line of readFileSync(path, 'utf8').split('\n').filter((l) => l.trim())) {
    let raw;
    try { raw = JSON.parse(line); } catch { rejected++; continue; }
    const r = acceptEvent(raw);
    if (r.ok) accepted.push(r.event); else rejected++;
  }
  return { today, accepted: accepted.length, rejected, ...usageReport(accepted, today) };
}

export function serveLocal({ file, port = 8787 }) {
  const store = fileStore(file);
  return createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const method = req.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks);
    const out = await handleUsage(new Request(`http://127.0.0.1${req.url}`, { method, body }), store);
    res.writeHead(out.status, { 'access-control-allow-origin': '*' });
    res.end(Buffer.from(await out.arrayBuffer()));
  }).listen(port, '127.0.0.1');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, file, arg] = process.argv.slice(2);
  if (cmd === 'report' && file) {
    console.log(JSON.stringify(reportFile(file, arg || new Date().toISOString().slice(0, 10)), null, 2));
  } else if (cmd === 'serve' && file) {
    const server = serveLocal({ file, port: Number(arg) || 8787 });
    server.on('listening', () => console.log(`usage receiver on http://127.0.0.1:${server.address().port} -> ${file}`));
  } else {
    console.error('usage: node scripts/usage-local.mjs report events.jsonl [YYYY-MM-DD]\n       node scripts/usage-local.mjs serve events.jsonl [port]');
    process.exit(2);
  }
}

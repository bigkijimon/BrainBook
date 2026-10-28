// Local services panel (owner 2026-10-28): the PortMenuBar Swift menu-bar app, ported. Runs the same
// `lsof -nP -iTCP -sTCP:LISTEN`, keeps the same column parsing and the same port -> label / URL table,
// and, like the original, shows only sockets the owner can open: an unknown port is never surfaced.
// Read-only: it lists listeners, it never starts or stops anything.

/** Add a new service here and only here. `url: null` = known and labelled, but monitor-only (not shown). */
export const LOCAL_SERVICES = [
  { port: 3000, label: 'Web App', url: 'http://127.0.0.1:3000/' },
  { port: 5678, label: 'n8n', url: 'http://127.0.0.1:5678/' },
  { port: 5679, label: 'n8n Task Runner', url: 'http://127.0.0.1:5679/healthz' },
  { port: 8080, label: 'Qwen / Local AI', url: null },
  { port: 8082, label: 'Embeddings', url: 'http://127.0.0.1:8082/' },
  { port: 8189, label: 'ComfyUI', url: 'http://127.0.0.1:8189/' },
  { port: 8191, label: 'SmartGallery', url: 'http://127.0.0.1:8191/' },
  { port: 8642, label: 'Hermes Gateway', url: 'http://127.0.0.1:8642/health' },
  { port: 8765, label: 'H&S Academy', url: 'http://127.0.0.1:8765/' },
  { port: 8770, label: 'Local Service', url: null },
  { port: 8792, label: 'Local Service', url: 'http://127.0.0.1:8792/health' },
  { port: 8799, label: 'Study Abroad DNA', url: 'http://127.0.0.1:8799/health' },
];

const BY_PORT = new Map(LOCAL_SERVICES.map((service) => [service.port, service]));

/** Parse `lsof -nP -iTCP -sTCP:LISTEN` output into one entry per (pid, endpoint), exactly as the Swift app did. */
export const parseLsof = (text) => {
  const seen = new Set();
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const columns = line.split(/[ \t]+/).filter(Boolean);
    if (columns.length < 9 || columns[0] === 'COMMAND') continue;
    const [command, pid] = columns;
    // lsof prints the endpoint followed by a separate "(LISTEN)" token; pick the endpoint explicitly.
    const endpoint = columns.at(-1) === '(LISTEN)' ? columns.at(-2) : columns.at(-1);
    const port = Number(String(endpoint).split(':').at(-1));
    if (!Number.isInteger(port)) continue;
    const key = `${pid}-${endpoint}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ command, pid: Number(pid), address: endpoint, port });
  }
  return out;
};

/** Keep only the owner-openable services, labelled, sorted by port then command (the Swift ordering). */
export const openableServices = (entries) => entries
  .map((entry) => ({ ...entry, label: BY_PORT.get(entry.port)?.label || entry.command, url: BY_PORT.get(entry.port)?.url || null }))
  .filter((entry) => entry.url)
  .sort((a, b) => a.port - b.port || a.command.localeCompare(b.command));

export const readLocalPorts = async ({ run }) => {
  const out = { source: 'lsof -nP -iTCP -sTCP:LISTEN', readAt: new Date().toISOString(), services: [], error: null };
  try { out.services = openableServices(parseLsof(await run())); }
  catch (error) { out.error = `lsof failed: ${String(error.message || error).slice(0, 120)}`; }
  return out;
};

// Read-only watch: counts router-brainbook planner processes and records the autopilot state each minute.
// usage: node scripts/watch-planners.mjs [minutes=18] [logfile=/tmp/bb-watch-planners.log]
import { execFile } from 'node:child_process';
import { appendFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const minutes = Number(process.argv[2]) || 18;
const log = process.argv[3] || '/tmp/bb-watch-planners.log';
await writeFile(log, '');
for (let i = 0; i < minutes; i += 1) {
  const { stdout } = await run('/bin/ps', ['-axo', 'pid,lstart,command'], { maxBuffer: 16 * 1024 * 1024 });
  const rows = stdout.split('\n').filter((line) => line.includes('router-brainbook'));
  let state = 'unreachable';
  try { const r = await fetch('http://127.0.0.1:4183/api/goals/autopilot'); state = JSON.stringify(await r.json()).slice(0, 1200); } catch { /* keep */ }
  await appendFile(log, `== ${new Date().toLocaleTimeString('en-GB')} planners=${rows.length}\n${rows.map((r) => r.slice(0, 70)).join('\n')}\n${state}\n`);
  await new Promise((resolve) => setTimeout(resolve, 60000));
}
await appendFile(log, `== finished ${new Date().toLocaleTimeString('en-GB')}\n`);

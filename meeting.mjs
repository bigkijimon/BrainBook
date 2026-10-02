// Agent meeting (owner 2026-09-30): "make a meeting box for the group-top agents so they can
// brainstorm; Bigkiji hosts, calls on each agent, and the real conversation is shown".
// Every line in a transcript is a real model reply from that agent's own runtime (Hermes profile
// or OpenCode). An agent whose runtime is down is recorded as absent with the measured reason; no
// line is ever written on an agent's behalf. Transcripts live in <appHome>/meetings/<id>.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runOpencode } from './capture.mjs';

// Group tops under Bigkiji. `profile` = Hermes profile id (null = default/Bigkiji); `opencode` = model.
export const ATTENDEES = {
  Bigkiji: { persona: 'Bigkiji', group: 'Host · chief orchestrator', profile: null },
  // Owner 2026-10-01 ("動画担当もbunnyかmino で"): the MoviePro seat runs on free Space Bunny, not Claude opus.
  Steve: { persona: 'Steven Spielberg', group: 'MoviePro (lesson videos)', opencode: 'opencode/space-bunny-free' },
  'Claude Code': { persona: 'Grace Hopper', group: 'Engineering QA', profile: 'claudecode' },
  // Owner 2026-10-01 ("space bunny にさせて"): the QA seat is the free Space Bunny model, not paid Claude Code.
  'Space Bunny': { persona: 'Grace Hopper', group: 'Engineering QA', opencode: 'opencode/space-bunny-free' },
  MiMo: { persona: 'Linus Torvalds', group: 'AppPro (app building)', opencode: 'opencode/mimo-v2.6-flash-free' },
  Sora: { persona: 'Seth Godin', group: 'BlogPro (blogs, social)', profile: 'sora', needs: 'http://127.0.0.1:8080/health' },
};
const MEMBERS = ['Steve', 'Space Bunny', 'MiMo', 'Sora'];

const runHermes = (profile, prompt, { hermesBin, env, timeout = 150000 }) => new Promise((resolve, reject) => {
  const args = [...(profile ? ['-p', profile] : []), 'chat', '-Q', '--source', 'meeting', '--max-turns', '1', '-t', '', '-q', prompt];
  const child = spawn(hermesBin, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
  let out = ''; let err = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { err += chunk; });
  const timer = setTimeout(() => { child.kill(); reject(new Error(`no answer in ${Math.round(timeout / 1000)} s`)); }, timeout);
  child.on('error', (error) => { clearTimeout(timer); reject(error); });
  child.on('close', (code) => {
    clearTimeout(timer);
    const text = out.replace(/\n*session_id:\s*\S+\s*$/, '').trim();
    if (code !== 0 || !text) return reject(new Error((err || text || `exit ${code}`).trim().split('\n').pop().slice(0, 200)));
    if (/^Provider said:|Connection error/i.test(text)) return reject(new Error(text.slice(0, 200)));
    resolve(text);
  });
});

const reachable = async (url) => {
  try { const response = await fetch(url, { signal: AbortSignal.timeout(2500) }); return response.ok; } catch { return false; }
};

// Result summary (owner 2026-10-01): "話し合いが終わったら、なんのテーマでどんな結果が出たかを
// まとめ表示して". Never invents text — it only extracts what Bigkiji's own closing line (see the
// prompt in run(), below) already says.
const THEME_MAX = 80;
const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

const extractTheme = (topic) => {
  const text = String(topic || '').trim();
  const kanban = text.match(/^Kanban\s+(t_\S+)\s*「([^」]+)」/);
  if (kanban) return `${kanban[1]} 「${clip(kanban[2], THEME_MAX)}」`;
  // A bare `.` after an abbreviation ("Mr.INV") is not a sentence end — require it be
  // followed by whitespace/end, same as a real stop, so it doesn't cut the theme short.
  const sentence = text.match(/^[^。！？\n]+?(?:[。！？]|\.(?=\s|$)|$)/);
  return clip((sentence ? sentence[0] : text).trim(), THEME_MAX);
};

// ✅ 決定 / 🛠️ next actions / 💡 ideas: the exact sections run()'s closing prompt asks Bigkiji
// for. Each is a top-level "- <emoji> ..." bullet (column 0); its own sub-bullets are indented,
// so a line starting a new top-level bullet always ends the previous section.
const SECTION_MARKERS = { '✅': 'decision', '🛠️': 'actions', '💡': 'ideas' };

const parseClosing = (text) => {
  const sections = {};
  for (const block of String(text).split(/\n(?=-\s*\S)/)) {
    const trimmed = block.trim();
    const marker = Object.keys(SECTION_MARKERS).find((emoji) => trimmed.startsWith(`- ${emoji}`) || trimmed.startsWith(`-${emoji}`));
    // Strip only the structural "- <emoji>" bullet marker; keep the model's own label word
    // ("決定：", "次の行動（今すぐ開始）"...) since that's its real content, not ours to invent.
    if (marker) sections[SECTION_MARKERS[marker]] = trimmed.slice(trimmed.indexOf(marker) + marker.length).replace(/^\s+/, '');
  }
  return sections;
};

export const summarize = (meeting) => {
  const theme = extractTheme(meeting.topic);
  if (meeting.status === 'failed') {
    return { theme, decision: meeting.error || meeting.topic, actions: '', ideas: '', raw: null, rawFallback: false, isError: true };
  }
  const lines = meeting.lines || [];
  const closing = lines[lines.length - 1];
  if (!closing || closing.kind !== 'say') {
    return { theme, decision: closing?.text || '', actions: '', ideas: '', raw: closing?.text || null, rawFallback: true, isError: false };
  }
  const sections = parseClosing(closing.text);
  if (!sections.decision && !sections.actions && !sections.ideas) {
    return { theme, decision: closing.text, actions: '', ideas: '', raw: closing.text, rawFallback: true, isError: false };
  }
  return { theme, decision: sections.decision || '', actions: sections.actions || '', ideas: sections.ideas || '', raw: closing.text, rawFallback: false, isError: false };
};

export const createMeetings = ({ appHome, hermesBin, env, cwd }) => {
  const dir = path.join(appHome, 'meetings');
  let running = null;
  const file = (id) => path.join(dir, `${id}.json`);
  const save = async (meeting) => { await fs.mkdir(dir, { recursive: true }); await fs.writeFile(file(meeting.id), JSON.stringify(meeting, null, 2)); };

  const speak = async (name, prompt) => {
    const who = ATTENDEES[name];
    if (who.needs && !(await reachable(who.needs))) throw new Error('its local model (Qwen) is not running right now');
    if (who.opencode) {
      const { stdout } = await runOpencode(['run', '--format', 'json', '--model', who.opencode, '--agent', 'plan', '--title', 'BrainBook meeting', prompt], { cwd, timeout: 120000 });
      const text = stdout.split('\n').map((line) => { try { return JSON.parse(line); } catch { return null; } })
        .filter((event) => event?.type === 'text').map((event) => event.part.text).join('').trim();
      if (!text) throw new Error('empty answer');
      return text;
    }
    return runHermes(who.profile, prompt, { hermesBin, env });
  };

  const transcriptText = (meeting) => meeting.lines.filter((line) => line.kind === 'say')
    .map((line) => `${ATTENDEES[line.who]?.persona || line.who} (${line.who}): ${line.text}`).join('\n\n');
  const frame = (name, meeting, task) => [
    `You are ${ATTENDEES[name].persona} ("${name}"), lead of ${ATTENDEES[name].group} in Yuma's AI company. You are in a live brainstorming meeting hosted by Bigkiji. Speak only as yourself.`,
    'Do not use tools, do not run commands, do not change any file. This is talk only.',
    'Answer in Japanese, plainly, in at most 4 short sentences or 4 bullets. Be concrete about what your group could do. It is fine to disagree.',
    `MEETING TOPIC: ${meeting.topic}`,
    meeting.lines.some((line) => line.kind === 'say') ? `CONVERSATION SO FAR:\n${transcriptText(meeting)}` : '',
    `YOUR TURN: ${task}`,
  ].filter(Boolean).join('\n\n');

  const turn = async (meeting, name, task) => {
    const started = Date.now();
    meeting.speaking = name; await save(meeting);
    try {
      const text = (await speak(name, frame(name, meeting, task))).slice(0, 2000);
      meeting.lines.push({ kind: 'say', who: name, text, at: Date.now() / 1000, seconds: Math.round((Date.now() - started) / 1000) });
    } catch (error) {
      meeting.lines.push({ kind: 'absent', who: name, text: String(error.message || error).slice(0, 200), at: Date.now() / 1000 });
    }
    meeting.speaking = null; await save(meeting);
  };

  const run = async (meeting) => {
    try {
      await turn(meeting, 'Bigkiji', `Open the meeting. State the topic in one sentence, say what a good outcome is, then call on ${meeting.members.map((name) => `${ATTENDEES[name].persona} (${ATTENDEES[name].group})`).join(', ')} by name and ask each one a pointed question.`);
      for (const name of meeting.members) await turn(meeting, name, 'Answer Bigkiji\'s question and give your best ideas from your group\'s point of view.');
      const present = meeting.members.filter((name) => meeting.lines.some((line) => line.kind === 'say' && line.who === name));
      if (present.length > 1) {
        for (const name of present) await turn(meeting, name, 'Round 2: react to one idea from another lead by name. Build on it or challenge it, and say what your group would add.');
      }
      await turn(meeting, 'Bigkiji', 'Close the meeting and DECIDE. The meeting exists so the company runs 24 hours without Yuma (owner 2026-10-01: "わたしがいなくても稼働するように"). Summarise in Japanese as: ✅ 決定 — the one adopted plan (resolve every disagreement yourself; say which idea won and why), 🛠️ next actions with the owner group for each, to start now, 💡 the ideas behind it (who proposed each). If someone was absent, say so. Leave a point to Yuma ONLY if it needs owner authority (money, publication or deployment, credentials, production data, company facts, irreversible acts); name that point exactly. Never end with "Yuma decides" for a design or engineering choice.');
      meeting.status = 'done';
    } catch (error) {
      meeting.status = 'failed'; meeting.error = String(error.message || error).slice(0, 300);
    } finally {
      meeting.endedAt = Date.now() / 1000; meeting.speaking = null; running = null;
      meeting.summary = summarize(meeting);
      await save(meeting);
    }
  };

  const start = async ({ topic, members }) => {
    const text = String(topic || '').trim().slice(0, 600);
    if (!text) throw Object.assign(new Error('Write a topic first'), { status: 400 });
    if (running) throw Object.assign(new Error('A meeting is already running'), { status: 409 });
    const chosen = (Array.isArray(members) && members.length ? members : MEMBERS).filter((name) => MEMBERS.includes(name));
    if (!chosen.length) throw Object.assign(new Error('Pick at least one agent'), { status: 400 });
    const meeting = { id: `m${Date.now().toString(36)}`, topic: text, members: chosen, status: 'running', startedAt: Date.now() / 1000, endedAt: null, speaking: null, lines: [] };
    await save(meeting);
    running = meeting.id;
    void run(meeting);
    return meeting;
  };
  const withSummary = (meeting) => (meeting.summary || meeting.status === 'running' ? meeting : { ...meeting, summary: summarize(meeting) });
  const list = async () => {
    let names = [];
    try { names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json')); } catch { return []; }
    const meetings = await Promise.all(names.map(async (name) => { try { return JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')); } catch { return null; } }));
    return meetings.filter(Boolean).map(withSummary).sort((a, b) => b.startedAt - a.startedAt).slice(0, 20);
  };
  const get = async (id) => {
    if (!/^m[0-9a-z]+$/.test(id)) return null;
    try { return withSummary(JSON.parse(await fs.readFile(file(id), 'utf8'))); } catch { return null; }
  };
  return { start, list, get, attendees: () => Object.fromEntries(Object.entries(ATTENDEES).map(([name, who]) => [name, { persona: who.persona, group: who.group, member: MEMBERS.includes(name) }])) };
};

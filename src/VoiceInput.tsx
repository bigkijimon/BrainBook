// Voice input UI (Hermes3D goal, step 3). VoiceRow is the mic for any instruction box;
// VoiceCommand is the Office's "tell Bigkiji" box. Speech only fills the text box — the owner
// reads it and presses Send, so a misheard word never becomes a Kanban card by itself.
import { useState } from 'react';
import { Mic, MicOff, Send } from 'lucide-react';
import { joinSpoken, useVoiceInput, type VoiceLang } from './voice';
import type { Task } from './types';

const LANG_KEY = 'brainbook.voice.lang';

export function VoiceRow({ onText }: { onText: (spoken: string, lang: VoiceLang) => void }) {
  const [lang, setLang] = useState<VoiceLang>(() => (localStorage.getItem(LANG_KEY) === 'en-US' ? 'en-US' : 'ja-JP'));
  const voice = useVoiceInput((spoken) => onText(spoken, lang), lang);
  const pickLang = (next: VoiceLang) => { localStorage.setItem(LANG_KEY, next); setLang(next); };
  const status = voice.message || voice.interim
    || (voice.listening ? `Listening… ${voice.onDevice ? 'on this Mac' : 'via the browser’s speech service'}. Press again to stop.` : 'Speak instead of typing. You check the text before it is sent.');
  return <div className={`voice-row ${voice.listening ? 'is-listening' : ''} ${voice.message ? 'is-error' : ''}`}>
    <button type="button" className="voice-mic" aria-pressed={voice.listening} aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'} onClick={voice.toggle}>
      {voice.listening ? <MicOff size={15} strokeWidth={1.8} /> : <Mic size={15} strokeWidth={1.8} />}
    </button>
    <div className="voice-lang" role="radiogroup" aria-label="Voice language">
      {(['ja-JP', 'en-US'] as const).map((code) => <button key={code} type="button" role="radio" aria-checked={lang === code} className={lang === code ? 'on' : ''} disabled={voice.listening} onClick={() => pickLang(code)}>{code === 'ja-JP' ? 'JA' : 'EN'}</button>)}
    </div>
    <small className={voice.interim ? 'is-interim' : ''} role="status" aria-live="polite">{status}</small>
  </div>;
}

// Kanban card titles stop at 120 characters; the cut is marked and the full words stay in the description.
const TITLE_MAX = 120;
const titleOf = (instruction: string) => {
  const line = instruction.split('\n')[0];
  return line.length > TITLE_MAX ? { title: `${line.slice(0, TITLE_MAX - 1)}…`, shortened: true } : { title: line, shortened: false };
};

// Office → Bigkiji by voice. It files the instruction the same way as a new task + Run: the server
// saves the task and queueTaskRun hands it to Hermes Kanban (team lane, Bigkiji, or the night GPU window).
// Run is Mac-only (server.mjs answers 403 to paired phones), so on a phone (`remote`) the box only
// saves the task and says so before Send; the server still auto-runs high-priority work tasks.
export function VoiceCommand({ tone, remote = false }: { tone: string; remote?: boolean }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' | 'error'; message?: string }>({ kind: 'idle' });
  const send = async () => {
    const instruction = text.trim();
    if (!instruction || state.kind === 'sending') return;
    setState({ kind: 'sending' });
    const { title, shortened } = titleOf(instruction);
    const note = shortened ? ' · title shortened, full text is in the card' : '';
    try {
      const created = await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        title,
        description: `${instruction}\n\n(Instruction from Yuma by voice in the BrainBook Office. Yuma read the transcript before sending.)`,
        status: 'inbox', source: 'personal',
      }) });
      const createdBody = await created.json() as { task?: Task; error?: string };
      if (!created.ok || !createdBody.task) throw new Error(createdBody.error || `HTTP ${created.status}`);
      let task = createdBody.task;
      if (!task.kanban && remote) {
        setText('');
        setState({ kind: 'sent', message: `Saved to Tasks${note}. Run it on the Mac to hand it to Bigkiji.` });
        return;
      }
      if (!task.kanban) {
        const run = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/run`, { method: 'POST' });
        const runBody = await run.json() as { task?: Task; error?: string };
        if (!run.ok || !runBody.task) {
          setText('');
          setState({ kind: 'error', message: `Saved as a task, but not handed to Hermes: ${runBody.error || `HTTP ${run.status}`}. Press Run on it in Tasks.` });
          return;
        }
        task = runBody.task;
      }
      setText('');
      window.dispatchEvent(new Event('brainbook:office-refresh')); // OfficeView OFFICE_REFRESH: show the new card in its room now
      setState({ kind: 'sent', message: `Sent · card ${task.kanban?.id} (${task.kanban?.status}${task.kanban?.assignee === 'team' ? `, team lane ${task.kanban?.team || ''}`.trimEnd() : task.kanban?.gpu ? ', night GPU window' : ', Bigkiji'})${note}` });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };
  return <div className="direct-box voice-command" style={{ '--member': tone } as React.CSSProperties}>
    <span className="direct-label">Tell Bigkiji · voice or text</span>
    <VoiceRow onText={(spoken, lang) => { setText((before) => joinSpoken(before, spoken, lang)); if (state.kind !== 'sending') setState({ kind: 'idle' }); }} />
    <textarea value={text} rows={2} maxLength={4000} placeholder="Press the mic and say what the company should do." aria-label="Instruction for Bigkiji"
      onChange={(event) => { setText(event.target.value); if (state.kind !== 'sending') setState({ kind: 'idle' }); }}
      onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }} />
    <div className="direct-foot">
      <small className={`direct-state is-${state.kind}`} role="status">{state.message || (state.kind === 'sending' ? 'Sending…' : remote ? 'On the phone this is saved to Tasks. Run it on the Mac.' : 'Bigkiji routes it to a team as a Kanban card. ⌘↵ sends.')}</small>
      <button type="button" className="direct-send" disabled={!text.trim() || state.kind === 'sending'} onClick={() => void send()}><Send size={14} strokeWidth={1.8} />Send</button>
    </div>
  </div>;
}

// Voice input (Hermes3D goal, step 3): speech → text with the browser's SpeechRecognition.
// The words only land in a text box; the owner reads, fixes and presses Send. Nothing is sent by
// voice alone. On-device recognition is used when the engine offers it (Chrome `processLocally`);
// otherwise the engine's own service does the recognition, and the button says so.
import { useCallback, useEffect, useRef, useState } from 'react';

type Alternative = { transcript: string };
type Result = { isFinal: boolean; 0: Alternative };
type ResultEvent = { resultIndex: number; results: ArrayLike<Result> };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; processLocally?: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: ResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type Engine = { new(): Recognition; available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string> };

export type VoiceLang = 'ja-JP' | 'en-US';

const engine = (): Engine | null => {
  const scope = window as unknown as { SpeechRecognition?: Engine; webkitSpeechRecognition?: Engine };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
};

// The macOS app needs microphone + speech usage strings in Info.plist; without them macOS kills the
// app on first use. Builds that have them set window.brainbookVoice (macos/main.swift).
const blocker = (): string | null => {
  const native = document.documentElement.classList.contains('native-app');
  if (native && !(window as unknown as { brainbookVoice?: boolean }).brainbookVoice) return 'This BrainBook app build has no microphone permission yet. Rebuild it (macos/build-app.sh), or press Fn twice for macOS dictation in the box.';
  if (!engine()) return 'This browser has no speech recognition. Use Safari or Chrome, or press Fn twice for macOS dictation in the box.';
  return null;
};

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone or speech recognition is not allowed. Allow it in System Settings › Privacy & Security, then try again.',
  'service-not-allowed': 'Speech recognition is not allowed here. Allow it in System Settings › Privacy & Security, then try again.',
  'audio-capture': 'No microphone found.',
  'no-speech': 'No speech heard. Press the mic and speak again.',
  network: 'The speech service could not be reached. Type the instruction instead.',
  'language-not-supported': 'This language is not available for speech recognition here.',
};

// Japanese runs together; English needs a space between spoken chunks.
export const joinSpoken = (before: string, spoken: string, lang: VoiceLang) => {
  if (!before.trim()) return spoken;
  if (/\s$/.test(before)) return `${before}${spoken}`;
  return lang === 'ja-JP' ? `${before}${spoken}` : `${before} ${spoken}`;
};

export function useVoiceInput(onText: (text: string) => void, lang: VoiceLang) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [message, setMessage] = useState('');
  const [onDevice, setOnDevice] = useState<boolean | null>(null);
  const current = useRef<Recognition | null>(null);
  // A start that is still asking the engine for on-device support. Stop or unmount clears it, and the
  // start gives up when it resumes, so a double-tap or a closed box never leaves the mic capturing.
  const pending = useRef<symbol | null>(null);
  const deliver = useRef(onText);
  deliver.current = onText;
  useEffect(() => () => { pending.current = null; current.current?.abort(); }, []);

  const stop = useCallback(() => { pending.current = null; current.current?.stop(); }, []);
  const start = useCallback(async () => {
    if (current.current || pending.current) return;
    const reason = blocker();
    const Speech = engine();
    if (reason || !Speech) { setMessage(reason || ''); return; }
    const attempt = Symbol('voice-start');
    pending.current = attempt;
    const recognition = new Speech();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    let local = false;
    if ('processLocally' in recognition && typeof Speech.available === 'function') {
      try { local = (await Speech.available({ langs: [lang], processLocally: true })) === 'available'; } catch { /* use the default engine */ }
      if (local) recognition.processLocally = true;
    }
    if (pending.current !== attempt) return; // stopped or unmounted while the engine answered
    pending.current = null;
    recognition.onresult = (event) => {
      let partial = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const words = result[0].transcript.trim();
        if (result.isFinal) { if (words) deliver.current(words); } else partial += result[0].transcript;
      }
      setInterim(partial);
    };
    recognition.onerror = (event) => { if (event.error !== 'aborted') setMessage(ERRORS[event.error] || `Voice input stopped (${event.error}).`); };
    recognition.onend = () => { current.current = null; setListening(false); setInterim(''); };
    current.current = recognition;
    setMessage('');
    setOnDevice(local);
    try {
      recognition.start();
      setListening(true);
    } catch (error) {
      current.current = null;
      setMessage(`Voice input could not start: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [lang]);

  return { listening, interim, message, onDevice, start, stop, toggle: () => (current.current || pending.current ? stop() : void start()) };
}

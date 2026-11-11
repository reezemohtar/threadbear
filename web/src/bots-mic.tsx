// The mic in a bot's message box: say it, and the words are added to what's
// typed. It's drawn only where the browser can turn speech into text on the
// device itself (canDictateHere in bots.ts), and asks for exactly that, so no
// audio is sent anywhere. Elsewhere there's no button at all.
import { useEffect, useRef, useState } from 'react';
import { canDictateHere, type MicState } from './bots';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

const recognitionOf = () => (window as unknown as { SpeechRecognition?: new () => Recognition }).SpeechRecognition;

// `onState`: told each time it starts listening, is asked to stop, and has
// stopped, so the message box can hold Send until the last words are in
// (micHolds in bots.ts).
export function Mic({ onText, onState }: { onText: (text: string) => void; onState?: (state: MicState) => void }) {
  const [can, setCan] = useState(false);
  const [state, setState] = useState<MicState>('idle');
  const listening = state !== 'idle';
  const tell = (next: MicState) => {
    setState(next);
    onState?.(next);
  };
  const [failed, setFailed] = useState('');
  const live = useRef<Recognition | null>(null);
  const lang = navigator.language || 'en-US';

  useEffect(() => {
    let current = true;
    void canDictateHere(recognitionOf(), lang).then((yes) => current && setCan(yes));
    return () => {
      current = false;
      live.current?.abort();
      onState?.('idle');
    };
  }, [lang]);

  if (!can) return null;

  const toggle = () => {
    if (live.current) {
      // Its last words come before `end`, which is when Send is let go.
      tell('stopping');
      live.current.stop();
      return;
    }
    const Recognition = recognitionOf();
    if (!Recognition) return;
    const r = new Recognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;
    r.processLocally = true;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const said = e.results[i]![0]?.transcript.trim();
        if (e.results[i]!.isFinal && said) onText(said);
      }
    };
    r.onerror = (e) => setFailed(e.error === 'not-allowed' ? 'The microphone isn’t allowed for this site' : 'Dictation stopped');
    r.onend = () => {
      live.current = null;
      tell('idle');
    };
    live.current = r;
    setFailed('');
    tell('listening');
    try {
      r.start();
    } catch {
      live.current = null;
      tell('idle');
      setFailed('Dictation couldn’t start');
    }
  };

  const words = failed || (state === 'stopping' ? 'Finishing' : listening ? 'Stop dictating to send' : 'Dictate (stays on this device)');
  return (
    <button type="button" className={`bots-mic ${listening ? 'on' : ''}`} aria-pressed={listening} aria-label={words} title={words} disabled={state === 'stopping'} onClick={toggle}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="1.8" width="4" height="7.5" rx="2" />
        <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.2" />
      </svg>
    </button>
  );
}

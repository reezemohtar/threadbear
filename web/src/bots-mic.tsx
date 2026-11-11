// The mic in a bot's message box: say it, and the words are added to what's
// typed. It's drawn only where the browser can turn speech into text on the
// device itself (canDictateHere in bots.ts), and asks for exactly that, so no
// audio is sent anywhere. Elsewhere there's no button at all.
import { useEffect, useRef, useState } from 'react';
import { canDictateHere } from './bots';

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

export function Mic({ onText }: { onText: (text: string) => void }) {
  const [can, setCan] = useState(false);
  const [listening, setListening] = useState(false);
  const [failed, setFailed] = useState('');
  const live = useRef<Recognition | null>(null);
  const lang = navigator.language || 'en-US';

  useEffect(() => {
    let current = true;
    void canDictateHere(recognitionOf(), lang).then((yes) => current && setCan(yes));
    return () => {
      current = false;
      live.current?.abort();
    };
  }, [lang]);

  if (!can) return null;

  const toggle = () => {
    if (live.current) {
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
      setListening(false);
    };
    live.current = r;
    setFailed('');
    setListening(true);
    try {
      r.start();
    } catch {
      live.current = null;
      setListening(false);
      setFailed('Dictation couldn’t start');
    }
  };

  const words = failed || (listening ? 'Stop dictating' : 'Dictate (stays on this device)');
  return (
    <button type="button" className={`bots-mic ${listening ? 'on' : ''}`} aria-pressed={listening} aria-label={words} title={words} onClick={toggle}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="1.8" width="4" height="7.5" rx="2" />
        <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.2" />
      </svg>
    </button>
  );
}

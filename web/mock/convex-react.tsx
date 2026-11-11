// Stands in for `convex/react` when the site runs from web/mock (see
// vite.config.ts beside this): every query answers from data.ts, and every
// mutation is logged and does nothing. Made-up data only, so a page can be
// looked at and photographed with no backend, no sign-in and nothing real
// on screen. Never part of a build.
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { answer, archive, hide } from './data';

// Signed in, with the Bots page on and the look the address asks for
// (?theme=dark), before the app reads any of them.
localStorage.setItem('threadbear.token', 'mock');
localStorage.setItem('threadbear.experiments.bots', '1');
const theme = new URLSearchParams(location.search).get('theme');
if (theme === 'light' || theme === 'dark') localStorage.setItem('threadbear.theme', theme);

// The same answer object each time for the same question, as a real client
// gives: effects that wait on an answer would otherwise run every render.
const answers = new Map<string, unknown>();
function ask(name: string, args: unknown): unknown {
  const key = `${name} ${JSON.stringify(args)}`;
  if (!answers.has(key)) answers.set(key, answer(name, (args ?? {}) as Record<string, unknown>));
  return answers.get(key);
}

export class ConvexReactClient {
  constructor(_url?: string) {}
}

export function ConvexProvider({ children }: { client: unknown; children: ReactNode }) {
  return <>{children}</>;
}

// The data can change under the page (__mock.archive): every answer is asked
// for again, and every hook hears.
let version = 0;
const hearers = new Set<() => void>();
const hear = (l: () => void) => {
  hearers.add(l);
  return () => void hearers.delete(l);
};
function poke() {
  answers.clear();
  version++;
  hearers.forEach((l) => l());
}

export function useQuery(query: FunctionReference<'query'>, args?: unknown): unknown {
  useSyncExternalStore(hear, () => version);
  return args === 'skip' ? undefined : ask(getFunctionName(query), args);
}

export function useQueries(asks: Record<string, { query: FunctionReference<'query'>; args: unknown }>): Record<string, unknown> {
  const at = useSyncExternalStore(hear, () => version);
  return useMemo(() => {
    if (FAILWATCH) {
      for (const key of held) if (!(key in asks)) healed.add(key);
      for (const key of Object.keys(asks)) held.add(key);
    }
    return Object.fromEntries(
      Object.entries(asks).map(([key, q]) => {
        const name = getFunctionName(q.query);
        if (FAILWATCH && name === 'phone:project' && !healed.has(key)) return [key, new Error('mock: this watch failed')];
        if (name === 'phone:threadRow') {
          // ?rowerror=1: the lookup fails for some other reason. No such thread: the backend's own not-found.
          if (params.has('rowerror')) return [key, new Error('mock: Server Error')];
          const row = ask(name, q.args);
          return [key, row ?? Object.assign(new Error('no such thread'), { data: { kind: 'notFound', message: 'no such thread' } })];
        }
        return [key, ask(name, q.args)];
      }),
    );
  }, [asks, at]);
}

// For a stress run: ?slow=300 makes each one-off read take that long,
// ?fail=30 makes that percentage of them fail the first time they're asked.
// What was asked is counted on window.__mock, for a script to read.
// ?failwatch=1 makes a watched project (useQueries) answer with an error
// until the page lets go of it and asks again, as its Try again does.
const params = new URLSearchParams(location.search);
// What was asked and sent, for a script to read (window.__mock), and `say`,
// which a script uses to speak to the pretend mic below.
const counts = { reads: 0, atOnce: 0, mostAtOnce: 0, failed: 0, mutations: [] as string[], calls: [] as { name: string; args: unknown }[], say: (_text: string) => false as boolean };
(window as unknown as { __mock: typeof counts }).__mock = counts;
const SLOW = Number(params.get('slow')) || 0;
const FAIL = Number(params.get('fail')) || 0;
const FAILWATCH = params.has('failwatch');
// ?mic=1 pretends the browser can dictate on the device, so the mic button
// can be looked at where the real browser (a headless one, say) can't.
if (params.has('mic')) {
  // A recognition that behaves as a real one does: nothing is heard until a
  // script says something (__mock.say), and stop() ends it a moment later,
  // after any last words, with `end`.
  type Heard = { results: ({ transcript: string }[] & { isFinal: boolean })[]; resultIndex: number };
  let live: { onresult: ((e: Heard) => void) | null; onend: (() => void) | null } | null = null;
  counts.say = (text: string) => {
    if (!live?.onresult) return false;
    live.onresult({ results: [Object.assign([{ transcript: text }], { isFinal: true })], resultIndex: 0 });
    return true;
  };
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = class {
    onresult: ((e: Heard) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    static async available() {
      return 'available';
    }
    start() {
      live = this;
    }
    stop() {
      setTimeout(() => this.finish(), 150);
    }
    abort() {
      this.finish();
    }
    finish() {
      if (live === this) live = null;
      this.onend?.();
    }
  };
}
// Read by the dev server (vite.config.ts), and cleared by any load without the flag.
document.cookie = `mockfailpage=${params.has('failpage') ? 1 : 0}; path=/`;
// Watched keys that have been let go of at least once since first asked.
const held = new Set<string>();
const healed = new Set<string>();
const tried = new Set<string>();
const unlucky = (key: string) => {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 100 < FAIL;
};

const mutations = new Map<string, (args: unknown) => Promise<string>>();
export function useMutation(mutation: FunctionReference<'mutation'>) {
  const name = getFunctionName(mutation);
  if (!mutations.has(name)) {
    mutations.set(name, async (args) => {
      console.log('mock mutation', name, args);
      counts.mutations.push(name);
      counts.calls.push({ name, args });
      if (SLOW) await new Promise((r) => setTimeout(r, SLOW));
      return 'mock-command';
    });
  }
  return mutations.get(name)!;
}

// One client, as the real one is: hooks key their work on it.
const client = {
  query: async (query: FunctionReference<'query'>, args: unknown) => {
    const name = getFunctionName(query);
    const key = `${name} ${JSON.stringify(args)}`;
    counts.reads++;
    counts.mostAtOnce = Math.max(counts.mostAtOnce, ++counts.atOnce);
    try {
      if (SLOW) await new Promise((r) => setTimeout(r, SLOW));
      if (FAIL && !tried.has(key) && unlucky(key)) {
        tried.add(key);
        counts.failed++;
        throw new Error('mock: this read failed');
      }
      return ask(name, args);
    } finally {
      counts.atOnce--;
    }
  },
};
export function useConvex() {
  return client;
}

// For a script: archive a thread as another device would.
(counts as unknown as { archive: (threadId: string) => void }).archive = (threadId) => {
  archive(threadId);
  poke();
};

// For a script: drop a thread out of the lists while it's still open.
(counts as unknown as { hide: (threadId: string) => void }).hide = (threadId) => {
  hide(threadId);
  poke();
};

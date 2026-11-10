// Stands in for `convex/react` when the site runs from web/mock (see
// vite.config.ts beside this): every query answers from data.ts, and every
// mutation is logged and does nothing. Made-up data only, so a page can be
// looked at and photographed with no backend, no sign-in and nothing real
// on screen. Never part of a build.
import { useMemo, type ReactNode } from 'react';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { answer } from './data';

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

export function useQuery(query: FunctionReference<'query'>, args?: unknown): unknown {
  return args === 'skip' ? undefined : ask(getFunctionName(query), args);
}

export function useQueries(asks: Record<string, { query: FunctionReference<'query'>; args: unknown }>): Record<string, unknown> {
  return useMemo(() => Object.fromEntries(Object.entries(asks).map(([key, q]) => [key, ask(getFunctionName(q.query), q.args)])), [asks]);
}

// For a stress run: ?slow=300 makes each one-off read take that long,
// ?fail=30 makes that percentage of them fail the first time they're asked.
// What was asked is counted on window.__mock, for a script to read.
const params = new URLSearchParams(location.search);
const SLOW = Number(params.get('slow')) || 0;
const FAIL = Number(params.get('fail')) || 0;
const counts = { reads: 0, atOnce: 0, mostAtOnce: 0, failed: 0, mutations: [] as string[] };
(window as unknown as { __mock: typeof counts }).__mock = counts;
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

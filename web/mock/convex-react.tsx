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

const mutations = new Map<string, (args: unknown) => Promise<string>>();
export function useMutation(mutation: FunctionReference<'mutation'>) {
  const name = getFunctionName(mutation);
  if (!mutations.has(name)) {
    mutations.set(name, async (args) => {
      console.log('mock mutation', name, args);
      return 'mock-command';
    });
  }
  return mutations.get(name)!;
}

export function useConvex() {
  return { query: async (query: FunctionReference<'query'>, args: unknown) => ask(getFunctionName(query), args) };
}

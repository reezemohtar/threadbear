// Reads every project's folders and goals for the Bots page, a few at a
// time: which projects are bots is in their folders, and the list
// (phone:projects) leaves those out. Each is read once, not watched, so a
// big account isn't holding a live query per project; the page then watches
// only the ones that turned out to be bots (bots-page.tsx). What's been read
// stays while more is read, so a new project never takes away the ones on
// screen. No Convex or React here, so it can be tested alone:
// node --test web/src/bots-loader.test.ts
export type Loader<P> = {
  /** The projects there are now. Ones not read yet are queued; ones no longer listed are forgotten. */
  want(keys: string[]): void;
  /** A fresher copy from somewhere else (a live query). */
  put(key: string, value: P | null): void;
  /** What's been read of the wanted ones, in the order asked for. Null: gone. */
  known(): Map<string, P | null>;
  /** Every wanted one has been read (or failed, and waits for the next want). */
  done(): boolean;
  /** Nothing read lands between stop and start (the page has gone, or is being set up again). */
  stop(): void;
  start(): void;
};

export function projectLoader<P>(read: (key: string) => Promise<P | null>, changed: () => void, atOnce = 4): Loader<P> {
  let wanted: string[] = [];
  const values = new Map<string, P | null>();
  const failed = new Set<string>();
  const reading = new Set<string>();
  let stopped = false;

  const pump = () => {
    for (const key of wanted) {
      if (reading.size >= atOnce) return;
      if (values.has(key) || failed.has(key) || reading.has(key)) continue;
      reading.add(key);
      read(key).then(
        (value) => {
          reading.delete(key);
          // Dropped while stopped: start() reads it again.
          if (stopped) return;
          values.set(key, value);
          changed();
          pump();
        },
        () => {
          reading.delete(key);
          if (stopped) return;
          failed.add(key);
          changed();
          pump();
        },
      );
    }
  };

  return {
    want(keys) {
      wanted = keys;
      const now = new Set(keys);
      for (const key of values.keys()) if (!now.has(key)) values.delete(key);
      // A read that failed gets another go each time the list changes.
      failed.clear();
      pump();
    },
    put(key, value) {
      if (stopped || values.get(key) === value) return;
      values.set(key, value);
      changed();
    },
    known() {
      const out = new Map<string, P | null>();
      for (const key of wanted) if (values.has(key)) out.set(key, values.get(key)!);
      return out;
    },
    done() {
      return wanted.every((key) => values.has(key) || failed.has(key));
    },
    stop() {
      stopped = true;
    },
    start() {
      if (!stopped) return;
      stopped = false;
      pump();
    },
  };
}

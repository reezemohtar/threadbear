// Reads every project's folders and goals for the Bots page, a few at a
// time: which projects are bots is in their folders, and the list
// (phone:projects) leaves those out. Each is read once, not watched, so a
// big account isn't holding a live query per project; the page then watches
// only the ones that turned out to be bots (bots-page.tsx). What's been read
// stays while more is read, so a new project never takes away the ones on
// screen. A read that failed is not an answer: it's listed as failed until
// it's tried again, and never counts as "that project isn't a bot". No
// Convex or React here, so it can be tested alone:
// node --test web/src/bots-loader.test.ts
export type Loader<P> = {
  /** The projects there are now. Ones not read yet are queued; ones no longer listed are forgotten. */
  want(keys: string[]): void;
  /** A fresher copy from somewhere else (a live query), for a project still listed. */
  put(key: string, value: P | null): void;
  /** What's been read of the wanted ones, in the order asked for. Null: gone. */
  known(): Map<string, P | null>;
  /** Every wanted one has been read. Not while any has failed. */
  done(): boolean;
  /** The wanted ones whose read failed, waiting for retry (or the next want). */
  failed(): string[];
  retry(): void;
  /** Nothing read lands between stop and start (the page has gone, or is being set up again). */
  stop(): void;
  start(): void;
};

export function projectLoader<P>(read: (key: string) => Promise<P | null>, changed: () => void, atOnce = 4, same: (a: P | null, b: P | null) => boolean = (a, b) => a === b): Loader<P> {
  let wanted: string[] = [];
  const values = new Map<string, P | null>();
  const failed = new Set<string>();
  // Each read in flight and which one it is: an answer lands only while it's
  // still the read that key is waiting on, so one for a project since removed
  // (or removed and listed again) is dropped.
  const reading = new Map<string, number>();
  let reads = 0;
  let stopped = false;

  const land = (key: string, mine: number, apply: () => void) => {
    if (reading.get(key) !== mine) return;
    reading.delete(key);
    apply();
    changed();
    pump();
  };

  const pump = () => {
    if (stopped) return;
    for (const key of wanted) {
      if (reading.size >= atOnce) return;
      if (values.has(key) || failed.has(key) || reading.has(key)) continue;
      const mine = ++reads;
      reading.set(key, mine);
      read(key).then(
        (value) => land(key, mine, () => values.set(key, value)),
        () => land(key, mine, () => failed.add(key)),
      );
    }
  };

  return {
    want(keys) {
      wanted = keys;
      const now = new Set(keys);
      let fewer = false;
      for (const key of [...values.keys()]) {
        if (now.has(key)) continue;
        values.delete(key);
        fewer = true;
      }
      for (const key of [...reading.keys()]) if (!now.has(key)) reading.delete(key);
      // A read that failed gets another go each time the list changes.
      if (failed.size) fewer = true;
      failed.clear();
      if (fewer) changed();
      pump();
    },
    put(key, value) {
      if (stopped || !wanted.includes(key)) return;
      if (values.has(key) && same(values.get(key)!, value)) return;
      values.set(key, value);
      failed.delete(key);
      // A read still out for it would bring an older copy.
      reading.delete(key);
      changed();
      pump();
    },
    known() {
      const out = new Map<string, P | null>();
      for (const key of wanted) if (values.has(key)) out.set(key, values.get(key)!);
      return out;
    },
    done() {
      return wanted.every((key) => values.has(key));
    },
    failed() {
      return wanted.filter((key) => failed.has(key));
    },
    retry() {
      if (!failed.size) return;
      failed.clear();
      changed();
      pump();
    },
    stop() {
      stopped = true;
      // Dropped: start() reads them again.
      reading.clear();
    },
    start() {
      if (!stopped) return;
      stopped = false;
      pump();
    },
  };
}

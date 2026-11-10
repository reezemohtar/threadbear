// node --test web/src/bots-loader.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectLoader } from './bots-loader.ts';

// A backend whose answers are let go by hand, to play out slow and late ones.
function slow() {
  // Oldest first for a key asked more than once.
  const waiting: { key: string; resolve: (v: string | null) => void; reject: (e: Error) => void }[] = [];
  const asked: string[] = [];
  let most = 0;
  const read = (key: string) =>
    new Promise<string | null>((resolve, reject) => {
      asked.push(key);
      waiting.push({ key, resolve, reject });
      most = Math.max(most, waiting.length);
    });
  const outNow = () => waiting.length;
  const settle = async (key: string, value: string | null | Error) => {
    const at = waiting.findIndex((x) => x.key === key);
    const w = waiting.splice(at, 1)[0]!;
    if (value instanceof Error) w.reject(value);
    else w.resolve(value);
    await new Promise((r) => setImmediate(r));
  };
  return { read, settle, asked, waiting, most: () => most, outNow };
}

test('projects are read a few at a time, each once', async () => {
  const b = slow();
  let changes = 0;
  const loader = projectLoader(b.read, () => changes++, 2);
  loader.want(['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(b.asked, ['a', 'b'], 'no more than two at once');
  assert.equal(loader.done(), false);
  await b.settle('a', 'A');
  assert.deepEqual(b.asked, ['a', 'b', 'c']);
  await b.settle('b', 'B');
  await b.settle('c', 'C');
  await b.settle('d', 'D');
  assert.equal(loader.done(), false);
  await b.settle('e', 'E');
  assert.equal(loader.done(), true);
  assert.equal(b.most(), 2);
  assert.deepEqual([...loader.known()], [['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D'], ['e', 'E']]);
  assert.equal(changes, 6, 'the list arriving, then five answers');
  loader.want(['a', 'b', 'c', 'd', 'e']);
  assert.equal(b.asked.length, 5, 'nothing is read twice');
});

test('a new project that is slow to answer takes nothing away from what is on screen', async () => {
  const b = slow();
  const loader = projectLoader(b.read, () => {}, 4);
  loader.want(['juno', 'wren']);
  await b.settle('juno', 'Juno');
  await b.settle('wren', 'Wren');
  assert.equal(loader.done(), true);
  // Someone makes a project while a draft is being typed to Juno.
  loader.want(['juno', 'wren', 'new']);
  assert.equal(loader.done(), false);
  assert.deepEqual([...loader.known().keys()], ['juno', 'wren'], 'the bots already read are still there');
  await b.settle('new', 'New');
  assert.deepEqual([...loader.known().keys()], ['juno', 'wren', 'new']);
  assert.equal(loader.done(), true);
});

test('a project that has gone is forgotten, and one that failed is tried again when the list next changes', async () => {
  const b = slow();
  const loader = projectLoader(b.read, () => {}, 4);
  loader.want(['a', 'b']);
  await b.settle('a', 'A');
  await b.settle('b', new Error('offline'));
  assert.equal(loader.done(), false, 'a failed read is not an answer');
  assert.deepEqual(loader.failed(), ['b']);
  assert.deepEqual([...loader.known().keys()], ['a']);
  loader.want(['b']);
  assert.deepEqual(loader.failed(), []);
  assert.deepEqual(b.asked, ['a', 'b', 'b']);
  await b.settle('b', null);
  assert.deepEqual([...loader.known()], [['b', null]], 'a is no longer listed; b has gone');
});

test('a fresher copy from a live query replaces what was read, and nothing lands after stop', async () => {
  const b = slow();
  let changes = 0;
  const loader = projectLoader(b.read, () => changes++, 4);
  loader.want(['a', 'b']);
  await b.settle('a', 'A');
  loader.put('a', 'A2');
  loader.put('a', 'A2');
  assert.equal(loader.known().get('a'), 'A2');
  assert.equal(changes, 3, 'the list, the answer, the fresher copy; the same copy again is not a change');
  loader.stop();
  await b.settle('b', 'B');
  assert.equal(loader.known().has('b'), false);
  assert.equal(changes, 3);
  // Set up again (React runs an effect, its cleanup, then the effect again while developing).
  loader.start();
  assert.deepEqual(b.asked, ['a', 'b', 'b'], 'what was dropped is read again');
  await b.settle('b', 'B');
  assert.equal(loader.known().get('b'), 'B');
  assert.equal(loader.done(), true);
});

test('a failed read never says the project is absent, and Retry reads it again', async () => {
  const b = slow();
  let changes = 0;
  const loader = projectLoader(b.read, () => changes++, 4);
  loader.want(['juno']);
  await b.settle('juno', new Error('offline'));
  // The only project failed: this must not read as "no bots" or "that bot has gone".
  assert.equal(loader.done(), false);
  assert.deepEqual(loader.failed(), ['juno']);
  assert.equal(loader.known().size, 0);
  assert.deepEqual(b.asked, ['juno'], 'not tried again by itself');
  const before = changes;
  loader.retry();
  assert.equal(changes, before + 1, 'the page hears that it is reading again');
  assert.deepEqual(loader.failed(), []);
  assert.deepEqual(b.asked, ['juno', 'juno']);
  await b.settle('juno', 'Juno');
  assert.equal(loader.done(), true);
  assert.equal(loader.known().get('juno'), 'Juno');
  loader.retry();
  assert.deepEqual(b.asked, ['juno', 'juno'], 'nothing to retry');
});

test("an answer for a project since removed is dropped, and listing it again reads it afresh", async () => {
  const b = slow();
  const loader = projectLoader(b.read, () => {}, 4);
  loader.want(['a', 'gone']);
  await b.settle('a', 'A');
  // Removed while its read is still out.
  loader.want(['a']);
  await b.settle('gone', 'old copy');
  assert.equal(loader.known().has('gone'), false);
  // Listed again: the old answer must not be what's shown.
  loader.want(['a', 'gone']);
  assert.equal(loader.known().has('gone'), false, 'nothing cached from the dropped answer');
  assert.deepEqual(b.asked, ['a', 'gone', 'gone'], 'read again');
  await b.settle('gone', 'new copy');
  assert.equal(loader.known().get('gone'), 'new copy');
});

test('removed and listed again while the first read is still out: only the newer answer lands', async () => {
  const b = slow();
  const loader = projectLoader(b.read, () => {}, 4);
  loader.want(['x']);
  loader.want([]);
  loader.want(['x']);
  await b.settle('x', 'first, stale');
  assert.equal(loader.known().has('x'), false, 'the first read is no longer the one waited on');
  assert.deepEqual(b.asked, ['x', 'x']);
  await b.settle('x', 'second');
  assert.equal(loader.known().get('x'), 'second');
});

test('taking a project away tells the page, and a copy for one not listed is refused', async () => {
  const b = slow();
  let changes = 0;
  const loader = projectLoader(b.read, () => changes++, 4);
  loader.want(['a', 'b']);
  await b.settle('a', 'A');
  await b.settle('b', 'B');
  const before = changes;
  loader.want(['a']);
  assert.equal(changes, before + 1, 'the screen is told b has gone');
  loader.want(['a']);
  assert.equal(changes, before + 1, 'the same list again is no change');
  loader.put('b', 'B again');
  assert.equal(loader.known().has('b'), false);
  loader.want(['a', 'b']);
  assert.deepEqual(b.asked, ['a', 'b', 'b']);
});

test('a copy with the same content is not a change, with the page saying what same means', async () => {
  const b = slow();
  let changes = 0;
  const loader = projectLoader<{ title: string }>(async () => ({ title: 'A' }), () => changes++, 4, (x, y) => JSON.stringify(x) === JSON.stringify(y));
  loader.want(['a']);
  await new Promise((r) => setImmediate(r));
  assert.equal(changes, 2);
  loader.put('a', { title: 'A' });
  assert.equal(changes, 2);
  loader.put('a', { title: 'A2' });
  assert.equal(changes, 3);
  void b;
});

test('taking away the last project still being read tells the page it is done', async () => {
  const b = slow();
  let changes = 0;
  const loader = projectLoader(b.read, () => changes++, 4);
  loader.want(['a', 'slow']);
  await b.settle('a', 'A');
  assert.equal(loader.done(), false);
  const before = changes;
  // 'slow' has no value yet, only a read out: removing it used to say nothing.
  loader.want(['a']);
  assert.equal(loader.done(), true);
  assert.equal(changes, before + 1, 'the page hears, so Loading does not linger');
  loader.want(['a']);
  assert.equal(changes, before + 1, 'the same list again is no change');
  // Adding one is a change too: done() goes back to false.
  loader.want(['a', 'new']);
  assert.equal(changes, before + 2);
});

test('never more requests out than the cap, even when reads are dropped and asked again', async () => {
  const b = slow();
  const loader = projectLoader(b.read, () => {}, 1);
  loader.want(['x']);
  loader.want([]);
  loader.want(['x']);
  assert.equal(b.outNow(), 1, 'the dropped read is still out, so the new one waits');
  assert.deepEqual(b.asked, ['x']);
  await b.settle('x', 'stale');
  assert.equal(loader.known().has('x'), false, 'the dropped answer is still refused');
  assert.deepEqual(b.asked, ['x', 'x'], 'and now the new read goes out');
  assert.equal(b.outNow(), 1);
  await b.settle('x', 'fresh');
  assert.equal(loader.known().get('x'), 'fresh');
  assert.equal(b.most(), 1);
});

test('stopping and starting again (as React does while developing) stays within the cap', async () => {
  const b = slow();
  const loader = projectLoader(b.read, () => {}, 4);
  loader.want(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  loader.stop();
  loader.start();
  assert.equal(b.outNow(), 4, 'not eight');
  for (const k of ['a', 'b', 'c', 'd']) await b.settle(k, k.toUpperCase());
  assert.equal(b.most(), 4);
  // The first four answers were dropped by the stop, so they are read again, four at a time.
  while (b.outNow()) await b.settle(b.waiting[0]!.key, 'v');
  assert.equal(loader.done(), true);
  assert.equal(b.most(), 4);
});

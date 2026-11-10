// node --test web/src/bots-loader.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectLoader } from './bots-loader.ts';

// A backend whose answers are let go by hand, to play out slow and late ones.
function slow() {
  const waiting = new Map<string, { resolve: (v: string | null) => void; reject: (e: Error) => void }>();
  const asked: string[] = [];
  let most = 0;
  const read = (key: string) =>
    new Promise<string | null>((resolve, reject) => {
      asked.push(key);
      waiting.set(key, { resolve, reject });
      most = Math.max(most, waiting.size);
    });
  const settle = async (key: string, value: string | null | Error) => {
    const w = waiting.get(key)!;
    waiting.delete(key);
    if (value instanceof Error) w.reject(value);
    else w.resolve(value);
    await new Promise((r) => setImmediate(r));
  };
  return { read, settle, asked, waiting, most: () => most };
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
  assert.equal(changes, 5);
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
  assert.equal(loader.done(), true, 'a failure does not hold the page at Loading');
  assert.deepEqual([...loader.known().keys()], ['a']);
  loader.want(['b']);
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
  assert.equal(changes, 2, 'the same copy again is not a change');
  loader.stop();
  await b.settle('b', 'B');
  assert.equal(loader.known().has('b'), false);
  assert.equal(changes, 2);
  // Set up again (React runs an effect, its cleanup, then the effect again while developing).
  loader.start();
  assert.deepEqual(b.asked, ['a', 'b', 'b'], 'what was dropped is read again');
  await b.settle('b', 'B');
  assert.equal(loader.known().get('b'), 'B');
  assert.equal(loader.done(), true);
});

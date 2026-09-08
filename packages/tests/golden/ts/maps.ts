// A Map and a Set are one hash table under two names, keyed by SameValueZero -- which is `===`
// except that NaN finds itself, and `Object.is` except that -0 finds +0. Both differences are
// reachable from ordinary arithmetic, so both are pinned here.

const m = new Map<string, number>();
m.set('a', 1);
m.set('b', 2);
console.log(m);
console.log(m.get('a'));
console.log(m.has('b'));
console.log(m.size);

// An absent key reads as `undefined`, which is why the type of a `.get` is not the type the map
// holds -- the same relation an array index read has to its element type.
console.log(m.get('zz'));

// `set` returns the map, so the calls chain; a repeated key updates in place and does NOT move.
const chained = new Map<number, string>();
chained.set(1, 'one').set(2, 'two').set(3, 'three');
chained.set(2, 'TWO');
console.log(chained);
console.log(chained.get(2));

// Deletion answers whether the key was there, and vacates a position the next insert does not take.
console.log(m.delete('a'));
console.log(m.delete('a'));
m.set('c', 3);
console.log(m);
console.log(m.size);

// Clearing is not the same as a fresh map only in that the binding survives.
m.clear();
console.log(m);
console.log(m.size);
m.set('d', 4);
console.log(m);

// SameValueZero on numbers: one NaN key, one zero key.
const numeric = new Map<number, string>();
numeric.set(0 / 0, 'nan');
numeric.set((1 / 0) * 0, 'nan again');
numeric.set(0, 'zero');
numeric.set(-0, 'still zero');
console.log(numeric);
console.log(numeric.size);
console.log(numeric.get(0 / 0));
console.log(numeric.has(-0));

// A Set stores keys and nothing else, and re-adding one changes nothing at all.
const s = new Set<string>();
s.add('x');
s.add('y');
s.add('x');
console.log(s);
console.log(s.size);
console.log(s.has('y'));
console.log(s.has('nope'));
console.log(s.delete('x'));
console.log(s);

// Object keys compare by IDENTITY: two instances with identical fields are two keys.
class Point {
  x: number;
  constructor(x: number) {
    this.x = x;
  }
}
const a = new Point(1);
const b = new Point(1);
const byIdentity = new Map<Point, string>();
byIdentity.set(a, 'a');
byIdentity.set(b, 'b');
console.log(byIdentity.size);
console.log(byIdentity.get(a));
console.log(byIdentity.get(b));
console.log(byIdentity.has(new Point(1)));

// Values are ordinary values: a collection may hold an array, an object, or another collection.
const nested = new Map<string, Map<string, number>>();
const inner = new Map<string, number>();
inner.set('k', 1);
nested.set('m', inner);
console.log(nested);
console.log(nested.get('m'));

const holding = new Map<string, number[]>();
holding.set('list', [1, 2, 3]);
console.log(holding);

// Operands are evaluated left to right, exactly once each.
let calls = 0;
function tick(n: number): number {
  calls = calls + 1;
  return n * calls;
}
const ordered = new Map<number, number>();
ordered.set(tick(1), tick(1));
ordered.set(tick(1), tick(1));
console.log(ordered);
console.log(calls);

// A collection is a value: it passes to a function, comes back from one, and lives in an array.
function counted(words: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of words) {
    const seen = counts.get(word);
    if (seen === undefined) {
      counts.set(word, 1);
    } else {
      counts.set(word, seen + 1);
    }
  }
  return counts;
}
console.log(counted(['a', 'b', 'a', 'c', 'a']));
console.log(counted([]).size);
console.log([new Set<number>(), new Map<string, string>()]);

// Growth past the initial capacity, with deletions mixed in, so the compaction path runs and the
// survivors keep the order they were inserted in.
const many = new Map<number, number>();
for (let i = 0; i < 40; i++) {
  many.set(i, i * 2);
}
for (let i = 0; i < 40; i += 2) {
  many.delete(i);
}
console.log(many.size);
console.log(many.get(39));
console.log(many.get(38));
console.log(many);

// forEach is the one iteration form that needs no iterator: it takes a callback, and the runtime
// calls it through jsrt_call exactly as the Array.prototype callback methods do. The spec's triple
// is (value, key, collection) for a Map and (value, value, set) for a Set -- a Set entry is its
// own key, which is how it is stored.
const walk = new Map<string, number>();
walk.set('a', 1);
walk.set('b', 2);
walk.set('c', 3);
walk.forEach((v: number, k: string): void => {
  console.log(`${k}=${v}`);
});

// The third argument is the collection itself, and a callback may declare fewer parameters.
walk.forEach((v: number, k: string, self: Map<string, number>): void => {
  console.log(`${k}:${v}:${self.size}`);
});
walk.forEach((v: number): void => {
  console.log(v);
});

const letters = new Set<string>();
letters.add('x');
letters.add('y');
letters.forEach((v: string, k: string): void => {
  console.log(`${v}/${k}`);
});

// Insertion order survives a delete-and-reinsert: the re-added key goes to the END.
const reordered = new Map<string, number>();
reordered.set('one', 1);
reordered.set('two', 2);
reordered.set('three', 3);
reordered.delete('one');
reordered.set('one', 10);
reordered.forEach((v: number, k: string): void => {
  console.log(`${k}->${v}`);
});

// An entry ADDED during the walk is visited; one DELETED before it is reached is not. That pair is
// why the table suppresses compaction while a walk holds an index into it: a compaction triggered
// by the insert would renumber the entries under the cursor and the walk would skip past them.
const mutating = new Map<number, number>();
mutating.set(1, 1);
mutating.set(2, 2);
mutating.forEach((v: number, k: number): void => {
  console.log(`saw ${k}`);
  if (k === 1) {
    mutating.set(99, 99);
    mutating.delete(2);
  }
});
console.log(mutating.size);

// Enough inserts during a walk to force the array to grow more than once, so the preserved-index
// path runs rather than being a case the fixture merely describes.
const growing = new Map<number, number>();
growing.set(0, 0);
let added = 0;
growing.forEach((v: number, k: number): void => {
  if (added < 12) {
    added = added + 1;
    growing.set(added, added);
  }
});
console.log(growing.size);
console.log(added);

// Clearing from inside the walk ends it: there is nothing left to reach.
const cleared = new Map<number, number>();
cleared.set(1, 1);
cleared.set(2, 2);
cleared.set(3, 3);
cleared.forEach((v: number, k: number): void => {
  console.log(k);
  cleared.clear();
});
console.log(cleared.size);

// Nested walks over the same collection, which is why the suppression counts rather than flags.
const outer = new Map<string, number>();
outer.set('p', 1);
outer.set('q', 2);
outer.forEach((v: number, k: string): void => {
  outer.forEach((v2: number, k2: string): void => {
    console.log(`${k}${k2}`);
  });
});

// A throwing callback stops the walk and reaches the catch, the same protocol the array callbacks
// follow -- the runtime's guard tests jsrt_pending() and the emitter checks it after the call.
const throwing = new Map<number, number>();
throwing.set(1, 1);
throwing.set(2, 2);
throwing.set(3, 3);
try {
  throwing.forEach((v: number, k: number): void => {
    console.log(k);
    if (k === 2) {
      throw 'enough';
    }
  });
} catch (e) {
  console.log(typeof e);
}
console.log('after map forEach');

// Nothing to walk is not a special case.
const emptyMap = new Map<string, number>();
emptyMap.forEach((): void => {
  console.log('never');
});
const emptySet = new Set<number>();
emptySet.forEach((): void => {
  console.log('never either');
});
console.log('empty walks done');

// -0 as the FIRST insert of a key: the spec stores it as +0, so the key prints as `0` and `1 / k`
// answers Infinity. A stored -0 would show in both, and SameValueZero would hide it from `has`.
const negzero = new Map<number, string>();
negzero.set(-0, 'first');
console.log(negzero);
negzero.forEach((v: string, k: number): void => {
  console.log(k);
  console.log(1 / k);
  console.log(v);
});
console.log(negzero.has(0));
const negset = new Set<number>();
negset.add(-0);
console.log(negset);
negset.forEach((v: number): void => {
  console.log(1 / v);
});

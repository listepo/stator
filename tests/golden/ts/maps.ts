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

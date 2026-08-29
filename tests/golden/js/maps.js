// Map and Set on the dynamic path. Nothing about the hash table is typed: SameValueZero compares
// values, not annotations, so an untyped file gets the same keys in the same order a typed one does.

const m = new Map();
m.set('a', 1);
m.set('b', 2);
console.log(m);
console.log(m.get('a'));
console.log(m.get('zz'));
console.log(m.has('b'));
console.log(m.size);

// One map, keys of three different types at once -- which is the difference the dynamic path makes.
const mixed = new Map();
mixed.set('one', 1);
mixed.set(1, 'one');
mixed.set(true, 'yes');
console.log(mixed);
console.log(mixed.get(1));
console.log(mixed.get('one'));
console.log(mixed.has(true));

// `1` and `'1'` are different keys: SameValueZero does no coercion, unlike `==`.
console.log(mixed.size);
console.log(mixed.has('1'));

// `set` returns the map, so calls chain; a repeated key updates in place without moving.
const chained = new Map();
chained.set(1, 'one').set(2, 'two').set(3, 'three');
chained.set(2, 'TWO');
console.log(chained);

// Deletion answers whether the key was there, and clearing leaves the binding alone.
console.log(chained.delete(1));
console.log(chained.delete(1));
console.log(chained);
chained.clear();
console.log(chained);
console.log(chained.size);

// NaN finds itself and -0 finds +0 -- the two places SameValueZero is neither `===` nor `Object.is`.
const numeric = new Map();
numeric.set(0 / 0, 'nan');
numeric.set((1 / 0) * 0, 'nan again');
numeric.set(0, 'zero');
numeric.set(-0, 'still zero');
console.log(numeric);
console.log(numeric.get(0 / 0));
console.log(numeric.has(-0));

// A Set is the same table without the values.
const s = new Set();
s.add('x');
s.add('y');
s.add('x');
console.log(s);
console.log(s.size);
console.log(s.has('y'));
console.log(s.delete('x'));
console.log(s);

// Object keys compare by identity, so two instances with identical fields are two keys.
class Tag {
  constructor(name) {
    this.name = name;
  }
}
const byIdentity = new Map();
const first = new Tag('t');
byIdentity.set(first, 1);
byIdentity.set(new Tag('t'), 2);
console.log(byIdentity.size);
console.log(byIdentity.get(first));

// Values are ordinary values, collections included.
const nested = new Map();
const inner = new Map();
inner.set('k', 1);
nested.set('m', inner);
nested.set('list', [1, 2, 3]);
console.log(nested);

// Operands evaluate left to right, exactly once each.
let calls = 0;
function tick(n) {
  calls = calls + 1;
  return n * calls;
}
const ordered = new Map();
ordered.set(tick(1), tick(1));
ordered.set(tick(1), tick(1));
console.log(ordered);
console.log(calls);

// Growth past the initial capacity with deletions mixed in, so compaction runs and the survivors
// keep the order they were inserted in.
const many = new Map();
for (let i = 0; i < 40; i++) {
  many.set(i, i * 2);
}
for (let i = 0; i < 40; i += 2) {
  many.delete(i);
}
console.log(many.size);
console.log(many);

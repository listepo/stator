// `{ ...o }` enumerates in the SOURCE OBJECT's key order, not the type's field order
// (plan.md §8 step 21a). The annotation below types the fields `y, x` while the literal -- and
// therefore the object -- was built `x, y`; every spread here must print `x` first, however the
// result is extended, while reads still resolve through the layout.

/** @type {{y: number, x: string}} */
const o = { x: 's', y: 2 };
const p = { ...o };
console.log(Object.keys(p).join(','));
console.log(JSON.stringify(p));
console.log(p);

// An appended key goes last, a prepended one first, and an override keeps the spread's
// position while taking the new value.
const appended = { ...o, z: 3 };
console.log(Object.keys(appended).join(','));
const prepended = { z: 0, ...o };
console.log(Object.keys(prepended).join(','));
const shadowed = { ...o, x: 'over' };
console.log(Object.keys(shadowed).join(',') + '=' + shadowed.x);

// Two spreads merge in order, each in its own source's order.
/** @type {{b: number, a: string}} */
const o2 = { a: 'A', b: 1 };
const merged = { ...o, ...o2 };
console.log(Object.keys(merged).join(','));
console.log(JSON.stringify(merged));

// A call source evaluates once no matter how many fields read it -- and a single-field
// spread keeps its source for the order repair rather than evaluating twice.
let calls = 0;
function make() {
  calls++;
  return { q: 1, w: 2 };
}
function one() {
  calls++;
  return { solo: 7 };
}
const c1 = { ...make() };
console.log(Object.keys(c1).join(','));
const c2 = { k: 0, ...make(), j: 9 };
console.log(Object.keys(c2).join(','));
const s1 = { ...one() };
console.log(Object.keys(s1).join(',') + '=' + s1.solo + ' calls=' + calls);

// The order repair reads an identifier source at the fragment's own position: the
// reassignment below must not move the spread's keys, and the values are the original's.
/** @type {{n: number, m: number}} */
let b = { n: 1, m: 2 };
const re = { ...b, z: (b = { n: 9, m: 8 }) };
console.log(Object.keys(re).join(',') + '=' + re.n + ',' + re.m);

// A spread into a dynamic result keeps the same order through insertion.
/** @type {{y?: number, x?: string, z?: number}} */
const d = { ...o, z: 5 };
console.log(Object.keys(d).join(','));
console.log(JSON.stringify(d));
/** @type {{w?: number, y?: number, x?: string}} */
const d2 = { w: 0, ...o };
console.log(Object.keys(d2).join(','));

// A suspension inside the literal must not strand the repair past a park: the declaration opens
// after every value, and the identifier source is snapshotted at its fragment's position.
/** @type {{y: number, x: string}} */
const q = { x: 't', y: 3 };
async function f() {
  const a = { ...q, w: await Promise.resolve(9) };
  console.log(Object.keys(a).join(','));
}
f();

function* g() {
  const a = { ...q, v: yield 1 };
  return Object.keys(a).join(',');
}
const it = g();
console.log(it.next().value);
console.log(it.next(42).value);

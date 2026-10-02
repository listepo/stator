// The builtin constructors (plan.md §11c T11.4 step 4b): `Array(n)` and array holes, the RegExp
// constructor, and WeakMap/WeakSet. docs/VALUE.md §4.4, §4.21, §4.22.

// --- Array(n), new Array(...), and holes
const a = new Array(3);
console.log(a, a.length, a[1], 1 in a);
const b = Array(5);
b[2] = 'x';
console.log(b);
const c = [];
c[5] = 1;
console.log(c, c.length, 0 in c, 5 in c);
const d = new Array(4);
for (let i = 0; i < 4; i++) d[i] = i + 1;
console.log(delete d[1], d, d.length, 1 in d, delete d[9]);
console.log(d.join('-'), JSON.stringify(d), d.indexOf(undefined), d.includes(undefined));
d.forEach((x, i) => console.log('each', i, x));
console.log(d.map((x) => x * 2), d.filter(() => true), d.some((x) => x === undefined));
console.log(d.reduce((sum, x) => sum + x, 0), d.every((x) => x > 0));
for (const x of d) console.log('of', x);
for (const pair of d.entries()) console.log('entry', pair);
console.log([...d], [0, ...d], d.concat([5]), d.slice(0, 2));
const e = Array(1, 2, 3);
console.log(e, Array(), new Array('a'), new Array(2, 'b'), new Array(0));
try {
  new Array(-1);
} catch (err) {
  console.log(err.name, err.message);
}
try {
  Array(1.5);
} catch (err) {
  console.log(err.name, err.message);
}
const big = new Array(120);
big[3] = 7;
console.log(big);
const many = new Array(30);
for (let i = 0; i < 30; i++) {
  if (i % 3) many[i] = i;
}
console.log(many);
const s = [3, undefined, 1];
s[5] = 0;
s.sort();
console.log(s, s.length);
console.log(d.toReversed(), d.with(0, 9), d.toSorted());
const h = Array(2);
h[1] = 'a';
console.log(h.at(0), h.pop(), h.shift(), h);
const nested = new Array(2);
nested[1] = new Array(3);
console.log(nested, [nested]);

// --- new RegExp(pattern, flags)
const r = new RegExp('x/y', 'g');
console.log(r, r.source, String(r), new RegExp(r), new RegExp(r, 'i'), RegExp('a\nb'));
console.log(new RegExp(), new RegExp(undefined, 'm'), RegExp('[/]'), new RegExp('a+', 'g').test('caat'));
const patterns = ['(', ')', '*', 'a{2,1}', '(?<n>a)(?<n>b)', '(?<1>a)', '(?'];
for (const p of patterns) {
  try {
    new RegExp(p);
  } catch (err) {
    console.log(err.name, err.message);
  }
}
for (const f of ['gg', 'z']) {
  try {
    RegExp('a', f);
  } catch (err) {
    console.log(err.name, err.message);
  }
}

// --- WeakMap and WeakSet
const wm = new WeakMap();
const ws = new WeakSet();
const k = { a: 1 };
const fn = function () {};
wm.set(k, 'v').set(fn, 2);
ws.add(k);
console.log(wm.get(k), wm.has(fn), wm.has({}), ws.has(k), ws.has(fn));
console.log(wm.delete(k), wm.has(k), ws.delete(k), ws.delete(k));
console.log(wm, ws, [wm, [[ws]]]);
console.log(String(wm), String(ws), `${ws}`, JSON.stringify({ wm }));
console.log(wm instanceof WeakMap, wm instanceof Map, ws instanceof WeakSet, ws instanceof Set);
try {
  wm.set(1, 2);
} catch (err) {
  console.log(err.name, err.message);
}
try {
  ws.add('x');
} catch (err) {
  console.log(err.name, err.message);
}
console.log(wm.get(1), ws.has(null));
const cache = new WeakMap();
function memo(o) {
  let v = cache.get(o);
  if (v === undefined) {
    v = o.x === undefined ? 1 : 2;
    cache.set(o, v);
  }
  return v;
}
console.log(memo(k), memo(k), memo({ x: 1 }));

// RegExp.prototype on an Unknown receiver (plan-notes 314).
function describe(x) {
  const test = x.test;
  console.log(x.source, x.sticky, x.exec('xaby'), x.test('ab'), typeof test, test.length, x.toString());
}
describe(new RegExp('a(b)', 'y'));

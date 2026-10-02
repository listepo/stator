// Spreads of any iterable and call-side spreads in js mode (plan.md §11c T11.4 step 5,
// docs/VALUE.md §4.23). V8's not-iterable messages name the source text, which ours do not, so
// only the error's class is printed.
function spread(x) {
  return [0, ...x, 9];
}
const holes = Array(3);
holes[1] = 2;
const m = new Map();
m.set(1, 2);
const st = new Set();
st.add(5);
console.log(spread(holes), spread('ab'), spread(m), spread(st), spread(m.keys()));
function* gen() {
  yield 1;
  yield 2;
}
console.log(spread(gen()), [...gen()], Array.from(gen()), Array.from({ length: 2, 0: 'a' }));
console.log(Array.from(5), Array.from(function (a, b) {}), Array.from(holes));
for (const bad of [undefined, null, 5, {}]) {
  try {
    console.log(spread(bad));
  } catch (e) {
    console.log(e instanceof TypeError);
  }
}
for (const bad of [undefined, null]) {
  try {
    console.log(Array.from(bad));
  } catch (e) {
    console.log(e instanceof TypeError);
  }
}
class Bag {
  constructor() {
    this.items = [7, 8];
  }
  [Symbol.iterator]() {
    return gen();
  }
}
const it = new Bag();
console.log([...it]);

function show(a, b, c) {
  return [a, b, c].join('|');
}
const args = [1, 'two'];
console.log(show(...args), show(...args, 3, 4), show(...'xy'));
const o = {
  name: 'o',
  who(...rest) {
    return this.name + ':' + rest.length;
  },
};
console.log(o.who(...[1, 2, 3]), o.who(...[]));
const holder = { fn: show };
console.log(holder.fn(...[7, 8]));
function counter() {}
counter.hit = function (...xs) { return xs.length; };
console.log(counter.hit(...[1, 2]));
class K {
  constructor(n) { this.n = n; }
  scale(...xs) { return xs.map((x) => x * this.n); }
  static make(...ps) { return new K(ps.length); }
}
const k = new K(10);
console.log(k.scale(...[1, 2, 3]), K.make(...'abcd').n);
const list = [];
list.push(...[1, 2], ...new Set().keys());
console.log(list);
const m2 = new Map();
m2.set('a', 1);
m2.set('b', 2);
console.log(show(...m2), show(...m2.values()));
function* gen2() { yield 1; yield 2; }
console.log(show(...gen2()));
let dyn = show;
console.log(dyn(...[5, 6, 7]));
const arr2 = [];
arr2.splice(0, 0, ...[3, 4]);
console.log(arr2);
try { show(...undefined); } catch (e) { console.log(e instanceof TypeError); }
try { show(...5); } catch (e) { console.log(e instanceof TypeError); }
try { const nf = 3; nf(...[1]); } catch (e) { console.log(e instanceof TypeError); }
console.log(Array.from(5), Array.from({ length: 2, 0: 'a' }), Array.from('hé'));

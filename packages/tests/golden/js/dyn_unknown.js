// Phase 5 step 4: untyped property get/set, computed index, Unknown call, ==.
// `let o = {}` is an empty anonymous shape, which grows through the shape table.
// A function parameter with no annotation is Unknown, so `obj.x` / `obj[k]` / `fn(...)`
// are the same IC-site path.

let o = {};
o.x = 1;
console.log(o.x);

o['y'] = 2;
console.log(o['y']);
console.log(o.y);

function readX(obj) {
  return obj.x;
}
console.log(readX(o));

function get(obj, key) {
  return obj[key];
}
console.log(get(o, 'x'));
console.log(get(o, 'missing'));

function add(a, b) {
  return a + b;
}
function callIt(fn) {
  return fn(3, 4);
}
console.log(callIt(add));

function id(x) {
  return x;
}
console.log(1 == id('1'));
console.log(null == id(undefined));
console.log(true == id(1));
console.log(0 == id(false));

// An EVOLVING array: `const xs = []` is widened to Unknown by js mode, while the checker keeps
// resolving it to `number[]` as the pushes accumulate. A `for-of` over it must bind what the
// emitted loop actually yields -- the two disagreed, and the binding claimed a type the loop
// never produced (STA4010).
const evolving = [];
evolving.push(1);
evolving.push('two');
for (const item of evolving) {
  console.log(item);
}

// The same disagreement one level up: the elements are closures, so the loop variable is called.
const evolvingFns = [];
evolvingFns.push(() => 'called');
for (const f of evolvingFns) {
  console.log(f());
}

// `entries()` over an evolving array: the view decides the binding, not the checker.
for (const pair of evolving.entries()) {
  console.log(pair);
}

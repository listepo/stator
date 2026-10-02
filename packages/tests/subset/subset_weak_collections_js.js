// @mode: js
// @verdict: dynamic
// SUBSET.md: `WeakMap` and `WeakSet`

// The checker gives an untyped WeakMap open keys, so a primitive key reaches the runtime check.
const wm = new WeakMap();
const k = {};
wm.set(k, 'v');
try {
  wm.set(1, 2);
} catch (err) {
  console.log(err.message);
}
console.log(wm.get(k), wm, new WeakSet());

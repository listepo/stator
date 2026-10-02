// @mode: js
// @verdict: static
// SUBSET.md: Calls of an object's function-valued field

// The same factory in js mode: the checker infers the literal's shape, and each call loads its
// callee from the field's slot.
function makeCounter() {
  let n = 0;
  function bump() {
    n += 2;
    return n;
  }
  return { bump, read: () => n, reset: function () { n = 0; } };
}
const counter = makeCounter();
counter.bump();
counter.reset();
export const value = counter.read();

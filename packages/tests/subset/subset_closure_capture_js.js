// @mode: js
// @verdict: dynamic
// SUBSET.md: Function declarations, function expressions, arrow functions

// The captured `base` has no annotation and no inferable initializer, so it widens to `Unknown`
// and the environment slot holds a dynamic value -- an inferable capture stays static in js mode,
// which is what subset_closure_capture_ts.ts covers.
function adder(base) {
  return function (x) {
    return base + x;
  };
}
const addTen = adder(10);

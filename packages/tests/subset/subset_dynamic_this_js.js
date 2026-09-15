// @mode: js
// @verdict: dynamic
// SUBSET.md: dynamic `this` in plain functions (docs/VALUE.md §4.16 `has_receiver`)

function f() {
  return typeof this;
}
console.log(f());

// @mode: js
// @verdict: dynamic
// SUBSET.md: untyped property get/set, index, and call on Unknown

function f(o) {
  o.x = 1;
  return o.x;
}
console.log(f({}));

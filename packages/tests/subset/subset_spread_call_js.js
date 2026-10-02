// @mode: js
// @verdict: dynamic
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
// A spread into fixed parameters passes whatever count the list holds; the checker's TS2556 is a
// js-mode runtime code (plan.md §11c T11.4 step 5).
function f(a, b) {
  return a + b;
}
const arr = [1, 2];
console.log(f(...arr), f(...'ab'), f(...[1]));

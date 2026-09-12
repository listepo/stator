// @mode: js
// @verdict: dynamic
// SUBSET.md: Function declarations, function expressions, arrow functions

const f = function fact(n) {
  return n <= 1 ? 1 : n * fact(n - 1);
};
void f;

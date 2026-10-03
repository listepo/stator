// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: console
// `%s` of a function is String(fn), the function's source text, which no binary carries.

function greet() {
  return 1;
}
console.log('%s', greet);

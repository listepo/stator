// @mode: js
// @verdict: dynamic
// SUBSET.md: generator functions and `yield`
// An untyped yield's injected value is Unknown, so a file that binds it is dynamic.

function* echo() {
  const a = yield 1;
  return a;
}
console.log(echo().next());
console.log(echo().next(2));

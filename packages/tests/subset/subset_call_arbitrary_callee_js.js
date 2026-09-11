// @mode: js
// @verdict: dynamic
// SUBSET.md: the callee of a call is an ordinary expression

function inc(n) {
  return n + 1;
}
function dec(n) {
  return n - 1;
}
const up = true;
console.log((up ? inc : dec)(10));

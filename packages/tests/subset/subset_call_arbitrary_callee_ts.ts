// @mode: ts
// @verdict: static
// SUBSET.md: the callee of a call is an ordinary expression

function inc(n: number): number {
  return n + 1;
}
function dec(n: number): number {
  return n - 1;
}
const up = true;
console.log((up ? inc : dec)(10));

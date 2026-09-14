// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
function f(a: number, b: number): number {
  return a + b;
}
const t: [number, number] = [1, 2];
console.log(f(...t));

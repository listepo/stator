// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Rest parameters ...args

function sum(a: number, ...rest: number[]): number {
  let total: number = a;
  for (const x of rest) {
    total += x;
  }
  return total;
}
export { sum };

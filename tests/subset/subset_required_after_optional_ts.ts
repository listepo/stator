// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: optional parameter order
function select(first?: number, second: number): number {
  return second;
}
console.log(select(1, 2));

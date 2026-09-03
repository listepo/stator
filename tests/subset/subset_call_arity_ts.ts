// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: function calls
function choose(value: number): number {
  return value;
}
console.log(choose(1, 2));

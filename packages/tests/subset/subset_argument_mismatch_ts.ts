// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: function calls
function increment(value: number): number {
  return value + 1;
}
console.log(increment('2'));

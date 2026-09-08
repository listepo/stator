// @mode: js
// @verdict: dynamic
// SUBSET.md: unknown type

function check(x: unknown): number {
  return (x as number) + 1;
}
console.log(check(41));

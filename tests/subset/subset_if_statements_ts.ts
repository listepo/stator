// @mode: ts
// @verdict: static
// SUBSET.md: if statements

function test(x: number): number {
  if (x > 0) {
    return x;
  } else {
    return -x;
  }
}
export { test };

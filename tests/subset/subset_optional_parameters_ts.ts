// @mode: ts
// @verdict: dynamic
// SUBSET.md: Optional parameters

function f(x?: number): number {
  if (x === undefined) {
    return 0;
  }
  return x;
}
export { f };

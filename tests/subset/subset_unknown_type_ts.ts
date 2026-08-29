// @mode: ts
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: unknown type

export function check(x: unknown): number {
  return (x as number) + 1;
}

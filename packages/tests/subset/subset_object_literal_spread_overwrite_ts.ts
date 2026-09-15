// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Object literals with static keys
// A spread overwriting an explicit key is tsc's TS2783, and ts mode keeps the refusal:
// last-wins is JavaScript's answer, not typed TypeScript's. js mode takes the value instead
// (subset_object_literal_spread_overwrite_js).

export function f(o: { a: number; b: number }): { a: number; b: number } {
  return { b: 9, ...o, a: 7 };
}

console.log(JSON.stringify(f({ a: 1, b: 2 })));

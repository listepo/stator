// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: Object literals with static keys
// ts mode keeps tsc's TS2698: a spread of a `never`-narrowed operand is a type error where the
// types are written. js mode drops it (subset_spread_refused_operand_js, plan-notes 297).
function merge(base: { a: number }, extra: undefined): { a: number } {
  return extra ? { ...base, ...extra } : base;
}
console.log(merge({ a: 1 }, undefined));

// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- an opaque class-expression use reads the class object, which does
// not exist (plan.md §8 step 12e). In-place uses (`new C`, `C.static`, `o instanceof C`,
// `extends C`) erase to the expression and compile (subset_class_expression_ts).

const C = class {
  m(): number {
    return 7;
  }
};
export function take(x: unknown): unknown {
  return x;
}
export const y = take(C);

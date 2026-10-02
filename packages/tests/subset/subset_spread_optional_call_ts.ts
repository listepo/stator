// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
// The spread lowering builds no optional chain's short-circuit (plan.md §11c T11.4 step 5).
function pick(on: boolean): ((...xs: number[]) => number) | undefined {
  return on ? (...xs: number[]): number => xs.length : undefined;
}
const xs: number[] = [1, 2];
console.log(pick(true)?.(...xs));

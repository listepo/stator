// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
// In js mode an annotated TypeScript parameter is a claim the call edge checks (STA2001,
// plan-notes 308); a spread's elements reach parameters only at run time, where no check stands,
// so the spread into one waits (plan.md §11c T11.4 step 5).
function inc(n: number): number {
  return n + 1;
}
const xs: unknown[] = JSON.parse('[1]');
console.log(inc(...(xs as [number])));

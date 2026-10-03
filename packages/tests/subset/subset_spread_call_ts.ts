// @mode: ts
// @verdict: static
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
// A call-side spread builds its argument list at run time and calls through
// `jsrt_call_spread_at` (plan.md §11c T11.4 step 5). A list whose pieces share one element type
// stays typed.
function f(...xs: number[]): number {
  let total = 0;
  for (const x of xs) {
    total += x;
  }
  return total;
}
const arr: number[] = [1, 2];
console.log(f(...arr), f(0, ...arr, 3));

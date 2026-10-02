// @mode: ts
// @verdict: dynamic
// SUBSET.md: rest parameters (call-side spread needs a dynamic argv)
// `o.m(...xs)` on a class instance and an array's variadic method (plan.md §11c T11.4 step 5).
// Dynamic even over typed operands: the method is read through the shape table, as the
// Unknown-receiver call reads it, because no typed arm takes a spread.
class Acc {
  total = 0;
  add(...xs: number[]): number {
    for (const x of xs) {
      this.total += x;
    }
    return this.total;
  }
}
const nums: number[] = [1, 2, 3];
const out: number[] = [];
out.push(...nums);
out.splice(1, 1, ...nums);
console.log(new Acc().add(...nums, 4), out);

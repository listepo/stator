// @mode: ts
// @verdict: static
// SUBSET.md: Classes with getters/setters
// A literal-typed computed accessor name (`get [a]` with `a: "val"`) installs its pair
// under the name the direct spelling writes, so `c.val` and `c[a]` run the same getter
// and setter (plan.md §8 step 12(d)).

const a = "val";
class C {
  backing: number = 1;
  get [a](): number {
    return this.backing;
  }
  set [a](v: number) {
    this.backing = v;
  }
}
const c = new C();
console.log(c.val);
console.log(c[a]);
c[a] = 2;
export const x = c.val;

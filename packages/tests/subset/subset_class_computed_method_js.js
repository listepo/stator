// @mode: js
// @verdict: static
// SUBSET.md: Classes with fixed shape (no getters/setters)
// A literal-typed computed method name (`[k]` with `k: "m"`) is the name the direct
// spelling writes, so the method takes the ordinary member-function path: `c.m()` and
// `c[k]()` are the same call, including the `new C()[k]()` twin (plan.md §8 step 12(d)).

const k = "m";
class C {
  [k]() {
    return 5;
  }
}
const c = new C();
console.log(c.m());
console.log(c[k]());
console.log(new C()[k]());
export const x = c.m();

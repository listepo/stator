// @mode: ts
// @verdict: static
// SUBSET.md: Static methods and static class members
// A literal-typed computed static name (`static [k]` with `k: "m"`) binds the static the
// direct spelling declares, read through the declaring class (plan.md §8 step 12(d)).

const k = "m";
const f = "count";
class C {
  static [f]: number = 3;
  static [k](): number {
    return 7;
  }
}
console.log(C.m());
console.log(C.count);
export const x = C.m();

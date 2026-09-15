// @mode: ts
// @verdict: static
// SUBSET.md: Classes with fixed shape (no getters/setters)
// A literal-typed computed field name (`[f]` with `f: "count"`) declares the slot the
// direct spelling writes, so dot and element reads and writes share one slot
// (plan.md §8 step 12(d)).

const f = "count";
class C {
  [f]: number = 10;
}
const c = new C();
console.log(c.count);
console.log(c[f]);
c[f] = 11;
c.count += 1;
export const x = c[f];

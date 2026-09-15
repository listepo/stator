// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes with fixed shape (no getters/setters)
// A computed key of non-literal type is a runtime value: it is not a name until there is a
// shape table to look it up in, and a class layout has none, so the member stays not-yet.
// An integer-like static name stays not-yet for the same reason an integer-like object key
// takes the dynamic path: OrdinaryOwnPropertyKeys sorts those first, while a fixed layout
// is declaration order (plan.md §8 step 12(d)).

export function build(k) {
  class C {
    [k]() {
      return 1;
    }
  }
  console.log(new C());
}

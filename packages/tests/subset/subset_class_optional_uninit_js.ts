// @mode: js
// @verdict: dynamic
// SUBSET.md: Classes with getters/setters
// The same uninitialized optional field in js mode (plan.md §8 step 12(d)).

class C {
  x?: number;
}

const c = new C();
export const x = c.x;

// @mode: ts
// @verdict: dynamic
// SUBSET.md: Classes with getters/setters
// An uninitialized optional field defaults its slot to `undefined` (plan.md §8 step 12(d)):
// the declaration is accepted, and reads of the `number | undefined` field are dynamic,
// exactly as for an optional field WITH an initializer.

class C {
  x?: number;
}

const c = new C();
export const x = c.x;

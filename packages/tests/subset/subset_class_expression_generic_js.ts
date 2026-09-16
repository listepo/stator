// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Classes -- a generic class expression has nowhere to specialize under: tuple
// descriptors key on a declaration's source name, and an expression's identity is its
// binding (plan.md §8 step 12(f)).

const C = class<T> {
  v!: T;
  get(): T {
    return this.v;
  }
};
export const x = 1;

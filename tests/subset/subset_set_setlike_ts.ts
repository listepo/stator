// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Set
// The spec accepts any SET-LIKE object here -- a `size`, a `has` and a `keys` -- and reads it by
// calling `keys()` on that object, which is still the user-iterable protocol. `a.keys()` itself
// is a legal boxed iterator; the gate refuses the OBJECT argument to `union`.

const a = new Set<number>();
a.add(1);
const setLike = {
  size: 1,
  has: (v: number): boolean => v === 1,
  keys: (): IterableIterator<number> => a.keys(),
};
console.log(a.union(setLike));

// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Set
// The spec accepts any SET-LIKE object here -- a `size`, a `has` and a `keys` -- and reads it by
// calling `keys()`, which is the iterator protocol the subset has no node for. The lib types the
// parameter that way, so this is a well-typed program the gate refuses in its own words. It refuses
// it TWICE, which is the point: the argument rule fires on the call, and writing the set-like value
// at all needs a `keys()` -- there is no way to spell one without the protocol.

const a = new Set<number>();
a.add(1);
const setLike = {
  size: 1,
  has: (v: number): boolean => v === 1,
  keys: (): IterableIterator<number> => a.keys(),
};
console.log(a.union(setLike));

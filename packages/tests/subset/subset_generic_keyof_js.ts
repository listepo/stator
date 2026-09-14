// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — a `keyof` constraint needs indexed access (`o[k]`), which is its own
// not-yet: the type parameter itself is accepted, and the access is refused where it is gated.

function get<T, K extends keyof T>(o: T, k: K): T[K] {
  return o[k];
}
console.log(get({ a: 1 }, "a"));

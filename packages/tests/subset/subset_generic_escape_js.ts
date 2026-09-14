// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — a generic that escapes (here, returned) has no call site to name a
// tuple by: aliases specialize at direct calls and at function-typed parameters, and anything
// further out waits on the dynamic tier.

function box<T>(x: T): T {
  return x;
}
function get(): (x: number) => number {
  return box;
}
console.log(get()(2));

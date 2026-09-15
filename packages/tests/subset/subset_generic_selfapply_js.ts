// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — self-application infers a generic type for the argument, which
// no monomorphic copy can spell. The call refuses rather than reaching an internal error.

function box<T>(x: T): T {
  return x;
}
console.log(typeof box(box));

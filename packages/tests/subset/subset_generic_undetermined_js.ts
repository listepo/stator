// @mode: js
// @verdict: static
// SUBSET.md: Generics — a call whose type arguments no argument determines shares one
// specialization at the dynamic representation: with no static information anywhere, Unknown
// is the honest tuple element, the same one inference produces when a call site leaves the
// parameter free.

function noop<T>(n: number): number {
  return n;
}
console.log(noop(3));

function second<A, B>(a: A): A {
  return a;
}
console.log(second(4));

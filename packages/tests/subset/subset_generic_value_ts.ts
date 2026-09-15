// @mode: ts
// @verdict: dynamic
// SUBSET.md: Generics — a generic read as a value takes the canonical tuple (defaults,
// else Unknown): printing it names the source declaration, and passing it to an
// untyped parameter carries the one shared specialization. Dynamic, because the tuple
// is: the value's body runs on the dynamic representation.

function box<T>(x: T): T {
  return x;
}
function take(x: unknown): string {
  return typeof x;
}
console.log(box);
console.log(take(box));

const f = box;
console.log(f);
console.log(take(f));

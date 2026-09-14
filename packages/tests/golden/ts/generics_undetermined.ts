// Undetermined type arguments (plan.md §8 step 12(f)): with no static information anywhere,
// the parameter is the dynamic representation — one shared specialization, the same Unknown
// inference produces when a call site leaves the parameter free.

function noop<T>(n: number): number {
  return n;
}
console.log(noop(1));

function second<A, B>(a: A): A {
  return a;
}
console.log(second(2));

function get<T>(): T[] {
  return [];
}
const xs: number[] = get();
console.log(xs.length);
console.log(get<string>().length);

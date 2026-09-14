// js-mode twin of `ts/generics_undetermined.ts`: undetermined parameters resolve
// identically under `--mode=js`.

function noop<T>(n: number): number {
  return n;
}
console.log(noop(3));

function second<A, B>(a: A): A {
  return a;
}
console.log(second(4));

function get<T>(): T[] {
  return [];
}
const xs: number[] = get();
console.log(xs.length);
console.log(get<string>().length);

// @mode: js
// @verdict: dynamic
// SUBSET.md: Generics — a defaulted type parameter falls back to its default when no
// call site determines it; an explicit argument still determines its own. Dynamic, like the
// non-generic optional-parameter equivalent: an unpassed `x?: T` is genuinely a union.

function withDefault<T = string>(x?: T): string {
  return `${x}`;
}
console.log(withDefault());
console.log(withDefault<number>(8));

function wrap<T extends unknown[] = number[]>(x?: T): number {
  return x === undefined ? -1 : x.length;
}
console.log(wrap());
console.log(wrap([3]));

function getOrNeg<T extends { length: number } = string>(x?: T): number {
  return x === undefined ? -1 : x.length;
}
console.log(getOrNeg());
console.log(getOrNeg("cd"));

function pair<T, U = T[]>(t: T): number {
  return t === undefined ? -1 : 0;
}
console.log(pair(2));

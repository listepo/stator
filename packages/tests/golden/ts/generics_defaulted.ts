// Defaulted type parameters (plan.md §8 step 12(f)): the default supplies the tuple element
// no call site wrote — the same instantiation the checker resolves — and a parameter no
// argument determines is the dynamic representation.

function withDefault<T = string>(x?: T): string {
  return `${x}`;
}
console.log(withDefault());
console.log(withDefault<number>(7));

function wrap<T extends unknown[] = number[]>(x?: T): number {
  return x === undefined ? -1 : x.length;
}
console.log(wrap());
console.log(wrap([1, 2]));

function getOrNeg<T extends { length: number } = string>(x?: T): number {
  return x === undefined ? -1 : x.length;
}
console.log(getOrNeg());
console.log(getOrNeg("ab"));

function pair<T, U = T[]>(t: T): number {
  return t === undefined ? -1 : 0;
}
console.log(pair(1));
console.log(pair("s"));

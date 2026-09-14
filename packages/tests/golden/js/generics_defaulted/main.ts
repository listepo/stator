// js-mode twin of `ts/generics_defaulted.ts`: defaults resolve identically under `--mode=js`.

function greet<T = string>(x?: T): string {
  return `${x}`;
}
console.log(greet());
console.log(greet<number>(8));

function count<T extends unknown[] = string[]>(x?: T): number {
  return x === undefined ? -1 : x.length;
}
console.log(count());
console.log(count(["a", "b", "c"]));

// js-mode twin of `ts/generics_explicit.ts`: explicit arguments resolve identically
// under `--mode=js`.

function box<T>(item: T): T {
  return item;
}
console.log(box<string>("b"));
console.log(box<number>(43));

function pair<A, B>(first: A, second: B): string {
  return `${first}/${second}`;
}
console.log(pair<string, number>("two", 2));

const x: unknown = box<unknown>(43);
console.log(x === 43);

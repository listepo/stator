// @mode: ts
// @verdict: static
// SUBSET.md: Map, Set
// `keys`/`values`/`entries` as a for-of operand inline the specialized walk (plan-notes 150).
// Map.keys() yields the key type, so this file stays static. Do not log the iterator object:
// Node prints `Object [Map Iterator] {}` and we print `Iterator {}`.

const m = new Map<string, number>();
m.set('a', 1);
let n: number = 0;
for (const k of m.keys()) {
  n += k.length;
}
console.log(n);

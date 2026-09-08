// @mode: ts
// @verdict: static
// SUBSET.md: for...of over a user class with [Symbol.iterator]()

function* ones(): Generator<number, void, undefined> {
  yield 1;
}
class Box {
  [Symbol.iterator](): Generator<number, void, undefined> {
    return ones();
  }
}
let n: number = 0;
for (const x of new Box()) {
  n = n + x;
}
console.log(n);

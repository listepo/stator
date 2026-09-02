// @mode: js
// @verdict: dynamic
// SUBSET.md: for...of over a user class with [Symbol.iterator]()
// The iterator method's argumentless body is inferred, but `this.n` is an untyped field,
// so the file is dynamic.

function* count(n) {
  yield n;
}
class Box {
  constructor(n) {
    this.n = n;
  }
  [Symbol.iterator]() {
    return count(this.n);
  }
}
let s = 0;
for (const x of new Box(1)) {
  s = s + x;
}
console.log(s);

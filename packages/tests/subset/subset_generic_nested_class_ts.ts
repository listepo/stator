// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — a generic class nested in a function would leak scope: tuples are
// collected per file and descriptors emitted at module scope. Top-level generic classes
// compile today.

function f() {
  class Local<T> {
    v: T;
    constructor(x: T) {
      this.v = x;
    }
  }
  return new Local<number>(1).v;
}
console.log(f());

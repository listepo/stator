// @mode: ts
// @verdict: static
// SUBSET.md: Generics — a generic class nested in a function specializes in place, one
// descriptor per tuple scoped to that evaluation, exactly like a nested ordinary class.
// The name must be unique across the program and no enclosing scope may bind a type
// parameter the tuple would close over.

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

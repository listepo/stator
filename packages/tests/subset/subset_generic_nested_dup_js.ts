// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — a nested generic class specializes under its source name, so two
// declarations sharing one would share one mangled tuple; the name must be unique across
// the program. A uniquely-named nested generic compiles today.

function f() {
  class Local<T> {
    v: T;
    constructor(x: T) {
      this.v = x;
    }
  }
  return new Local<number>(1).v;
}
function g() {
  class Local<T> {
    other: T;
    constructor(x: T) {
      this.other = x;
    }
  }
  return new Local<number>(2).other;
}
console.log(f());
console.log(g());

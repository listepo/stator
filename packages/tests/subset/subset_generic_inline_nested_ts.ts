// @mode: ts
// @verdict: static
// SUBSET.md: Generics — an inline generic arrow nested inside a function body compiles when
// it captures nothing: the worklist walks the enclosing specialization with its substitution
// in scope, so one literal yields one specialization per tuple.

function f(): number[] {
  return [1, 2].map(<T>(x: T): T => x);
}
console.log(f());

function outer<T>(x: T): T[] {
  return [x].map(<U>(y: U): U => y);
}
console.log(outer(7));
console.log(outer("s"));

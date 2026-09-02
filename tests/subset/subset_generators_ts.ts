// @mode: ts
// @verdict: static
// SUBSET.md: generator functions and `yield`
// Do not log the generator object: Node prints Object [Generator] {} and we print Generator {}.
// TNext is `undefined` rather than the default Unknown: a `yield` expression's type is TNext,
// and an Unknown there would make a file that never binds the injected value report dynamic.

function* counter(): Generator<number, void, undefined> {
  yield 1;
  yield 2;
}
let n: number = 0;
for (const x of counter()) {
  n += x;
}
console.log(n);

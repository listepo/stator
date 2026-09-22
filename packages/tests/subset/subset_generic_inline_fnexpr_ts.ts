// @mode: ts
// @verdict: static
// SUBSET.md: Generics — an inline generic function expression at a direct call argument
// specializes at the parameter's function type like an inline arrow does. A named one
// keeps its own name for printing; the specialization key stays the position.

function run(f: (x: number) => number, v: number): number {
  return f(v);
}
console.log(run(function twice<T>(x: T): number {
  return (x as unknown as number) * 2;
}, 21));
console.log([1, 2].map(function id<T>(x: T): T {
  return x;
}));

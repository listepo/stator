// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Generics — a specialization is a module-level function, so an inline arrow
// whose body reads an enclosing scope (here, the enclosing function's local) has no
// binding to read there and stays refused. A capture-free inline arrow compiles today.

function f(): number[] {
  const y = 10;
  return [1, 2].map(<T>(x: T): number => (x as unknown as number) + y);
}
console.log(f());

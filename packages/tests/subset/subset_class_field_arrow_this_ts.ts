// @mode: ts
// @verdict: static
// SUBSET.md: arrow functions capture via environment structs; a field-initializer arrow reads
// the constructor's receiver through the constructor's environment (plan.md §8 step 25).

class Counter {
  n = 0;
  inc = (): number => {
    this.n += 1;
    return this.n;
  };
}
console.log(new Counter().inc());

// @mode: ts
// @verdict: static
// SUBSET.md: calling a class field that holds a function

class Runner {
  run = (n: number): number => n + 1;
}
console.log(new Runner().run(1));

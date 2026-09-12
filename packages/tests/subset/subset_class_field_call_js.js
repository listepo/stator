// @mode: js
// @verdict: dynamic
// SUBSET.md: calling a class field that holds a function

class Runner {
  run = (n) => n + 1;
}
console.log(new Runner().run(1));

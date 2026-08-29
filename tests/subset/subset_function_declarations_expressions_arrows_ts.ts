// @mode: ts
// @verdict: static
// SUBSET.md: Function declarations, function expressions, arrow functions

function add(a: number, b: number): number {
  return a + b;
}
const mul: (x: number, y: number) => number = (x, y) => x * y;

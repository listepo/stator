// @mode: ts
// @verdict: static
// SUBSET.md: Function declarations, function expressions, arrow functions

const f: (n: number) => number = function fact(n: number): number {
  return n <= 1 ? 1 : n * fact(n - 1);
};
void f;

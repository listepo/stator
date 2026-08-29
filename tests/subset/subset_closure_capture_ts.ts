// @mode: ts
// @verdict: static
// SUBSET.md: Function declarations, function expressions, arrow functions

function counter(): () => number {
  let n: number = 0;
  return function (): number {
    n = n + 1;
    return n;
  };
}
const next: () => number = counter();

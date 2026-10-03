// @mode: ts
// @verdict: static
// SUBSET.md: Function declarations, function expressions, arrow functions
// plan.md §9 Task 6.28: an initializer's closure reads its own binding when it is called later.

const g = (n: number): number => (n <= 0 ? 0 : 1 + g(n - 1));
const o = { f: (n: number): number => (n <= 0 ? 0 : 1 + o.f(n - 1)) };
console.log(g(3), o.f(2));

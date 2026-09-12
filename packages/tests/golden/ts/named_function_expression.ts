// Named function expressions in ts mode: typed recursion via the inner name only.
const fact: (n: number) => number = function fact(n: number): number {
  return n <= 1 ? 1 : n * fact(n - 1);
};
console.log(fact(5));

const f: (n: number) => number = function inner(n: number): number {
  return n <= 1 ? 1 : n * inner(n - 1);
};
console.log(f(4));

// plan.md §9 Task 6.28: a function initializer may refer to its own binding. The closure captures
// the binding, not its value, so it reads the initialized binding whenever it is called later.

// An arrow bound by `const`, recursing deep enough to prove the call really recurses: 3000
// levels, not the card's 10000, because ASan frames overflow the stack near 6000 (plan-notes 347).
const g = (n: number): number => (n <= 0 ? 0 : 1 + g(n - 1));
console.log(g(3));
console.log(g(3000));

// An anonymous function expression: `walk` is the outer binding, not a self name.
const walk = function (n: number, path: string): string {
  return n <= 0 ? path : walk(n - 1, path + '/' + String(n));
};
console.log(walk(2, ''));

// The same shapes inside a function body, where the binding lives in its environment.
function main(): void {
  const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
  console.log(fact(4));
  const deep = (n: number): number => (n === 0 ? 0 : 1 + deep(n - 1));
  console.log(deep(3000));
}
main();

// A `let` binding: the closure sees what the binding holds when it runs, not what it held when
// the closure was made.
let h = (n: number): number => (n <= 0 ? 0 : 1 + h(n - 1));
console.log(h(5));
const first = h;
h = (n: number): number => n + 100;
console.log(first(5));

// Through an object literal: a property arrow and a method both read the finished object.
const o = {
  f: (n: number): number => (n <= 0 ? 0 : 1 + o.f(n - 1)),
  twice(n: number): number {
    return o.f(n) * 2;
  },
};
console.log(o.f(2));
console.log(o.twice(3));

// Behind a conditional and a logical operator, the function is still handed on, not called.
const pick: boolean = g(1) === 1;
const even: (n: number) => boolean = pick
  ? (n: number): boolean => (n === 0 ? true : !even(n - 1))
  : (n: number): boolean => n % 2 === 0;
console.log(even(7), even(10));
const odd: (n: number) => boolean =
  (pick && ((n: number): boolean => (n === 0 ? false : !odd(n - 1)))) ||
  ((n: number): boolean => n % 2 === 1);
console.log(odd(7), odd(10));

const n: number = 34;

function fib(value: number): number {
  return value < 2 ? value : fib(value - 1) + fib(value - 2);
}

console.log(fib(n));

function sum(a: number, ...rest: number[]): number {
  let total: number = a;
  for (const x of rest) {
    total += x;
  }
  return total;
}
console.log(sum(1, 2, 3));
console.log(sum(10));

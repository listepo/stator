// The GC hygiene corpus (plan.md §7 Task 4.5): ten million short-lived objects, each dead before
// the next is allocated. Nothing here retains anything — `sum` is a number — so a runtime that
// collects holds a flat RSS across the whole loop, and one that does not grows linearly by
// roughly `sizeof(object) * 10M`. The loop is deliberately dull: the point is the allocation rate,
// and any cleverness would only give a pass an excuse to fold it away.
let sum: number = 0;
for (let i: number = 0; i < 10000000; i = i + 1) {
  const point: { a: number; b: number } = { a: i, b: i + 1 };
  sum = sum + point.a + point.b;
}
console.log(sum);


// `console.table` in js mode. Nothing here is annotated, so the row shapes are whatever the
// checker infers from the literals -- which is the point: the table's columns come from the VALUES
// at run time, not from a type, so the two modes draw the same grid from the same data.
console.table([
  { name: 'a', n: 1 },
  { name: 'b', n: 22, extra: true },
]);
console.table([10, 'x']);
console.table({ first: { v: 1 }, second: { v: 2 } });
console.table([]);
console.table(42);

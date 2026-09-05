
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

// A console call is `undefined` as a VALUE, not just an effect. In C the entry points return void,
// so every one of these positions needs the value the type promised -- an arrow with an expression
// body returns it, and a binding stores it.
const logged = console.log('valued');
console.log(logged);
const viaArrow = () => console.log('from arrow');
console.log(viaArrow());
console.log(console.log('nested') === undefined);

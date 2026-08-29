// `typeof` in js mode (plan.md §5 Task 3.5).
//
// Nothing here is annotated, so nothing is narrowed and no boundary check is emitted: every value
// is already a tagged value on the dynamic path, and `typeof` is how an untyped program asks one
// what it is. That is the division of labour — the typed fixture beside this one gets checks
// because it makes claims, and this one makes none.

console.log(typeof 1);
console.log(typeof 's');
console.log(typeof true);
console.log(typeof undefined);
console.log(typeof null);
console.log(typeof [1, 2]);
console.log(typeof (0 / 0));
console.log(typeof -0);
console.log(typeof typeof 1);

function describe(x) {
  if (typeof x === 'string') {
    return `string of length ${x.length}`;
  }
  if (typeof x === 'number') {
    return `number ${x + 0}`;
  }
  if (typeof x === 'boolean') {
    return `boolean ${x}`;
  }
  return `something else: ${typeof x}`;
}

console.log(describe('hello'));
console.log(describe(7));
console.log(describe(true));
console.log(describe(null));
console.log(describe(undefined));

// The same function reached with the argument types swapped: one body, decided at runtime.
function lengthOrZero(x) {
  if (typeof x === 'string') {
    return x.length;
  }
  return 0;
}
console.log(lengthOrZero('abcd'));
console.log(lengthOrZero(99));

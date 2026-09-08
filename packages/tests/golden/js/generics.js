// The js-mode counterpart to monomorphization (plan.md §5 Task 3.4). A `.js` file cannot spell a
// type parameter at all, so there is nothing to specialize: the SAME untyped function is called at
// four argument types and stays one function, deciding at runtime what each value is. That is the
// division of labour the two modes are for — the typed file below `tests/golden/ts/generics.ts`
// gets one machine-typed copy per tuple, this one gets a single dynamic body.

function box(item) {
  return item;
}

console.log(box(42));
console.log(box(7));
console.log(box('hello'));
console.log(box(true));

function pair(first, second) {
  return `${first}/${second}`;
}
console.log(pair(1, 'one'));
console.log(pair('two', 2));

function twice(item) {
  return box(box(item));
}
console.log(twice(3.5));
console.log(twice('z'));

console.log(box(box(1)) + box(2));

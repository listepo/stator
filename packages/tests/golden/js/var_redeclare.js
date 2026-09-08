// `var x = 1; var x = 'a'` is ONE binding assigned twice -- legal JavaScript that TypeScript
// refuses as TS2403 only because it wants one type per name. js mode drops the refusal and widens
// the binding to the dynamic representation, the same widening TS2322 already gets for the
// assignment spelling of the same disagreement (plan.md §8 step 2a, plan-notes 194).
var value = 1;
var value = 'text';
console.log(value);
console.log(typeof value);

// The redeclaration does not reset it: the second initializer is just an assignment.
var count = 0;
count = count + 1;
var count = 'now a string';
console.log(count);
console.log(typeof count);

// Reads BETWEEN the two declarations see the first value, because there is only one binding.
var stage = 10;
console.log(stage + 1);
var stage = 'ten';
console.log(stage + '!');

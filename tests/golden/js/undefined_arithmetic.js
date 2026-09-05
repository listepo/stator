// `undefined` is an operand in the coercion table, not a mistake: every one of these has a value
// answer, and Test262 asserts exactly them in language/expressions/addition/S11.6.1_A3.1_*.
// TypeScript refuses the whole family as TS18050 "The value 'undefined' cannot be used here";
// js mode drops that refusal and runs the table (plan.md §8 step 2a, plan-notes 194).
console.log(1 + undefined);
console.log(undefined + true);
console.log(null + undefined);
console.log('n=' + undefined);
console.log(undefined - 1);
console.log(undefined * 2);

// The same operand reached through a binding rather than the literal keyword.
let missing;
console.log(missing + 1);
console.log(typeof (missing + 1));

// A miss in a fixed-shape object is the same value, and reads the same way.
const point = { x: 1 };
console.log(point.x + 1);

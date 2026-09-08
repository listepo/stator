// TS2695 "Left side of comma operator is unused and has no side effects" is a STYLE lint, not a
// refusal: the comma operator's answer is its right operand whether or not the left one did
// anything. js mode drops it (plan.md §8 step 2a, plan-notes 194).
console.log((0, 1));
console.log((1, 2, 3));

// A left operand that DOES have an effect is unaffected -- the checker never flagged it, and the
// evaluation order is what the golden pins.
let steps = 0;
const bump = () => {
  steps = steps + 1;
  return steps;
};
console.log((bump(), bump(), steps));

// Inside a for-header, which is where the operator earns its keep.
let j = 4;
for (let i = 0; i < j; i++, j--) {
  console.log(i);
  console.log(j);
}

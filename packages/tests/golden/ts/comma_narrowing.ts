// The comma operator's value is its right operand, typed as that operand (plan.md §11d T12.3):
// the right side reads `m` narrowed by the assignment on the left.
let m: { e: number } | undefined;
const v = (m = { e: 1 }, m.e);
console.log(v, m.e + 1);

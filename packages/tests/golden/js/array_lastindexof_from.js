// Array lastIndexOf with an explicit position in js mode (plan.md §8 step 19), including
// the explicit-undefined position the ts checker refuses: it truncates to 0.

const xs = [1, 2, 1];
console.log(xs.lastIndexOf(1, 1));
console.log(xs.lastIndexOf(1, -1));
console.log(xs.lastIndexOf(1, 99));
console.log(xs.lastIndexOf(1, -99));
console.log(xs.lastIndexOf(1));
console.log(xs.lastIndexOf(1, undefined));
console.log([1, 2, 3].lastIndexOf(9, 2));
const empty = [];
console.log(empty.lastIndexOf(1, 0));

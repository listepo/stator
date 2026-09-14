// Array concat in js mode (plan.md §8 step 19), including the non-array values the ts
// checker refuses: each spreads if it is an array and appends as a single element otherwise.

const a = [1];
const b = [2];
const c = [3];
console.log(a.concat(b, c));
console.log(a);
console.log(a.concat());
console.log([1].concat(5, [6, 7], 8));
const d = a.concat();
d.push(9);
console.log(d);
console.log(a);

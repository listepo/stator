// Array push/unshift with multiple (and zero) arguments (plan.md §8 step 19): the run
// appends or prepends in order, and the call answers the new length either way.

const xs: number[] = [1];
console.log(xs.push(2, 3));
console.log(xs);
console.log(xs.push());
console.log(xs);
const ys: number[] = [2];
console.log(ys.unshift(0, 1));
console.log(ys);
console.log(ys.unshift());
console.log(ys);

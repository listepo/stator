// Array push/unshift with multiple (and zero) arguments in js mode (plan.md §8 step 19):
// element types are inferred from the literals, so the variadic forms land unannotated.

const xs = [1];
console.log(xs.push(2, 3));
console.log(xs);
console.log(xs.push());
console.log(xs);
const ys = [2];
console.log(ys.unshift(0, 1));
console.log(ys);
console.log(ys.unshift());
console.log(ys);

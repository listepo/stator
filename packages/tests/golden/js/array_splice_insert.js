// Array splice in js mode (plan.md §8 step 19), including the coercion forms the ts
// checker refuses: an explicit undefined deleteCount deletes nothing, like an absent one.

let xs = [1, 2, 3];
console.log(xs.splice(1, 1, 9, 8));
console.log(xs);
xs = [1, 2, 3];
console.log(xs.splice(1, 0, 9, 8));
console.log(xs);
xs = [1, 2, 3];
console.log(xs.splice(-1, 1, 9));
console.log(xs);
xs = [1, 2, 3];
console.log(xs.splice(1, 99, 9));
console.log(xs);
xs = [1, 2];
console.log(xs.splice(1));
console.log(xs);
xs = [1, 2, 3];
console.log(xs.splice(1, undefined, 9));
console.log(xs);

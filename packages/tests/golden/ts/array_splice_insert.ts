// Array splice in every landed form (plan.md §8 step 19): the insertion form removes the
// span and inserts the run at its start, the one-argument form deletes to the end, and the
// two-argument form removes only. Each answers the removed run and mutates in place.

let xs: number[] = [1, 2, 3];
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
console.log(xs.splice(1, 1));
console.log(xs);

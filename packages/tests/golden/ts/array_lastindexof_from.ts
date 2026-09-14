// Array lastIndexOf with an explicit position (plan.md §8 step 19): the search runs
// backwards from `from` — relative when negative, clamped into the array — while the absent
// form searches the whole array. An explicit undefined examines only index 0.

const xs: number[] = [1, 2, 1];
console.log(xs.lastIndexOf(1, 1));
console.log(xs.lastIndexOf(1, -1));
console.log(xs.lastIndexOf(1, 99));
console.log(xs.lastIndexOf(1, -99));
console.log(xs.lastIndexOf(1));
console.log([1, 2, 3].lastIndexOf(9, 2));
console.log([0].lastIndexOf(-0));
const empty: number[] = [];
console.log(empty.lastIndexOf(1, 0));

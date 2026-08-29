// @mode: js
// @verdict: static
// SUBSET.md: for...of loop

const arr = [1, 2, 3];
let sum = 0;
for (const x of arr) {
  sum += x;
}
console.log(sum);

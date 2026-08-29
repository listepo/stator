// @mode: ts
// @verdict: static
// SUBSET.md: for...of loop

// Iteration binds the ELEMENT type, not `T | undefined`: the loop never runs past the end. That is
// what keeps typed iteration static while `arr[i]` is dynamic (plan-notes 53).
const arr: number[] = [1, 2, 3];
let sum: number = 0;
for (const x of arr) {
  sum += x;
}
console.log(sum);

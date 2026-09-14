// @mode: js
// @verdict: static
// SUBSET.md: `for-in` over an array, a string and an object literal (plan.md §8 step 38):
// the loop enumerates the visited keys — indices for arrays and strings — and visits
// nothing for a number, exactly like the pinned Node.

for (const k in [10, 20]) {
  console.log(k);
}
const s = "ab";
for (const k in s) {
  console.log(k);
}
for (const k in { x: 1 }) {
  console.log(k);
}
for (const k in 5) {
  console.log("never");
}
console.log("done");

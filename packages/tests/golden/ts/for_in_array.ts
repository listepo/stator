// `for-in` over an array, a string and an object literal (plan.md §8 step 38):
// indices for arrays and strings, keys for objects, silence for a number.
for (const k in [10, 20]) {
  console.log(k);
}
const s: string = "ab";
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

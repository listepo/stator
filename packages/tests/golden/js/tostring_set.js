// plan.md §8 step 29: ToString of a Set answers `[object Set]` (Symbol.toStringTag),
// not `[object Object]`.
const s = new Set();
s.add(1);
console.log("" + s);
console.log(`${s}`);

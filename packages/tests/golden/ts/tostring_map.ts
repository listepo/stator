// plan.md §8 step 29: ToString of a Map answers `[object Map]` (Symbol.toStringTag),
// not `[object Object]`.
const m = new Map<string, number>();
m.set("a", 1);
console.log("" + m);
console.log(`${m}`);

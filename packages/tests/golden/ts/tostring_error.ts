// plan.md §8 step 29: ToString of an Error is `Error.prototype.toString`
// (`name: message` with the empty-side rules), not `[object Object]`.
console.log(`${new Error("boom")}`);
console.log("" + new TypeError("bad"));
console.log(`${new Error()}`);
console.log("" + new RangeError(""));

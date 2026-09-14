// plan.md §8 step 29: ToString of a RegExp is `RegExp.prototype.toString`
// (`/source/flags`), not `[object Object]`.
console.log("" + /abc/g);
console.log(`${/abc/}`);
console.log("" + /abc/gi);

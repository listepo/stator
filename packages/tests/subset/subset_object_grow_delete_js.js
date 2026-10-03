// @mode: js
// @verdict: dynamic
// SUBSET.md: Assignment to a property the object's shape does not declare

// A grown name lives in the overflow table, which can lose it again.
const o = { a: 1 };
o.extra = 2;
delete o.extra;
console.log(o.extra, Object.keys(o));

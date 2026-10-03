// @mode: js
// @verdict: dynamic
// SUBSET.md: Assignment to a property the object's shape does not declare

// The literal's inferred shape has no `extra`, so the write grows the object's overflow table
// (docs/VALUE.md §4.24) and the read answers from it.
const o = { a: 1 };
o.extra = 2;
console.log(o.extra);

// @mode: js
// @verdict: static
// SUBSET.md: Date
// The same members in js mode: the checker infers the receiver from `new Date(...)`, so the calls
// resolve statically without an annotation anywhere.
const d = new Date(0);
console.log(d.getUTCFullYear());
console.log(d.toISOString());
console.log(Date.UTC(2024, 1, 29));

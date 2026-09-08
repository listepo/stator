// @mode: js
// @verdict: static
// SUBSET.md: Date
// The same in js mode: the checker infers the Date from the constructor, so no annotation is
// needed for the receiver's members to resolve statically.
const d = new Date();
console.log(d.getUTCFullYear() > 2000);

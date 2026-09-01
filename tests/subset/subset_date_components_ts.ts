// @mode: ts
// @verdict: static
// SUBSET.md: Date
// The component constructor is LOCAL time -- `new Date(2024, 1, 29)` is midnight where the machine
// stands, not in UTC -- which is the only thing separating it from `Date.UTC`, whose arithmetic it
// otherwise shares. Two components are the minimum form; the rest default to day 1 and zero.
const d = new Date(2024, 1, 29);
console.log(d.getTime());
console.log(new Date(2024, 11, 31, 23, 59, 59, 999).getTime());

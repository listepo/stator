// @mode: ts
// @verdict: not-yet
// @code: STA1210
// SUBSET.md: Date
// The component constructor is LOCAL time -- `new Date(2024, 1, 29)` is midnight where the
// machine stands, not in UTC -- so it is slice B's, not slice A's. `Date.UTC` is the same
// arithmetic with the answer pinned, and IS in slice A.
const d = new Date(2024, 1, 29);
console.log(d.getTime());

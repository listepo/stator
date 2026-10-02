// @mode: ts
// @verdict: error
// @code: STA1108
// SUBSET.md: Assignment to a property the object's shape does not declare
const o = { a: 1 };
delete o.extra;

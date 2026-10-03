// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Function declarations, function expressions, arrow functions
// plan.md §9 Task 6.28: a callback handed to a call may run before its own binding is
// initialized, which Node answers with a TDZ ReferenceError and Stator has no check for.

const call = (cb) => cb();
const y = call(() => y);
console.log(y);

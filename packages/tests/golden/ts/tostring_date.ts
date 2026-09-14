// plan.md §8 step 29: ToString of a Date is the `Date.prototype.toString` form,
// not `[object Object]`; `Invalid Date` for a non-finite time value.
// TZ-pinned like every golden (run.ts PINNED_ENV): the zone half is UTC's.
console.log("" + new Date(0));
console.log(`${new Date(Date.UTC(2024, 1, 29, 12, 34, 56))}`);
console.log("" + new Date(NaN));

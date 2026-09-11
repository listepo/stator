// Date setters on an Invalid Date (plan-notes 222). §21.4.4.21 recovers when the time value is NaN
// by substituting +0 for it -- but only for the components the CALLER did not supply: an explicit
// NaN argument is ToNumber(NaN) and the result must be NaN. The recovery could not tell the two
// apart, so `setUTCFullYear(NaN)` mutated an invalid date into year 0 and `setUTCFullYear(2024)`
// could not recover at all once the lowering padded its optional arguments with undefined.
const a = new Date(NaN);
console.log(a.setUTCFullYear(NaN));
console.log(a.getTime());
const b = new Date(NaN);
console.log(b.setUTCFullYear(2024));
console.log(b.toISOString());
const c = new Date(NaN);
console.log(c.setUTCFullYear(2024, NaN));
const d = new Date(NaN);
console.log(d.setFullYear(NaN));
const e = new Date(NaN);
console.log(e.setUTCMonth(0));
const f = new Date(NaN);
console.log(f.setUTCFullYear(2024, 5, 15));
console.log(f.toISOString());
const g = new Date(Date.UTC(2020, 0, 2, 3, 4, 5));
console.log(g.setUTCHours(6));
console.log(g.toISOString());
console.log(g.setUTCFullYear(2021));
console.log(g.toISOString());

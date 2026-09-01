// @mode: ts
// @verdict: static
// SUBSET.md: Date
// Slice A's core: a Date is a fixed-layout heap object with one double in it, and every UTC
// member is a direct runtime call over that double -- no shape, no dispatch, nothing dynamic.
const d = new Date(0);
console.log(d.getUTCFullYear());
console.log(d.toISOString());
console.log(Date.UTC(2024, 1, 29));
console.log(Date.parse('2024-02-29T12:00:00Z'));

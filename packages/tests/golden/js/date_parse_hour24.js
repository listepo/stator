// Hour 24 in `Date.parse` is midnight at the END of the day, valid only with zero minutes,
// seconds and milliseconds (plan.md §8 step 21d). Anything past it is NaN; a bare `24:00`
// defaults the missing seconds to zero and stays valid.

console.log(Date.parse('2024-01-01T24:00:00Z'));
console.log(Date.parse('2024-01-01T24:00:00.000Z'));
console.log(Date.parse('2024-01-01T24:00Z'));
console.log(Date.parse('2024-01-01T24:00:01Z'));
console.log(Date.parse('2024-01-01T24:01:00Z'));
console.log(Date.parse('2024-01-01T24:00:00.001Z'));
console.log(Date.parse('2024-01-01T25:00:00Z'));
console.log(Date.parse('2024-01-01T23:59:59Z'));

// Midnight at the end of the day IS the start of the next one.
console.log(Date.parse('2024-01-02T00:00:00Z') === Date.parse('2024-01-01T24:00:00Z'));
console.log(Date.parse('2024-01-01T24:00:00+00:00'));
console.log(Date.parse('2024-01-01T24:00:01+00:00'));

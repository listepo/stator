// `Date.parse` ISO leniencies (plan.md §8 step 32): fractional seconds accept 1+
// digits — scaled or truncated to milliseconds, not exactly 3 — and an offset accepts
// `+HHMM` alongside `+HH:MM`. Every form here carries an explicit offset, so the answers
// are TZ-independent. The hour-24 lines are step 21's case under the new fraction
// parsing: a nonzero fraction at ANY precision keeps it NaN.

console.log(Date.parse('2020-01-01T00:00:00.5Z'));
console.log(Date.parse('2020-01-01T00:00:00.50Z'));
console.log(Date.parse('2020-01-01T00:00:00.12Z'));
console.log(Date.parse('2020-01-01T00:00:00.123456Z'));
console.log(Date.parse('2020-01-01T00:00:00.0000Z'));
console.log(Date.parse('2020-01-01T00:00:00.0009Z'));
console.log(Date.parse('2020-01-01T00:00:00+0530'));
console.log(Date.parse('2020-01-01T00:00:00-0800'));
console.log(Date.parse('2020-01-01T00:00:00.5+0530'));
console.log(Date.parse('2020-01-01T00:00:00.123456+0530'));
console.log(Date.parse('2020-01-01T00:00:00+05:30'));
console.log(Date.parse('2024-01-01T24:00:00.0000Z'));
console.log(Date.parse('2024-01-01T24:00:00.0001Z'));
console.log(Date.parse('2024-01-01T24:00:00.5Z'));
console.log(Date.parse('2024-01-01T24:00:00+0530'));
console.log(Date.parse('2020-01-01T00:00:00.Z'));
console.log(Date.parse('2020-01-01T00:00:00+05'));
console.log(Date.parse('2020-01-01T00:00:00+05:99'));
console.log(Date.parse('2020-01-01T00:00:00+0599'));

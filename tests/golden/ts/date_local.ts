// The LOCAL field family and the component constructor (§21.4.2.1, §21.4.4.x). The golden runner
// pins `TZ=UTC` on both sides -- see tests/golden/run.ts -- so what this fixture proves is the
// WIRING, end to end: that every local accessor reaches its runtime function, that the seven-
// component constructor pads and rolls exactly as `Date.UTC` does, and that under UTC the local
// family answers what the UTC family answers. The zone-dependent half (DST gaps, folds, half-hour
// offsets) cannot be asked here at all and is proved in tests/unit/date-local.test.ts instead.

const d = new Date(Date.UTC(2024, 6, 15, 13, 45, 30, 250));

// Under UTC these two rows are the same numbers. That is the point: a local getter wired to the
// wrong runtime function would still print SOMETHING, and only agreement pins it.
console.log(d.getFullYear());
console.log(d.getUTCFullYear());
console.log(d.getMonth());
console.log(d.getUTCMonth());
console.log(d.getDate());
console.log(d.getUTCDate());
console.log(d.getDay());
console.log(d.getUTCDay());
console.log(d.getHours());
console.log(d.getUTCHours());
console.log(d.getMinutes());
console.log(d.getMinutes());
console.log(d.getSeconds());
console.log(d.getUTCSeconds());
console.log(d.getMilliseconds());
console.log(d.getUTCMilliseconds());
console.log(d.getTimezoneOffset());

// An Invalid Date answers NaN through every one of them, offset included.
const invalid = new Date(NaN);
console.log(invalid.getFullYear());
console.log(invalid.getMonth());
console.log(invalid.getDate());
console.log(invalid.getDay());
console.log(invalid.getHours());
console.log(invalid.getMinutes());
console.log(invalid.getSeconds());
console.log(invalid.getMilliseconds());
console.log(invalid.getTimezoneOffset());

// The component constructor, from the two-argument minimum up to all seven. Omitted components
// default to day 1 and zero, which is why the first three land on the same instant.
console.log(new Date(2024, 0).toISOString());
console.log(new Date(2024, 0, 1).toISOString());
console.log(new Date(2024, 0, 1, 0, 0, 0, 0).toISOString());
console.log(new Date(2024, 11, 31, 23, 59, 59, 999).toISOString());

// Out-of-range components ROLL rather than clamp, in every position and in both directions.
console.log(new Date(2024, 12, 1).toISOString());
console.log(new Date(2024, 13, 40, 25, 70, 70, 1500).toISOString());
console.log(new Date(2024, -1, 0).toISOString());
console.log(new Date(2024, 1, 30).toISOString());
console.log(new Date(2023, 1, 29).toISOString());

// The two-digit-year rule (§21.4.2.1 step 8): 0..99 means 1900+y, and ONLY in the constructor.
console.log(new Date(0, 0, 1).toISOString());
console.log(new Date(99, 11, 31).toISOString());
console.log(new Date(100, 0, 1).toISOString());
console.log(new Date(1899, 0, 1).toISOString());

// The local setters. Each returns the new time value and mutates in place; the trailing components
// it is not given keep what they had.
const m = new Date(2024, 5, 15, 12, 30, 45, 500);
console.log(m.setMilliseconds(1));
console.log(m.toISOString());
console.log(m.setSeconds(1));
console.log(m.toISOString());
console.log(m.setSeconds(2, 2));
console.log(m.toISOString());
console.log(m.setMinutes(3, 3, 3));
console.log(m.toISOString());
console.log(m.setHours(4, 4, 4, 4));
console.log(m.toISOString());
console.log(m.setDate(5));
console.log(m.toISOString());
console.log(m.setMonth(6, 6));
console.log(m.toISOString());
console.log(m.setFullYear(2020, 7, 7));
console.log(m.toISOString());

// A setter rolling out of range, and the year setter's Invalid Date recovery -- the one case where
// a setter on a NaN date produces a date rather than propagating.
const roll = new Date(2024, 0, 31, 12, 0, 0, 0);
console.log(roll.setMonth(1));
console.log(roll.toISOString());
const recovered = new Date(NaN);
console.log(recovered.setDate(5));
console.log(recovered.setFullYear(2024));
console.log(recovered.toISOString());

// `toDateString` is the LOCAL calendar date with no time and no zone name in it -- which is what
// makes it landable when `toString` and `toTimeString` are not: those two append the host zone's
// long display name (`(Central European Summer Time)`), which Node reads from ICU and libc cannot
// produce. The negative year pads to FOUR digits here and to six in `toUTCString`; the spec says
// so in two places, and Node prints both.
console.log(d.toDateString());
console.log(invalid.toDateString());
console.log(new Date(Date.UTC(2024, 0, 5)).toDateString());
console.log(new Date(Date.UTC(1899, 11, 31)).toDateString());
console.log(new Date(-62198755200000).toDateString());
console.log(new Date(-62198755200000).toUTCString());
console.log(new Date(0).toDateString());

// The accessors compose like any other expression.
const list = [new Date(2024, 0, 1), new Date(2024, 6, 4), new Date(2024, 11, 25)];
for (const item of list) {
  console.log(`${item.getFullYear()}-${item.getMonth() + 1} day ${item.getDay()}`);
}
const first = new Date(2024, 0, 1);
const last = new Date(2024, 11, 25);
console.log(first.getTime() < last.getTime());

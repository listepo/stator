// The same surface in js mode. Nothing is annotated, so what makes each receiver a Date is the
// checker's own inference from `new Date(...)` -- and the component constructor is the form that
// most needs saying so, since seven bare numbers look like nothing in particular until the callee
// is known. Under the runner's pinned `TZ=UTC` the local family answers the UTC family's numbers;
// the zone-dependent half lives in tests/unit/date-local.test.ts.

const d = new Date(2024, 2, 9, 8, 7, 6, 5);
console.log(d.toISOString());
console.log(d.getFullYear());
console.log(d.getMonth());
console.log(d.getDate());
console.log(d.getDay());
console.log(d.getHours());
console.log(d.getMinutes());
console.log(d.getSeconds());
console.log(d.getMilliseconds());
console.log(d.getTimezoneOffset());
console.log(d);

// A setter's return value is the new time value, which composes straight into arithmetic.
const t = new Date(2024, 0, 1);
console.log(t.setDate(t.getDate() + 45));
console.log(t.toISOString());
console.log(t.getMonth() === 1);

// Walking a month's worth of dates through the local accessors: the weekday has to advance and
// wrap, and the date has to roll into the next month on its own.
const walk = new Date(2024, 1, 26, 12, 0, 0, 0);
let weekends = 0;
for (let i = 0; i < 10; i++) {
  const day = walk.getDay();
  if (day === 0 || day === 6) {
    weekends = weekends + 1;
  }
  console.log(`${walk.getMonth()}/${walk.getDate()} day ${day}`);
  walk.setDate(walk.getDate() + 1);
}
console.log(weekends);

console.log(d.toDateString());
console.log(new Date(NaN).toDateString());
console.log(walk.toDateString());

// 2024 is a leap year, 2023 is not -- and the constructor says so by rolling Feb 29 differently.
console.log(new Date(2024, 1, 29).getDate());
console.log(new Date(2023, 1, 29).getDate());
console.log(new Date(2024, 1, 29).getMonth());
console.log(new Date(2023, 1, 29).getMonth());

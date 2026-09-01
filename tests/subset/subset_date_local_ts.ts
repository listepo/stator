// @mode: ts
// @verdict: static
// SUBSET.md: Date
// Every LOCAL-time member reads the host time zone -- a property of the environment the binary
// runs in rather than of the program. That makes them unprovable by a golden diff against Node
// (libc's tzdb and Node's ICU need not agree) but not undecidable: the receiver is a Date, the
// member is in the closed table, and the call compiles to one C function like any other.
const d = new Date(0);
console.log(d.getFullYear());
console.log(d.getMonth());
console.log(d.getDate());
console.log(d.getDay());
console.log(d.getHours());
console.log(d.getMinutes());
console.log(d.getSeconds());
console.log(d.getMilliseconds());
console.log(d.getTimezoneOffset());
d.setFullYear(2024, 1, 29);
d.setMonth(5, 15);
d.setDate(1);
d.setHours(1, 2, 3, 4);
d.setMinutes(5, 6, 7);
d.setSeconds(8, 9);
d.setMilliseconds(10);
console.log(d.getTime());

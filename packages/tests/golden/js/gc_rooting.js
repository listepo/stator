// Allocation pressure on two runtime paths that build a value while allocating (plan-notes 222).
// Boehm collects on allocation volume, so the loop count is the pressure: with the half-built value
// held only in a C local -- invisible to the collector, because a NaN-boxed word is not a pointer
// by any conservative test -- a collection under pressure freed it and the next write went into
// reclaimed memory. The answers below are what Node prints; before the fix the first loop reported
// lengths in the tens of millions and the second lost whole iterations.

const re = /(a)/;
const subject = 'a';
let lengths = 0;
for (let i = 0; i < 200000; i++) {
  const m = subject.match(re);
  lengths += m.length;
}
console.log(lengths);

let total = 0;
for (let i = 0; i < 200000; i++) {
  const parsed = JSON.parse('[1,2,3]');
  total += (parsed + []).length;
}
console.log(total);

// The same operator path with objects on both sides, so both ToPrimitive calls allocate.
let joined = 0;
for (let i = 0; i < 100000; i++) {
  const pair = JSON.parse('[[1],[2]]');
  joined += (pair[0] + pair[1]).length;
}
console.log(joined);

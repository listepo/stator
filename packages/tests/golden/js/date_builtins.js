// The same slice-A surface in js mode. Nothing is annotated, so what proves each call is a Date
// operation is the checker's own inference from `new Date(...)` -- and a Date reaching an UNTYPED
// parameter loses that proof, exactly as a regexp does, so every receiver here is a local binding
// the checker can still see.

const d = new Date('2024-02-29T12:34:56.789Z');
console.log(d.getTime());
console.log(d.getUTCFullYear());
console.log(d.getUTCMonth());
console.log(d.getUTCDate());
console.log(d.getUTCDay());
console.log(d.toISOString());
console.log(d.toUTCString());
console.log(d);

// A time value computed and fed back through the constructor: number in, Date out, number out.
const shifted = new Date(d.getTime() + 86400000);
console.log(shifted.toISOString());
console.log(shifted.getUTCDate());
console.log(shifted.getUTCMonth());

// The statics, both of which answer plain numbers and compose into arithmetic like any other.
const start = Date.UTC(2024, 0, 1);
const end = Date.parse('2024-12-31T23:59:59.999Z');
console.log(start);
console.log(end);
console.log((end - start) / 86400000 > 365);
console.log(new Date(start).toISOString());

// A setter answers the new time value, and the receiver keeps it -- both halves in one loop.
const walk = new Date(0);
let i = 0;
while (i < 4) {
  walk.setUTCFullYear(1970 + i * 10);
  console.log(walk.toISOString());
  i = i + 1;
}

// Serialization, and an Invalid Date's `null`.
console.log(JSON.stringify({ when: d, tag: 'x' }));
console.log(JSON.stringify(new Date(NaN)));
console.log(new Date(NaN).toJSON());
console.log(new Date(NaN));

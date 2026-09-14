// Duplicate object-literal keys: legal JavaScript, last wins (plan.md §8 step 26).
// js mode takes the value; ts mode refuses with STA0012.

const a = { x: 1, x: 2 };
console.log(a.x);

const b = { x: 1, x: "s", x: true };
console.log(JSON.stringify(b));
console.log(Object.keys(b).join(","));

const x = 1;
const c = { x, x: 2 };
console.log(c.x);

const d = { "x": 1, x: 2 };
console.log(JSON.stringify(d));

let n = 0;
function f() {
  n += 1;
  return 10;
}
const e = { x: f(), x: 2 };
console.log(JSON.stringify([e.x, n]));

function dup(v) {
  return { x: 1, x: v };
}
console.log(dup(2).x);

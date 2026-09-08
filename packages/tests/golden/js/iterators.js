// Array/Map/Set keys/values/entries: inlined for-of, and boxed `next()` when stored.
const xs = [10, 20];
for (const k of xs.keys()) {
  console.log(k);
}
for (const v of xs.values()) {
  console.log(v);
}
for (const e of xs.entries()) {
  console.log(e);
}

const kit = xs.keys();
console.log(kit.next());
console.log(kit.next());
console.log(kit.next());

const m = new Map();
m.set("a", 1);
m.set("b", 2);
for (const k of m.keys()) {
  console.log(k);
}
for (const v of m.values()) {
  console.log(v);
}
for (const e of m.entries()) {
  console.log(e);
}
const mkit = m.keys();
console.log(mkit.next());

const s = new Set();
s.add(1);
s.add(2);
for (const k of s.keys()) {
  console.log(k);
}
for (const v of s.values()) {
  console.log(v);
}
for (const e of s.entries()) {
  console.log(e);
}
const sit = s.values();
console.log(sit.next());
console.log(sit.next());
console.log(sit.next());

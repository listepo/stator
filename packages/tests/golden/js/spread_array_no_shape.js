// Spread of an array without a fixed shape into an object literal: indices become
// string keys in ascending order. The result is dynamic, so reads go through the shape
// table: `o.length` is `undefined` (length is not own) exactly as in Node.
const a = [1, 2];
const o = { ...a };
console.log(o);
console.log(JSON.stringify(o));
console.log(o["0"]);
console.log(o.length);
console.log(Object.keys(o));

// Two array spreads merge left to right; a later index overwrites in place.
const b = ["s"];
console.log({ ...a, ...b });
console.log(JSON.stringify({ ...a, ...b }));

// A computed key beside the spread keeps its position after the indices.
function k() {
  return "dyn";
}
console.log({ ...a, [k()]: 3 });

// A spread nested as a value stays a dynamic object read back dynamically.
const outer = { y: { ...a } };
console.log(outer.y);

// An empty array contributes nothing, and a call source evaluates once.
const e = [];
console.log(JSON.stringify({ ...e }));
let n = 0;
function getArr() {
  n += 1;
  return [1, 2];
}
console.log(JSON.stringify({ ...getArr() }));
console.log(n);

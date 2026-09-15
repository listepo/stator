// Spread of an array without a fixed shape into an object literal: indices become
// string keys in ascending order. The result is dynamic, so reads go through the shape
// table: `o.length` is `undefined` (length is not own) exactly as in Node.
const a: number[] = [1, 2];
const o = { ...a };
console.log(o);
console.log(JSON.stringify(o));
console.log(o["0"]);
console.log(o.length);
console.log(Object.keys(o));

// Two array spreads merge left to right; a later index overwrites in place.
const b: string[] = ["s"];
console.log({ ...a, ...b });
console.log(JSON.stringify({ ...a, ...b }));

// A computed key beside the spread keeps its position after the indices.
function k(): string {
  return "dyn";
}
console.log({ ...a, [k()]: 3 });

// A spread nested as a value stays a dynamic object read back dynamically.
const outer = { y: { ...a } };
console.log(outer.y);

// An empty array contributes nothing, and a call source evaluates once.
const e: number[] = [];
console.log(JSON.stringify({ ...e }));
let n = 0;
function getArr(): number[] {
  n += 1;
  return [1, 2];
}
console.log(JSON.stringify({ ...getArr() }));
console.log(n);

// A dynamically-annotated binding takes the same path with the same answers -- and the
// annotation rescues even a mixed spread, because the binding is Unknown either way.
const o3: { [k: string]: unknown } = { ...a };
console.log(JSON.stringify(o3));
const o4: { [k: string]: unknown } = { ...a, x: 9 };
console.log(JSON.stringify(o4));

// Under the same annotation a methods-carrying spread joins the fold: its fields expand
// into the run and its methods ride the whole-fragment copy.
const m = {
  v: 1,
  get(): number {
    return 7;
  },
};
const r1: { [k: string]: unknown } = { ...a, ...m };
console.log(JSON.stringify(r1));
console.log((r1.get as () => number)());

// Object literals on the dynamic path. The shape still comes from the TYPE the checker inferred, so
// an untyped file gets the same fixed-slot layout a typed one does -- the values in it are simply
// whatever flowed there.

const point = { x: 1, y: 2 };
console.log(point);
console.log(point.x);
console.log(point.y);

// Same keys, same inferred types, one shape.
const other = { x: 10, y: 20 };
console.log(other);
console.log(other.x + point.y);

// Written order is slot order, here `y` first.
const flipped = { y: 3, x: 4 };
console.log(flipped);
console.log(flipped.x);

// Entry values run left to right, once each, before the object exists.
let steps = 0;
function step(n) {
  steps = steps + 1;
  return n * steps;
}
const ordered = { a: step(1), b: step(1), c: step(1) };
console.log(ordered);
console.log(steps);

// A literal inside a literal, and a chained read through it.
const tree = { name: 'root', child: { name: 'leaf', depth: 2 } };
console.log(tree);
console.log(tree.child.name);
console.log(tree.child.depth);

// No slots at all.
const nothing = {};
console.log(nothing);

// Returned, collected, iterated -- an ordinary value with no annotation in sight.
function at(n) {
  return { v: n, label: `#${n}` };
}
console.log(at(7));
console.log(at(7).label);
const many = [at(1), at(2)];
console.log(many);
for (const item of many) {
  console.log(item.v);
}

// A class instance is just another entry value.
class Tag {
  constructor(name) {
    this.name = name;
  }
}
const mixed = { n: 1.5, s: 'x', b: true, tag: new Tag('t'), list: [1, 2] };
console.log(mixed);
console.log(mixed.tag.name);
console.log(mixed.b);

// Eight entries stay one per line or one per row exactly as Node decides.
const wide = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 };
console.log(wide);

const long = {
  first: 'a string long enough to matter',
  second: 'another string long enough to matter',
  third: 'and a third',
};
console.log(long);

// An object literal is the same allocation a class instance is, with the descriptor derived from
// the TYPE instead of a declaration. Two literals with the same keys and types share one shape --
// and the shape has no constructor name, which is the visible difference when it prints.

const point = { x: 1, y: 2 };
console.log(point);
console.log(point.x);
console.log(point.y);

// Same keys, same types, so the same layout -- and therefore assignable to a binding of the first.
const other: { x: number; y: number } = { x: 10, y: 20 };
console.log(other);
console.log(other.x + point.y);

// The key set is what the source wrote, in the order it wrote it: `y` before `x` here.
const flipped = { y: 3, x: 4 };
console.log(flipped);
console.log(flipped.x);

// Values are evaluated left to right, exactly once, before the object is complete.
let steps = 0;
function step(n: number): number {
  steps = steps + 1;
  return n * steps;
}
const ordered = { a: step(1), b: step(1), c: step(1) };
console.log(ordered);
console.log(steps);

// Nesting: an entry may be another literal, and a field read may chain through it.
const tree = { name: 'root', child: { name: 'leaf', depth: 2 } };
console.log(tree);
console.log(tree.child.name);
console.log(tree.child.depth);

// An empty literal has no slots and prints as Node prints it.
const nothing = {};
console.log(nothing);

// A literal is an ordinary value: it can be returned, passed, held in an array, and rebuilt.
function at(n: number): { v: number; label: string } {
  return { v: n, label: `#${n}` };
}
console.log(at(7));
console.log(at(7).label);
const many = [at(1), at(2)];
console.log(many);
for (const item of many) {
  console.log(item.v);
}

// Every field type the model has, including one holding a class instance.
class Tag {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
}
const mixed = { n: 1.5, s: 'x', b: true, tag: new Tag('t'), list: [1, 2] };
console.log(mixed);
console.log(mixed.tag.name);
console.log(mixed.b);

// Eight entries: an object never groups its entries into columns the way an array does.
const wide = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 };
console.log(wide);

// Past the 80-column budget the entries break one per line, with the same indent rules a class
// instance gets -- minus the name, which a literal does not have.
const long = {
  first: 'a string long enough to matter',
  second: 'another string long enough to matter',
  third: 'and a third',
};
console.log(long);

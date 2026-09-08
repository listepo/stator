// The js-mode twin of tests/golden/ts/object_accessors.ts: the same accessor semantics with no
// annotations at all, so the shape-table path is reached through untyped code rather than through
// a type the checker refused to lay out (docs/VALUE.md §4.15).

const o = {
  val: 21,
  get double() {
    return this.val * 2;
  },
  set double(v) {
    this.val = v / 2;
  },
};
console.log(o.double);
console.log(o);
o.double = 100;
console.log(o.val);
console.log(Object.keys(o));
console.log(Object.values(o));

const halves = {
  get g() {
    return 'read';
  },
  set s(v) {
    console.log(`set ${v}`);
  },
};
console.log(halves);
console.log(halves.g);
console.log(halves.s);
halves.s = 'x';

function boxes() {
  const built = [];
  for (let i = 0; i < 3; i++) {
    const captured = i * 10;
    built.push({
      get at() {
        return captured;
      },
    });
  }
  return built;
}
for (const box of boxes()) {
  console.log(box.at);
}

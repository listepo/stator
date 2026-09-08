// Getters and setters on an object literal (docs/VALUE.md §4.15, plan.md §8 step 12c).
//
// An accessor member makes the whole literal dynamic — a fixed layout would store the getter's
// result once instead of calling it per read — so a sibling data property resolves through the
// shape table too. What this pins beyond "the getter runs": util.inspect does NOT run it, the
// setter takes a write in place of a slot store, Object.keys does not call anything while
// Object.values and Object.entries do, a get-only property reads through and a set-only one reads
// `undefined`, and two objects built by one literal in a loop keep SEPARATE getters despite
// sharing a shape — the case that put the pair in the object's slot instead of on the shape.

const o = {
  val: 21,
  get double(): number {
    return this.val * 2;
  },
  set double(v: number) {
    this.val = v / 2;
  },
};
console.log(o.double);
console.log(o);
o.double = 100;
console.log(o.val);
console.log(o.double);
console.log(Object.keys(o));
console.log(Object.values(o));
console.log(Object.entries(o));
console.log(JSON.stringify(o));

const halves = {
  get g(): string {
    return 'read';
  },
  set s(v: string) {
    console.log(`set ${v}`);
  },
};
console.log(halves);
console.log(halves.g);
console.log(halves.s);
halves.s = 'x';

// Three objects from ONE literal: they share a shape and must NOT share a getter. This is why the
// get/set pair rides in the object's slot rather than on the shape it has in common with its
// siblings (docs/VALUE.md §4.15).
function boxes(): { get at(): number }[] {
  const built: { get at(): number }[] = [];
  for (let i = 0; i < 3; i++) {
    const captured = i * 10;
    built.push({
      get at(): number {
        return captured;
      },
    });
  }
  return built;
}
for (const box of boxes()) {
  console.log(box.at);
}

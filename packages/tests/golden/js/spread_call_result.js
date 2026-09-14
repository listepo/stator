// Spread of arbitrary fixed-shape expressions: one evaluation per spread operand, source
// order against interleaved entries, override rules, and class sources whose prototype
// members stay behind (plan.md §8 step 12c residue). Evaluation order and count are pinned
// by output interleaving: each effect prints when it runs.
function make(tag) {
  console.log(`make:${tag}`);
  return { x: 1, y: 2, z: 3 };
}
function val(tag, v) {
  console.log(`val:${tag}`);
  return v;
}
// One evaluation for three fields.
const o1 = { ...make("a") };
console.log(o1);
// Interleaved source order: a, then the spread, then c.
const o2 = { a: val("a", 0), ...make("b"), c: val("c", 9) };
console.log(o2);
// One evaluation per spread operand, not one per literal.
const o3 = { ...make("c"), ...make("d") };
console.log(o3);
// A member-access source; the override wins and keeps its first position.
const wrap = { inner: { x: 5, y: 6 } };
const o4 = { ...wrap.inner, w: 7 };
console.log(o4);
const o5 = { ...make("e"), x: 99 };
console.log(o5);
console.log(Object.keys(o5));
// A class source copies fields only: the prototype getter never runs (no "getter" line
// below), and `#private` fields and methods are not own properties.
class C {
  #p = 1;
  x = 2;
  y = 3;
  get g() {
    console.log("getter");
    return 99;
  }
  m() {
    return this.#p + 6;
  }
}
const o6 = { ...new C(), z: 4 };
console.log(o6);
console.log(Object.keys(o6));
console.log(new C().m());
// A spread beside an explicit key follows the same single-evaluation rule.
const o7 = { ...make("f"), z: 30 };
console.log(o7);
console.log(Object.keys(o7));

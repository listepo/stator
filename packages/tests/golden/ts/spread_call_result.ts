// Spread of arbitrary fixed-shape expressions: one evaluation per spread operand, source
// order against interleaved entries, override rules, and class sources whose prototype
// members stay behind (plan.md §8 step 12c residue).
function make(log: string[], tag: string): { x: number; y: number; z: number } {
  log.push(`make:${tag}`);
  return { x: 1, y: 2, z: 3 };
}
function val(log: string[], tag: string, v: number): number {
  log.push(`val:${tag}`);
  return v;
}
// One evaluation for three fields.
const log1: string[] = [];
const o1 = { ...make(log1, "a") };
console.log(o1);
console.log(log1);
// Interleaved source order: a, then the spread, then c.
const log2: string[] = [];
const o2 = { a: val(log2, "a", 0), ...make(log2, "b"), c: val(log2, "c", 9) };
console.log(o2);
console.log(log2);
// One evaluation per spread operand, not one per literal.
const log3: string[] = [];
const o3 = { ...make(log3, "c"), ...make(log3, "d") };
console.log(o3);
console.log(log3);
// A member-access source; the override wins and keeps its first position.
const wrap: { inner: { x: number; y: number } } = { inner: { x: 5, y: 6 } };
const o4 = { ...wrap.inner, w: 7 };
console.log(o4);
const log5: string[] = [];
const o5 = { ...make(log5, "e"), x: 99 };
console.log(o5);
console.log(Object.keys(o5));
console.log(log5);
// A class source copies fields only: the prototype getter never runs, and `#private`
// fields and methods are not own properties.
const clog: string[] = [];
class C {
  #p = 1;
  x = 2;
  y = 3;
  get g(): number {
    clog.push("getter");
    return 99;
  }
  m(): number {
    return this.#p + 6;
  }
}
const o6 = { ...new C(), z: 4 };
console.log(o6);
console.log(Object.keys(o6));
console.log(clog);
console.log(new C().m());
// A spread into a dynamic literal follows the same single-evaluation rule.
const o7: { x?: number; y?: number; z?: number } = { ...make(log1, "f"), z: 30 };
console.log(o7);
console.log(Object.keys(o7));
console.log(log1);

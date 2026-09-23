// @mode: js
// @verdict: static
// SUBSET.md: Classes -- abstract members declare, a subclass implementation runs
// (plan.md §8 step 12(d), plan-notes 275's throw-stub model). Same source as
// subset_abstract_accessor_ts: a `.ts` file under js mode gets the same static treatment,
// and `abstract` is twice unavailable to untyped code (a `.js` file cannot spell it).

abstract class Shape {
  area: number = 0;
  abstract get size(): number;
  abstract set size(v: number);
  describe(): string {
    return `size ${this.size}`;
  }
}
class Square extends Shape {
  override get size(): number {
    return this.area * 2;
  }
  override set size(v: number) {
    this.area = v;
  }
}
abstract class Round extends Shape {}
class Circle extends Round {
  override get size(): number {
    return this.area;
  }
  override set size(v: number) {
    this.area = v * 2;
  }
}
const s: Shape = new Square();
s.size = 3;
export const a = s.size + s.describe().length;
const c: Shape = new Circle();
export const b = c.size;

// @mode: js
// @verdict: static
// SUBSET.md: Classes -- abstract members declare, a subclass implementation runs
// (plan.md §8 step 12(d), plan-notes 275). Same source as subset_abstract_class_ts: a
// `.ts` file under js mode gets the same static treatment, and abstract is TWICE
// unavailable to untyped code (a `.js` file cannot spell the modifier).

abstract class Shape {
  abstract area(): number;
  abstract sides: number;
  describe(): string {
    return 'a shape';
  }
}
class Square extends Shape {
  area(): number {
    return 9;
  }
  sides: number = 4;
}
export const s: Shape = new Square();
export const a = s.area() + s.sides;

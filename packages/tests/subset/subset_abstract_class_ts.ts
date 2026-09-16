// @mode: ts
// @verdict: static
// SUBSET.md: Classes -- abstract members declare, a subclass implementation runs
// (plan.md §8 step 12(d), plan-notes 275). The base table holds a throw-stub for each
// abstract member (unreachable in a checked program: an abstract class is never
// constructed, a concrete subclass always overrides); virtual dispatch lands on the
// runtime class's entry. Abstract accessors stay not-yet (accessor dispatch is direct).

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

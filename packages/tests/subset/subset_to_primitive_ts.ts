// @mode: ts
// @verdict: static
// SUBSET.md: User toString / valueOf
// A class's own toString answers a template hole, String() and join; its valueOf answers `'' + x`
// (plan.md §9 Task 6.27, ECMA-262 §7.1.1). The receiver's class names the method, so each
// conversion is a direct call.

class Point {
  x: number = 1;
  toString(): string {
    return `P${String(this.x)}`;
  }
  valueOf(): number {
    return this.x;
  }
}
class Point2 extends Point {}

const p = new Point2();
export const text = `${p}` + String(p) + [p, p].join() + ('' + p);

// @mode: ts
// @verdict: static
// SUBSET.md: Classes with fixed shape

class Point {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
const p = new Point(1, 2);

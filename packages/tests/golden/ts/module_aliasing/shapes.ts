class Point {
  x: number;
  constructor(x: number) {
    this.x = x;
  }
}
export class Shape {
  area(): number {
    return 0;
  }
}
class Square extends Shape {
  override area(): number {
    return 4;
  }
}
export { Square as Box };
export function points(): Point[] {
  return [new Point(1), new Point(2)];
}
function first<T>(xs: T[]): T | undefined {
  return xs[0];
}
export function firstPoint(): number {
  return first(points())?.x ?? -1;
}
let label: string = "before";
export default label;
label = "after";
export function currentLabel(): string {
  return label;
}
console.log("init shapes");

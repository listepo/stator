// Per-module namespaces and aliasing imports/exports (plan.md §11c T11.5a).
import describe, { increment as inc, current, counterHelper } from "./counter.ts";
import * as hub from "./hub.ts";
import { Box, Shape, bump, shapeLabel, describeCounter, counter } from "./hub.ts";

// The importer's own `helper`, `count`, `Point` and `first` do not collide with the
// dependencies' private ones.
function helper(): string {
  return "main.helper";
}
const count: string = "main.count";
class Point {
  y: number;
  constructor(y: number) {
    this.y = y;
  }
}
function first<T>(xs: T[]): T[] {
  return xs.slice(1);
}

console.log(helper(), counterHelper(), count, new Point(5).y);
console.log(first(["a", "b", "c"]), hub.firstPoint());

// Imports are live bindings, however they are spelled.
console.log(current, inc(), current, bump(), current);
console.log(counter.current, hub.counter.current, describe(), describeCounter());
const { current: seen } = counter;
console.log(seen);

// A default export of an expression is evaluated once.
console.log(shapeLabel, hub.currentLabel());

// Classes cross module boundaries under their own names; overriding still dispatches.
const shapes: Shape[] = [new Shape(), new Box()];
for (const s of shapes) {
  console.log(s.area());
}
console.log(new Box() instanceof Shape, hub.points().length);

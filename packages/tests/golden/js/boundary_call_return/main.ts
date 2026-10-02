// The call and return edges of the `.js`-to-`.ts` boundary (TS2345 and TS2322 on a return;
// plan-notes 306). js mode suppresses the checker's refusal but keeps each annotation a TypeScript
// file wrote, so every edge below is a boundary check. These values satisfy their annotations, so
// every check passes and the output matches Node. A value that fails one aborts with STA2001
// instead, which Node cannot print: that half is `unit/cli.test.ts`.
import { flag, increment, pick } from "./lib.js";

// The call edge, into a function, a constructor and a method.
function inc(x: number): number {
  return x + 1;
}
class Box {
  base: number;
  constructor(base: number) {
    this.base = base;
  }
  scale(by: number): number {
    return by * this.base;
  }
  size(): number {
    return pick(true);
  }
}
const box = new Box(pick(true));
console.log(inc(pick(true)), box.scale(pick(true)));

// The return edge, as a `return` statement, a method return and an arrow's concise body.
function first(): number {
  return pick(true);
}
const enabled = (): boolean => flag(true);
console.log(first() * 2, box.size() + 3, enabled());

// A `.js` callee keeps Node's coercion: its JSDoc is not a TypeScript annotation.
console.log(increment("2"));

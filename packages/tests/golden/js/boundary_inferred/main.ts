// A `.js` value reaching an annotated `.ts` binding whose type the checker says it may not hold
// (TS2322; plan-notes 301). js mode suppresses the checker's refusal but keeps the annotation, so
// each edge below is a boundary check. These values satisfy their annotations, so every check
// passes and the output matches Node. A value that fails one aborts with STA2001 instead, which
// Node cannot print: that half is `unit/cli.test.ts`.
import { flag, pick } from "./lib.js";

// The declaration edge.
const n: number = pick(true);
console.log(n + 1);

// The assignment edge.
let m: number = 0;
m = pick(true);
console.log(m * 2);

const b: boolean = flag(true);
console.log(b && n > 0);

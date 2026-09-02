// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: switch statement

// The same source in ts mode: a case that falls through into the next non-empty clause is almost
// always a missing `break`, so ts mode keeps `noFallthroughCasesInSwitch` and the checker refuses
// it before the gate is asked anything. The js fixture is the other half of this decision.
let out: string = "";
let x: number = 2;
switch (x) {
  case 1:
    out = "one";
  case 2:
    out = `${out}two`;
    break;
  default:
    out = "other";
}
console.log(out);

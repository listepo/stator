// @mode: js
// @verdict: static
// SUBSET.md: switch statement

// Deliberate fallthrough is ordinary JavaScript, so js mode compiles it: §1.2's contract is that
// untyped code is dynamic, never rejected, and `noFallthroughCasesInSwitch` is a ts-mode-only
// policy (plan-notes 175). Found by Test262's own harness, which falls through on purpose.
// `let` rather than `const` so the discriminant widens to `number` and every clause stays
// comparable -- a literal type would make this a type error about the cases, not about falling
// through, and the fixture would stop testing what it names.
let out = "";
let x = 2;
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

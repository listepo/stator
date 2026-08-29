// @mode: js
// @verdict: dynamic
// @expected-fail: true
// SUBSET.md: switch statement

// No function here on purpose: this fixture names `switch`, so it must not also depend on
// functions (plan-notes 42). Clause tests use strict equality and `default` is tried last
// however it is written, so both are exercised without a `return`.
let name = "";
let x = 2;
switch (x) {
  case 1:
    name = "one";
    break;
  default:
    name = "other";
    break;
  case 2:
    name = "two";
    break;
}
console.log(name);

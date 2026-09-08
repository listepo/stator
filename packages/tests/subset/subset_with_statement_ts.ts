// @mode: ts
// @verdict: error
// @code: STA1109
// @expected-fail: true
// SUBSET.md: with statement, sloppy mode

const obj = { x: 42 };
with (obj) {
  x;
}
export { obj };

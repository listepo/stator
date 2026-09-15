// @mode: js
// @verdict: error
// @code: STA1109
// SUBSET.md: with statement, sloppy mode

const obj = { x: 42 };
with (obj) {
  x;
}
export { obj };

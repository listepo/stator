// @mode: js
// @verdict: dynamic
// SUBSET.md: the callee of a call is an ordinary expression
const x = 5;
try {
  x();
} catch (e) {
  console.log(e.message);
}

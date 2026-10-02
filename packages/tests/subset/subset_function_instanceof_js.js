// @mode: js
// @verdict: dynamic
// SUBSET.md: `instanceof` an ordinary function

// The right side is a function VALUE: the walk compares the left side's prototype chain with
// `F.prototype`, and an arrow (no `prototype`) is Node's catchable TypeError.
function F() {}
const arrow = () => 1;
const f = new F();
console.log(f instanceof F, {} instanceof F);
try {
  console.log({} instanceof arrow);
} catch (e) {
  console.log(e instanceof TypeError);
}

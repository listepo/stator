// @mode: js
// @verdict: dynamic
// SUBSET.md: try/catch/finally/throw

// A catch binding in js mode is a dynamic value like any other, so reading a property off it is
// settled at run time rather than refused by the checker: `useUnknownInCatchVariables` is ts-mode
// policy (plan-notes 175). `catch (e) { e.message }` is the single most common JS idiom there is;
// this fixture throws a string instead of an Error only because `new Error` is still STA1214, and
// what it names is the READ off the binding, not what was thrown. The read lives in a function
// because the per-function provenance rollup is what `explain` reports a verdict from.
function len() {
  try {
    throw "boom";
  } catch (e) {
    return e.length;
  }
}
console.log(len());

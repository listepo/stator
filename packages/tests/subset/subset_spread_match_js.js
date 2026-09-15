// @mode: js
// @verdict: dynamic
// SUBSET.md: Spread operator ... in array literals
// A narrowed match array (`RegExpExecArray`) is Unknown to the HType model but a dense array
// at run time, so the spread folds into `[].concat(m)` and the file is dynamic through the
// Unknown operand (plan.md §8 step 44a). An un-narrowed `match` stays the checker's TS2488.

const m = /a(b)/.exec("ab");
if (m !== null) {
  console.log(JSON.stringify([...m]));
}

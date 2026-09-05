// @mode: js
// @verdict: dynamic
// Reading a name nothing declares is a RUNTIME question in JavaScript, and its answer is a
// catchable ReferenceError -- so js mode drops TS2304 and lowers the read to a `reference-error`
// node typed Unknown, which is what makes the file dynamic (plan.md §8 step 2a(c)).
// SUBSET.md: reference to an undeclared name
try {
  console.log(missingName);
} catch (e) {
  console.log(e.name);
}

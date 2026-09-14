// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Optional chaining ?. — a method call on a receiver the static arms decline
// waits on dynamic method dispatch (plan.md §8 step 20). String methods dispatch statically
// only for narrowed receivers; a nullable union takes the dynamic path.

/** @param {string | undefined} s */
function run(s) {
  console.log(s?.toUpperCase() ?? "noup");
}
run("hi");
export { run };

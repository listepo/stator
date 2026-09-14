// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Optional chaining ?. — a method call on a receiver the static arms decline
// (here a class instance) waits on dynamic method dispatch (plan.md §8 step 20).

class C {
  m(): number {
    return 1;
  }
}
function run(c: C | undefined): void {
  console.log(c?.m() ?? -1);
}
run(new C());
export { run };

// @mode: ts
// @verdict: dynamic
// SUBSET.md: Optional chaining ?. — a method call on a nullable class instance dispatches
// statically against the non-nullish class (the chain guards the base).

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

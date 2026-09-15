// @mode: ts
// @verdict: dynamic
// SUBSET.md: Optional chaining ?. — a method value on a nullable class instance is the
// method's own closure when the base is non-nullish, `undefined` when it is nullish.

class C {
  m(): number {
    return 1;
  }
}
function run(c: C | undefined): void {
  console.log(c?.m);
  console.log(typeof c?.m);
}
run(new C());
run(undefined);
export { run };

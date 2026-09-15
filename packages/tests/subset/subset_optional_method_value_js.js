// @mode: js
// @verdict: dynamic
// SUBSET.md: Optional chaining ?. — a method value on a nullable class instance is the
// method's own closure when the base is non-nullish, `undefined` when it is nullish.

class C {
  m() {
    return 1;
  }
}
/** @param {C | undefined} c */
function run(c) {
  console.log(c?.m);
  console.log(typeof c?.m);
}
run(new C());
run(undefined);
export { run };

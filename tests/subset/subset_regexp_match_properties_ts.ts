// @mode: ts
// @verdict: dynamic
// SUBSET.md: RegExp.prototype methods
// The four names a match array exposes: `index`, `input` and `groups` are PROPERTIES the runtime
// hangs off the array (ECMA-262 §22.2.7.2), `length` is the array header's own. The receiver's HIR
// type is Unknown -- a match-or-null is a union -- so what proves this is a match is the CHECKER,
// exactly as it proves a string receiver for a String.prototype call.

const re = /(?<d>\d+)/;
const m = re.exec('a12');
if (m !== null) {
  console.log(m[0]);
  console.log(m.length);
  console.log(m.index);
  console.log(m.input);
  console.log(m.groups);
}

// @mode: ts
// @verdict: error
// @code: STA0012
// The same source in ts mode: TS2304 is NOT in the js-mode suppression list, so a name the checker
// cannot resolve stays a compile-time refusal. This is the pair the Check asks for -- the identical
// program answered by the checker in ts and by the runtime in js.
// SUBSET.md: reference to an undeclared name
try {
  console.log(missingName);
} catch (e) {
  console.log(e.name);
}

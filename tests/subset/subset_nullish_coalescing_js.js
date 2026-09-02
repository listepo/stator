// @mode: js
// @verdict: dynamic
// SUBSET.md: Nullish coalescing ??
// A literal `null ?? 0` is a checkJs error (STA0012); an untyped operand is the js-column case.

function coalesce(x) {
  return x ?? 0;
}
console.log(coalesce(null));
console.log(coalesce(0));

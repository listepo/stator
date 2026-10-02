// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: A `.js` value reaching an annotated `.ts` binding of another type
// ts mode refuses the `.js` import itself (STA1002), so the twin spells the helper in TypeScript:
// the same mismatch is the checker's TS2322, kept as a compile error. js mode turns it into a
// run-time boundary check instead (subset_annotated_binding_boundary_js).

function label(x: number): string {
  return `${x}`;
}
const n: number = label(10);
console.log(n);

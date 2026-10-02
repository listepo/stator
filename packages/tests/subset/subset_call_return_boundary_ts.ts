// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: A `.js` value reaching an annotated `.ts` binding, parameter or return of another type
// ts mode refuses the `.js` import itself (STA1002), so the twin spells the helper in TypeScript:
// the same mismatches are the checker's TS2345 and TS2322, kept as compile errors. js mode turns
// them into run-time boundary checks instead (subset_call_return_boundary_js).

function label(x: number): string {
  return `${x}`;
}
function inc(x: number): number {
  return x + 1;
}
function first(): number {
  return label(2);
}
console.log(inc(label(1)), first());

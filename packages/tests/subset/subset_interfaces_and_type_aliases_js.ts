// @mode: js
// @verdict: dynamic
// SUBSET.md: Interfaces and type aliases — the declaration itself erases (no
// diagnostic), but a value TYPED by an interface goes through the dynamic
// representation: only anonymous shapes get fixed layouts, because an
// interface may be implemented by any class with any layout. A `type` alias
// of an object literal (subset_interfaces_and_type_aliases_ts.ts) stays static.

interface Point { x: number; y: number }
export const p: Point = { x: 1, y: 2 };

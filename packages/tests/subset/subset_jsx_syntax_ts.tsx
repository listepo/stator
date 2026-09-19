// @mode: ts
// @verdict: error
// @code: STA1003
// SUBSET.md: .tsx, .jsx JSX syntax. SUBSET.md promises error STA1111 (both modes);
// actual: the checker fires first -- the `.tsx` fixture's untyped `el` binding is refused
// as implicit-any STA1003 before the JSX arm is asked (measured 2026-09-19 on
// agent/p5-residue; p5-10's scope note concurs).

export const el = <div />;

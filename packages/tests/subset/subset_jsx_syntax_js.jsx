// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: .tsx, .jsx JSX syntax. SUBSET.md promises error STA1111 (both modes);
// actual: the js fixture parses as .jsx and the gate answers the generic subset
// boundary STA1214 (measured 2026-09-19 on agent/p5-residue).

export const el = <div />;

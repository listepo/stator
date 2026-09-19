// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Proxy object. SUBSET.md promises error STA1106 in ts mode; actual: the gate
// answers the generic subset boundary STA1214 (measured 2026-09-19 on agent/p5-residue).

const p = new Proxy({}, {});
export { p };

// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: CommonJS require(). SUBSET.md promises error STA1110 (both modes); actual:
// the ts fixture has no `require` binding in scope, so the checker fires first with the
// passed-through tsc error STA0012 (measured 2026-09-19 on agent/p5-residue).

require("module");
export {};

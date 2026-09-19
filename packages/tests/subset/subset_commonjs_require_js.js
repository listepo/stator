// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: CommonJS require(). SUBSET.md promises error STA1110 (both modes); actual:
// the js fixture's bare `require("module")` reaches the subset boundary first and the
// gate answers STA1214 (measured 2026-09-19 on agent/p5-residue).

require("module");
export {};

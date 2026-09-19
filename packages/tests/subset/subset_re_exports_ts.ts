// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Re-exports (export { x } from 'y'). Actual: the gate names no re-export arm —
// the export-from form falls through to the subset boundary (STA1214), measured
// 2026-09-19 on this branch. The pin names that, not the aspirational `static`.
export { x } from "./helper_ts.ts";

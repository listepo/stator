// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: Re-exports (export { x } from 'y')

export { x } from "./helper_ts.ts";

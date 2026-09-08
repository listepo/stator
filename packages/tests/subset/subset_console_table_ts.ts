// @mode: ts
// @verdict: static
// SUBSET.md: console
// `table` landed 2026-09-01: its column layout is a pure function of the data, so a golden test
// CAN hold it to Node byte-for-byte -- which is exactly what separates it from `time`/`timeEnd`
// (an elapsed duration) and `trace` (a stack), the three that stay under the determinism
// carve-out rather than deferred.

console.table([1, 2]);

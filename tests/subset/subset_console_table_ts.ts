// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: console
// The console methods that lower are the ones a golden test can hold to Node byte-for-byte.
// `table` is a column-layout algorithm of its own; `time`/`timeEnd` print an elapsed duration and
// `trace` a stack, none of which is reproducible output. All four stay deferred.

console.table([1, 2]);

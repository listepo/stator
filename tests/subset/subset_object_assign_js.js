// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object namespace
// `Object.assign` is reachable in ts mode only, and not because js mode is treated differently:
// the target must be a growable shape, and the only things that make a shape growable -- an
// optional property or an index signature -- are ANNOTATIONS. Inference from a literal always
// produces an all-required shape, so js mode has no way to spell a legal target.

export const merged = Object.assign({ x: 1 }, { y: 2 });

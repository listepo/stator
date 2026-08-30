// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object namespace
// `assign` MUTATES its target, which a fixed-shape object cannot accept at all, and it is
// variadic besides. The rest of the deferred namespace has its own reasons: `freeze`/`isFrozen`
// need a frozen bit every write site would consult, and the prototype methods are machinery ts
// mode bans by design.

export const merged = Object.assign({ x: 1 }, { y: 2 });

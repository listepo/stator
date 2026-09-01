// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: RegExp.prototype data properties
// `lastIndex` is the one WRITABLE property in the spec's set, and a write is not a read spelled
// backwards: it is an assignment TARGET, and the assignment gate admits a field of a class and
// nothing else. Refusing it is what keeps the read from being quietly lowered into a store.

const re = /a/g;
re.lastIndex = 3;
console.log(re.lastIndex);

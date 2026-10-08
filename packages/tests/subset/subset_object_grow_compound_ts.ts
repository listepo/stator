// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Assignment to a property the object's shape does not declare
const info = { name: 'b' };
info.count ??= 1;
console.log(info.count);

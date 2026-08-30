// @mode: ts
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Object namespace
// A key that is not a string reads a property neither object layout holds, and converting one is
// the ToPropertyKey the object model owns.

const o: { [k: string]: number } = { a: 1 };
export const has = Object.hasOwn(o, 2);

// @mode: ts
// @verdict: static
// SUBSET.md: String.prototype (landed surface)

export const s: string = "a";
export const m = s.concat("b", "c");
export const e = s.concat();

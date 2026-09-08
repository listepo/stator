// @mode: ts
// @verdict: static
// SUBSET.md: String.prototype (landed surface)

export const a = "abc".indexOf("b");
export const b = "abc".slice(1);
export const c = "a,b".split(",");
export const d = "x".padStart(3, "0");
export const e = "a-b".replaceAll("-", "+");

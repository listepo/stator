// @mode: ts
// @verdict: error
// @code: STA0012
// SUBSET.md: arithmetic operators (primitive coercion is js-mode runtime work)
const s: string = "5";
console.log(s * 1);

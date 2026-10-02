// @mode: ts
// @verdict: error
// @code: STA1003
// SUBSET.md: `new` on an ordinary function

// A `.ts` function has no construct signature, so `new P(1)` is an implicit `any` (the checker's
// TS7009 is reported beside it as STA0012). Classes are how ts mode constructs.
function P(x: number): void {
  console.log(x);
}
const p = new P(1);
console.log(p);

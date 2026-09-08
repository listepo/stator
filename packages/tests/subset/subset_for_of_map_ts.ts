// @mode: ts
// @verdict: dynamic
// SUBSET.md: for-of over a Map (Phase 5 step 8 specialized loop)
// The loop is specialized, but a Map yields a [key, value] tuple the HIR has no member for, so
// the binding is Unknown and a file that uses it is dynamic.

const m = new Map<string, number>();
m.set('a', 1);
let n: number = 0;
for (const e of m) {
  n += 1;
  console.log(e);
}
console.log(n);

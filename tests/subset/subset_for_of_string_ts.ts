// @mode: ts
// @verdict: static
// SUBSET.md: for-of over a string (Phase 5 step 8 specialized loop)

const s: string = "ab";
let n: number = 0;
for (const c of s) {
  n += c.length;
}
console.log(n);

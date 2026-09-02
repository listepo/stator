// @mode: ts
// @verdict: not-yet
// @code: STA1207
// SUBSET.md: import() with a computed specifier (Phase 8)

const spec = "./x.ts";
const m = import(spec);
console.log(m);

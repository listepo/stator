// @mode: js
// @verdict: not-yet
// @code: STA1207
// SUBSET.md: import() with a computed specifier (Phase 8)

const spec = "./x.js";
const m = import(spec);
console.log(m);

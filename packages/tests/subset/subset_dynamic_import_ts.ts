// @mode: ts
// @verdict: static
// SUBSET.md: import() dynamic import (literal specifier)

const m = await import("./dynamic_import_helper_ts.ts");
console.log(m.n);

// @mode: js
// @verdict: static
// SUBSET.md: import() dynamic import (literal specifier)

const m = await import("./dynamic_import_helper_js.js");
console.log(m.n);

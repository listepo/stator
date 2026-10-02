// @mode: js
// @verdict: static
// SUBSET.md: Renamed, default and namespace imports

import * as ns from "./helper_alias_js.js";
const n = ns.x + ns.renamed() + ns.default();
export { n };

// @mode: ts
// @verdict: static
// SUBSET.md: Renamed, default and namespace imports

import * as ns from "./helper_alias_ts.ts";
const n = ns.x + ns.renamed() + ns.default();
export { n };

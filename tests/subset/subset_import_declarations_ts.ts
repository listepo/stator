// @mode: ts
// @verdict: static
// SUBSET.md: import declarations (named, default, namespace)

import { x } from "./helper_ts.ts";
const y = x + 1;
export { y };

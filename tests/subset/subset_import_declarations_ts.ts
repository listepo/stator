// @mode: ts
// @verdict: static
// @expected-fail: true
// SUBSET.md: import declarations (named, default, namespace)

import { x } from "./helper_ts.ts";
const y = x + 1;
export { y };

// @mode: js
// @verdict: static
// @expected-fail: true
// SUBSET.md: import declarations (named, default, namespace)

import { x } from "./helper_js.js";
const y = x + 1;
export { y };

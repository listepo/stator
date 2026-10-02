// @mode: js
// @verdict: static
// SUBSET.md: Cross-file top-level name collisions

import { renamed } from "./helper_alias_js.js";
function inner() {
  return 2;
}
export const n = inner() + renamed();

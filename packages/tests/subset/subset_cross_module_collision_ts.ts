// @mode: ts
// @verdict: static
// SUBSET.md: Cross-file top-level name collisions

import { renamed } from "./helper_alias_ts.ts";
function inner(): number {
  return 2;
}
export const n = inner() + renamed();

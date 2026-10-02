// @mode: ts
// @verdict: static
// SUBSET.md: Renamed, default and namespace imports

import { x as y } from "./helper_ts.ts";
const z = y + 1;
export { z };

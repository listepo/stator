// @mode: js
// @verdict: static
// SUBSET.md: Renamed, default and namespace imports

import { x as y } from "./helper_js.js";
const z = y + 1;
export { z };

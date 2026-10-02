// @mode: js
// @verdict: static
// SUBSET.md: Re-exports (export { x } from 'y')

import * as both from "./helper_star_both_js.js";
import { onlyA } from "./helper_star_both_js.js";
console.log(both.onlyA + onlyA);

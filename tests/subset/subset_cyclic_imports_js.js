// @mode: js
// @verdict: error
// @code: STA3001
// @expected-fail: true
// SUBSET.md: Cyclic module imports

import { y } from "./cycle_partner_js.js";
export const x = 42;

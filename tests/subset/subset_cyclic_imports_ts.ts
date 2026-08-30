// @mode: ts
// @verdict: error
// @code: STA3001
// SUBSET.md: Cyclic module imports

import { y } from "./cycle_partner_ts.ts";
export const x: number = 42;

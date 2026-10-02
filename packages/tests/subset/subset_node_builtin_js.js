// @mode: js
// @verdict: not-yet
// @code: STA1214
// SUBSET.md: Node built-ins — without --node, `node:*` and bare built-ins name the flag
// (docs/MODES.md §6). A bare built-in is never a package.
import { join } from "node:path";
import { sep } from "path";

console.log(join("a", "b"), sep);

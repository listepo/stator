// @mode: js
// @verdict: not-yet
// @code: STA1214
// @node: true
// SUBSET.md: Node built-ins — under --node, a module packages/node has not landed is not-yet
// naming Phase 11 (T11.6), under either spelling.
import { isPrimary } from "node:cluster";
import { fork } from "child_process";

console.log(isPrimary, typeof fork);

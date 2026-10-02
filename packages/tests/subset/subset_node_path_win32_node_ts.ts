// @mode: ts
// @verdict: not-yet
// @code: STA1214
// @node: true
// SUBSET.md: node:path under --node — `win32` is a member Node's module has and packages/node has
// not landed, so it names T11.6.

import { win32 } from 'node:path';

console.log(win32.sep);

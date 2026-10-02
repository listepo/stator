// @mode: ts
// @verdict: dynamic
// @node: true
// SUBSET.md: node:path under --node — packages/node's strict TypeScript, compiled like any module;
// dynamic because the graph holds std/env (`get` answers a union) and `basename`'s optional suffix.

import { basename, join } from 'node:path';

console.log(join('a', basename('/b/c')));

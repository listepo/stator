// @mode: ts
// @verdict: dynamic
// @node: true
// SUBSET.md: node:fs under --node — the synchronous subset, packages/node's strict TypeScript over
// std/fs; dynamic because the overloads take unions (an encoding or options, `number | Date`) and
// a failure is caught as `unknown`.

import fs, { existsSync } from 'node:fs';

console.log(existsSync('/'), fs.statSync('/').isDirectory());

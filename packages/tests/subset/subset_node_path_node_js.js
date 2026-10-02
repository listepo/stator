// @mode: js
// @verdict: dynamic
// @node: true
// SUBSET.md: node:path under --node — the bare specifier and the default export.

import path from 'path';

console.log(path.join('a', path.basename('/b/c')));

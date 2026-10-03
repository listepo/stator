// @mode: js
// @verdict: dynamic
// @node: true
// SUBSET.md: node:fs under --node — the bare specifier and the default export.

import fs from 'fs';

console.log(fs.existsSync('/'), fs.readdirSync('/').length > 0);

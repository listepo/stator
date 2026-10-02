// node:module in js mode under --node (plan.md §11c T11.5): the default export's `createRequire`,
// untyped values from `require`, and a computed `require` hit and miss. No line prints a path.
import module from 'node:module';

const require = module.createRequire(import.meta.url);
const path = require('path');
console.log(path.basename('/a/b.txt'), path.extname('c.tar.gz'));
console.log(require('node:module') === module, require('module').isBuiltin('os'));

const names = ['path', 'assert', 'missing-' + names0()];
function names0() {
  return 'pkg';
}
for (const name of names) {
  try {
    const value = require(name);
    console.log(name, value !== undefined);
  } catch (e) {
    console.log(name, e.code);
  }
}
console.log(import.meta.url.endsWith('/node_module.js'), typeof import.meta.dirname);

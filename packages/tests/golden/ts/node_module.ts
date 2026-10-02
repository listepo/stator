// node:module under --node (plan.md §11c T11.5): `createRequire(import.meta.url)` of a built-in,
// a computed `require` hit and miss, `isBuiltin` and `builtinModules`. The binary does not sit
// where the source does, so no line prints a path.
import { builtinModules, createRequire, isBuiltin } from 'node:module';
import { join } from 'node:path';

interface PathLike {
  readonly join: (a: string, b: string) => string;
  readonly sep: string;
}

const require = createRequire(import.meta.url);
const path: PathLike = require('path');
console.log(path.join('a', 'b') === join('a', 'b'), path.sep);
const prefixed: unknown = require('node:path');
console.log(prefixed === require('path'));

const ids = ['assert', 'module', 'path/posix'];
for (const id of ids) {
  const loaded: unknown = require(id);
  console.log(id, loaded !== undefined);
}

for (const id of ['./five.js', 'left-pad', 'node:nope']) {
  try {
    require(id);
  } catch (e) {
    const failure = e as { readonly code: string; readonly message: string };
    console.log(failure.code, failure.message.split('\n')[0]);
  }
}

console.log(isBuiltin('fs'), isBuiltin('node:test'), isBuiltin('test'), isBuiltin('left-pad'));
console.log(builtinModules.length, builtinModules.includes('path'));
console.log(import.meta.url.startsWith('file:///'), import.meta.filename.endsWith('.ts'));
console.log(join(import.meta.dirname, 'node_module.ts') === import.meta.filename);

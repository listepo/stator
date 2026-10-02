// node:path in js mode under --node (plan.md §11c T11.6): the bare specifier, the default
// export, and untyped values crossing into the typed module.
import path from 'path';
import { join, parse } from 'node:path';

const parts = ['usr', 'local', 'bin'];
let joined = '/';
for (const part of parts) {
  joined = join(joined, part);
}
console.log(joined, path.basename(joined), path.dirname(joined));
const parsed = parse('/tmp/archive.tar.gz');
console.log(parsed.name, parsed.ext, parsed.dir);
console.log(path.relative('/usr/local/bin', '/usr/share'), path.extname('a.b.c'));
console.log(path.format({ dir: '/x', name: 'y', ext: '.z' }), path.isAbsolute(joined));

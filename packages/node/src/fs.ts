// `node:fs` (plan.md §11c T11.6): every member lives in `internal/fs.ts`, and the default export is
// that module's namespace, so `import fs from 'node:fs'` sees exactly the named exports, as Node's
// default export is its exports object. A new member needs no second listing here.

import * as fs from './internal/fs.ts';

export * from './internal/fs.ts';

export default fs;

/* The host side of every node-suite test (plan.md §11c T11.7), loaded with `--import`.
 *
 * Node's tests `require('../common')` and `require('../common/fixtures')`. Those specifiers
 * answer with this directory's strict-TS `common/` instead of Node's own `test/common`, so the
 * pinned Node proves each test passes against the same harness Stator builds it with. Only a
 * request from inside the fetched corpus is redirected. */
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CORPUS } from './suite.ts';

const COMMON = fileURLToPath(new URL('common/', import.meta.url));
const CORPUS_URL = pathToFileURL(join(CORPUS, 'test')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const name = /^\.\.\/common(?:\/(index|fixtures))?(?:\.js)?$/.exec(specifier);
    if (name === null || context.parentURL?.startsWith(`${CORPUS_URL}/`) !== true) {
      return nextResolve(specifier, context);
    }
    const url = pathToFileURL(join(COMMON, `${name[1] ?? 'index'}.ts`)).href;
    return { url, shortCircuit: true };
  },
});

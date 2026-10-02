/* `require('../common/fixtures')` for the selected Node tests (plan.md §11c T11.7): the
 * helpers the selection uses from Node v26.7.0 `test/common/fixtures.js`
 * (https://github.com/nodejs/node/blob/v26.7.0/test/common/fixtures.js). The directory is the
 * fetched corpus's `test/fixtures`, which holds the files expectations.json lists. Upstream finds
 * it from `__dirname`; here it is the working directory's, because node-suite.test.ts runs both
 * the pinned Node and the Stator binary in the corpus root, and a binary has no source location
 * to start from. That keeps `suite.ts` (`node:url`, `import.meta`) out of the Stator build. */
import { join } from 'node:path';
import process from 'node:process';

export const fixturesDir = join(process.cwd(), 'test', 'fixtures');

/** A path under the fixtures directory. Exported as `path`, as upstream does. */
function fixturesPath(...parts: string[]): string {
  return join(fixturesDir, ...parts);
}
export { fixturesPath as path };

/* `require('../common/fixtures')` for the selected Node tests (plan.md §11c T11.7): the
 * helpers the selection uses from Node v26.7.0 `test/common/fixtures.js`
 * (https://github.com/nodejs/node/blob/v26.7.0/test/common/fixtures.js). The directory is the
 * fetched corpus's `test/fixtures`, which holds the files expectations.json lists. */
import { join } from 'node:path';
import { CORPUS } from '../suite.ts';

export const fixturesDir = join(CORPUS, 'test', 'fixtures');

/** A path under the fixtures directory. Exported as `path`, as upstream does. */
function fixturesPath(...parts: string[]): string {
  return join(fixturesDir, ...parts);
}
export { fixturesPath as path };

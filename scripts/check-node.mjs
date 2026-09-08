// Preflight for `pnpm run ci` (plan.md Task 6.2a): refuse to run the suites on the
// wrong Node.
//
// The golden and differential runners diff against the pinned Node in `.node-version`
// (`process.execPath` is the oracle), so a suite that is green under any other major proves
// nothing about the ground truth. Compare the running major against the pinned major and
// fail fast with the one-line fix. Dependency-free on purpose: this runs before anything
// is installed, so it cannot import anything that is not Node itself.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function majorOf(version) {
  const match = /^v?(\d+)/.exec(version.trim());
  if (match === null) {
    throw new Error(`cannot read a major version from "${version}"`);
  }
  return match[1] ?? '';
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let pinnedRaw;
try {
  pinnedRaw = readFileSync(join(root, '.node-version'), 'utf8');
} catch {
  console.error('stator: cannot read .node-version — run from the workspace root');
  process.exit(1);
}
const pinnedLine = pinnedRaw.split('\n').at(0) ?? '';
const pinned = pinnedLine.trim();
if (pinned === '') {
  console.error('stator: .node-version is empty — the Node pin is the test ground truth');
  process.exit(1);
}

const running = process.version;
if (majorOf(running) !== majorOf(pinned)) {
  console.error(
    `stator: node ${running} is not the pinned Node (${pinned} from .node-version) — ` +
      'suites diff against the pinned Node, so a run here proves nothing',
  );
  console.error('stator: fix: mise exec node -- <your command>');
  process.exit(1);
}

console.log(`stator: node ${running} matches .node-version (${pinned})`);

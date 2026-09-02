/* Fetch the pinned Test262 corpus into the ignored working directory. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CORPUS = join(HERE, 'corpus');
const PIN = join(HERE, 'pin.json');

function commit(): string {
  const parsed: unknown = JSON.parse(readFileSync(PIN, 'utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('commit' in parsed) ||
    typeof parsed.commit !== 'string'
  ) {
    throw new Error(`${PIN}: expected {"commit":"<sha>"}`);
  }
  return parsed.commit;
}

function main(): void {
  const destination = process.env['STATOR_TEST262'] ?? DEFAULT_CORPUS;
  if (existsSync(join(destination, 'test'))) {
    process.stdout.write(`test262: corpus already present at ${destination}\n`);
    return;
  }
  mkdirSync(destination, { recursive: true });
  execFileSync('git', ['init', '--quiet', destination], { stdio: 'inherit' });
  execFileSync(
    'git',
    ['-C', destination, 'remote', 'add', 'origin', 'https://github.com/tc39/test262.git'],
    { stdio: 'inherit' },
  );
  execFileSync('git', ['-C', destination, 'fetch', '--depth=1', 'origin', commit()], {
    stdio: 'inherit',
  });
  execFileSync('git', ['-C', destination, 'checkout', '--quiet', 'FETCH_HEAD'], {
    stdio: 'inherit',
  });
  process.stdout.write(`test262: fetched ${commit()} into ${destination}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

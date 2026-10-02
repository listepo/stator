/* Fetch the selected slice of Node's test suite into the ignored corpus (plan.md §11c T11.7).
 *
 * Usage: node packages/tests/node-suite/fetch.ts
 *
 * Downloads each `test/parallel/<test>` that expectations.json selects, and the `test/fixtures`
 * files it lists, at the tag pin.json names. A file already present is kept unless the corpus
 * was fetched at another tag, which re-fetches everything: a Node bump re-pins, and the diff of
 * results is the review. Nothing from Node's `test/common` is fetched: `require('../common')`
 * answers with this directory's strict-TS `common/` instead (host-hook.ts). */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CORPUS, loadExpectations, loadPin } from './suite.ts';

const STAMP = join(CORPUS, 'PIN');

function rawUrl(repository: string, tag: string, path: string): string {
  const slug = repository.replace(/^https:\/\/github\.com\//, '');
  return `https://raw.githubusercontent.com/${slug}/${tag}/${path}`;
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`node-suite: ${url}: HTTP ${String(response.status)}`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

async function main(): Promise<void> {
  const { repository, tag } = loadPin();
  const stamped = existsSync(STAMP) ? readFileSync(STAMP, 'utf8').trim() : undefined;
  if (stamped !== undefined && stamped !== tag) {
    rmSync(join(CORPUS, 'test'), { recursive: true, force: true });
  }
  const wanted = loadExpectations().flatMap((entry) => [
    `test/parallel/${entry.test}`,
    ...entry.fixtures.map((file) => `test/fixtures/${file}`),
  ]);
  const unique = [...new Set(wanted)];
  const missing = unique.filter((path) => !existsSync(join(CORPUS, path)));
  await Promise.all(
    missing.map((path) => download(rawUrl(repository, tag, path), join(CORPUS, path))),
  );
  mkdirSync(CORPUS, { recursive: true });
  // Node's tree has no `"type"` above `test/`, so its tests are CommonJS; without this file the
  // corpus would inherit `@stator/tests`'s `"type": "module"`.
  writeFileSync(join(CORPUS, 'package.json'), '{ "type": "commonjs" }\n');
  writeFileSync(STAMP, `${tag}\n`);
  process.stdout.write(
    `node-suite: ${String(missing.length)} fetched, ${String(unique.length - missing.length)} present at ${tag} in ${CORPUS}\n`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

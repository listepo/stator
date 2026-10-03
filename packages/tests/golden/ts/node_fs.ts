// node:fs, the synchronous subset `tsc` calls (plan.md §11c T11.6): files as text and bytes,
// directories, descriptors and Node's system errors. Everything happens under one scratch
// directory with a random name, so the two sides never meet, and the fixture removes what it
// made. Paths in messages are masked: the directory name differs run to run.
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import type { Dirent, Stats } from 'node:fs';
import { join } from 'node:path';

const scratch = `/tmp/stator_node_fs_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
console.log(existsSync(scratch), mkdirSync(scratch), existsSync(scratch));
// The canonical spelling (`/tmp` is a symbolic link on macOS), which `realpathSync` errors use.
const dir = realpathSync(scratch);

function masked(text: string): string {
  return text.split(dir).join('<dir>');
}

interface Failure {
  readonly name: string;
  readonly code: string;
  readonly syscall: string;
  readonly message: string;
}

function attempt(label: string, body: () => void): void {
  try {
    body();
    console.log(`${label}: no throw`);
  } catch (e) {
    const failure = e as Failure;
    console.log(`${label}: ${failure.code} ${failure.syscall} | ${masked(failure.message)}`);
  }
}

const file = join(dir, 'a.txt');
writeFileSync(file, 'héllo\nwörld\u0000end\n');
const text = readFileSync(file, 'utf8');
console.log(JSON.stringify(text), text.length);
const bytes = readFileSync(file);
console.log(bytes.length, bytes[0], bytes[1], bytes[bytes.length - 1]);
console.log(readFileSync(file, { encoding: 'hex' }).slice(0, 12), readFileSync(file, 'latin1').length);
writeFileSync(join(dir, 'b.bin'), new Uint8Array([1, 2, 3, 250]));
console.log(readFileSync(join(dir, 'b.bin'), 'base64'));

const stats: Stats = statSync(file);
console.log(stats.size, stats.isFile(), stats.isDirectory(), stats.isSymbolicLink());
console.log(statSync(dir).isDirectory(), statSync(join(dir, 'none'), { throwIfNoEntry: false }));

const nested = join(dir, 'x', 'y', 'z');
console.log(masked(mkdirSync(nested, { recursive: true }) ?? 'none'));
console.log(mkdirSync(nested, { recursive: true }));
console.log(readdirSync(dir).sort().join(','));
const entries: Dirent[] = readdirSync(dir, { withFileTypes: true });
const kinds = entries.map((entry) => `${entry.name}:${entry.isFile() ? 'f' : ''}${entry.isDirectory() ? 'd' : ''}`);
console.log(kinds.sort().join(','), masked(entries[0]?.parentPath ?? ''));
console.log(masked(realpathSync(join(dir, 'x', '..', 'a.txt'))).endsWith('<dir>/a.txt'));

const fd = openSync(join(dir, 'c.txt'), 'w');
console.log(writeSync(fd, 'abc'), writeSync(fd, new Uint8Array([100, 101, 102, 103]), 1, 2));
console.log(writeSync(fd, 'Z', 0));
closeSync(fd);
console.log(readFileSync(join(dir, 'c.txt'), 'utf8'));

utimesSync(file, 1000, new Date(2_000_000));
console.log(statSync(file).mtimeMs, statSync(file).mtime.toISOString());

attempt('read missing', () => readFileSync(join(dir, 'none'), 'utf8'));
attempt('read dir', () => readFileSync(dir));
attempt('stat missing', () => statSync(join(dir, 'none')));
attempt('mkdir exists', () => mkdirSync(dir));
attempt('mkdir no parent', () => mkdirSync(join(dir, 'p', 'q')));
attempt('unlink missing', () => unlinkSync(join(dir, 'none')));
attempt('readdir file', () => readdirSync(file));
// Through the spelling with the symbolic link: Node reports the canonical one.
attempt('realpath missing', () => realpathSync(join(scratch, 'none', 'deeper')));
attempt('open missing', () => openSync(join(dir, 'none')));
attempt('close bad', () => closeSync(fd));
attempt('write bad', () => writeSync(fd, 'x'));
attempt('utimes missing', () => utimesSync(join(dir, 'none'), 1, 1));
attempt('write no dir', () => writeFileSync(join(dir, 'none', 'f'), 'x'));
try {
  readFileSync(file, 'nope');
} catch (e) {
  const failure = e as Failure;
  console.log(failure.name, failure.code, failure.message);
}

for (const name of ['a.txt', 'b.bin', 'c.txt']) unlinkSync(join(dir, name));
attempt('rmdir not empty', () => rmdirSync(join(dir, 'x')));
for (const name of [nested, join(dir, 'x', 'y'), join(dir, 'x'), dir]) rmdirSync(name);
attempt('rmdir missing', () => rmdirSync(dir));
console.log(existsSync(file), existsSync(dir));

/* Node twin of packages/std/src/fs.ts. */

import { mkdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { quote, rethrow } from './failure.ts';

export class Stat {
  readonly size: number;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly mtimeMs: number;

  constructor(size: number, kind: number, mtimeMs: number) {
    this.size = size;
    this.isFile = kind === 1;
    this.isDirectory = kind === 2;
    this.mtimeMs = mtimeMs;
  }
}

export function readText(path: string): string {
  return rethrow('std/fs.readText', quote(path), () => readFileSync(path, 'utf8'));
}

export function writeText(path: string, text: string): void {
  rethrow('std/fs.writeText', quote(path), () => writeFileSync(path, text));
}

export function stat(path: string): Stat {
  const st = rethrow('std/fs.stat', quote(path), () => statSync(path));
  const kind = st.isFile() ? 1 : st.isDirectory() ? 2 : 0;
  return new Stat(st.size, kind, Math.trunc(st.mtimeMs));
}

export function mkdir(path: string): void {
  rethrow('std/fs.mkdir', quote(path), () => mkdirSync(path));
}

export function unlink(path: string): void {
  rethrow('std/fs.unlink', quote(path), () => unlinkSync(path));
}

export function rmdir(path: string): void {
  rethrow('std/fs.rmdir', quote(path), () => rmdirSync(path));
}

/* Node twin of packages/std/src/io.ts: `fs.writeSync`/`fs.readSync` on raw descriptors and
 * `node:tty`. Node range-checks a descriptor itself (ERR_OUT_OF_RANGE); std answers EBADF for
 * one that names no open file, so the twin checks first and lets the OS answer the rest. */

import { fstatSync, readSync, writeSync } from 'node:fs';
import { isatty as nodeIsatty, WriteStream } from 'node:tty';
import { failure, rethrow } from './failure.ts';

export const stdin: number = 0;
export const stdout: number = 1;
export const stderr: number = 2;

export class TerminalSize {
  readonly columns: number;
  readonly rows: number;

  constructor(columns: number, rows: number) {
    this.columns = columns;
    this.rows = rows;
  }
}

function descriptor(call: string, fd: number): number {
  if (!Number.isInteger(fd) || fd < 0 || fd > 2147483647) {
    throw failure(call, `${fd}`, 'EBADF');
  }
  return fd;
}

/** UTF-8 up to the first NUL, as the C-string boundary cuts it. */
function cString(text: string): string {
  const nul = text.indexOf('\0');
  return nul === -1 ? text : text.slice(0, nul);
}

function writeAll(call: string, fd: number, data: Uint8Array): void {
  const f = descriptor(call, fd);
  rethrow(call, `${fd}`, () => {
    let done = writeSync(f, data, 0, data.length);
    while (done < data.length) {
      done += writeSync(f, data, done, data.length - done);
    }
  });
}

export function write(fd: number, text: string): void {
  writeAll('std/io.write', fd, Buffer.from(cString(text), 'utf8'));
}

export function writeBytes(fd: number, bytes: Uint8Array): void {
  writeAll('std/io.writeBytes', fd, bytes);
}

export function read(fd: number, max: number): Uint8Array {
  const f = descriptor('std/io.read', fd);
  if (!Number.isInteger(max) || max < 0 || max > 2147483647) {
    throw failure('std/io.read', `${fd}`, 'EINVAL');
  }
  const buffer = new Uint8Array(Math.min(max, 1 << 20));
  const got = rethrow('std/io.read', `${fd}`, () => readSync(f, buffer, 0, buffer.length, null));
  return buffer.slice(0, got);
}

export function isatty(fd: number): boolean {
  return nodeIsatty(fd);
}

export function terminalSize(fd: number): TerminalSize {
  const f = descriptor('std/io.terminalSize', fd);
  rethrow('std/io.terminalSize', `${fd}`, () => fstatSync(f));
  if (!nodeIsatty(f)) {
    throw failure('std/io.terminalSize', `${fd}`, 'ENOTTY');
  }
  const [columns, rows] = new WriteStream(f).getWindowSize();
  return new TerminalSize(columns, rows);
}

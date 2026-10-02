// `std/io` — the standard streams and raw file-descriptor I/O (docs/STD.md §5). A write flushes
// `console`'s buffered output first, so the two keep program order on the same stream.

import { type CString } from './native/core.js';
import {
  jsrtStdIoIsatty,
  jsrtStdIoRead,
  jsrtStdIoTerminalColumns,
  jsrtStdIoTerminalRows,
  jsrtStdIoTerminalSize,
  jsrtStdIoWrite,
  jsrtStdIoWriteBytes,
} from './native/io.js';
import { __stdFailure } from './internal/error.ts';
import { __stdReadAnswer, __stdReadView } from './internal/read.ts';

export const stdin: number = 0;
export const stdout: number = 1;
export const stderr: number = 2;

/** A terminal's size in character cells. A class for the reason `std/fs.Stat` is one: a fixed
 * layout compiles static. Programs get one from `terminalSize`, never `new`. */
export class TerminalSize {
  readonly columns: number;
  readonly rows: number;

  constructor(columns: number, rows: number) {
    this.columns = columns;
    this.rows = rows;
  }
}

/** Writes all of `text` as UTF-8 to `fd`. A NUL ends the text (the C-string boundary);
 * `writeBytes` carries any byte. A descriptor that names no open file is EBADF. */
export function write(fd: number, text: string): void {
  if (jsrtStdIoWrite(fd, text as CString) !== 0) {
    throw __stdFailure('std/io.write', `${fd}`);
  }
}

/** Writes all of `bytes` to `fd`. */
export function writeBytes(fd: number, bytes: Uint8Array): void {
  if (jsrtStdIoWriteBytes(fd, bytes) !== 0) {
    throw __stdFailure('std/io.writeBytes', `${fd}`);
  }
}

/** One read of at most `max` bytes (and at most 1 MiB) from `fd`; an empty answer is end of
 * file. Blocks until the descriptor has something to give. `max` outside `0..2^31-1` is EINVAL.
 * The backing reads straight into the answer's storage; only a short read copies, once. */
export function read(fd: number, max: number): Uint8Array {
  const into = __stdReadView(max);
  const count = jsrtStdIoRead(fd, max, into);
  if (count < 0) {
    throw __stdFailure('std/io.read', `${fd}`);
  }
  return __stdReadAnswer(into, count);
}

/** Whether `fd` is a terminal; false (never an error) for anything that is not. */
export function isatty(fd: number): boolean {
  return jsrtStdIoIsatty(fd) === 1;
}

/** The size of the terminal `fd` is; ENOTTY when it is not one. */
export function terminalSize(fd: number): TerminalSize {
  if (jsrtStdIoTerminalSize(fd) !== 0) {
    throw __stdFailure('std/io.terminalSize', `${fd}`);
  }
  return new TerminalSize(jsrtStdIoTerminalColumns(), jsrtStdIoTerminalRows());
}

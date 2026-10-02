// `std/fs` — sync, path-only file-system calls (docs/STD.md §5). Paths resolve against the
// working directory exactly as the OS resolves them. The Promise twins (`readTextAsync`, …) arrive
// with T10.2's thread pool (docs/STD.md §2); until then importing one is not-yet (the compiler's
// frontend/std.ts names them), rather than a sync call wearing `async`.

import { jsrtStdResult, type CString } from './native/core.js';
import {
  jsrtStdFsMkdir,
  jsrtStdFsReadText,
  jsrtStdFsRmdir,
  jsrtStdFsStat,
  jsrtStdFsStatKind,
  jsrtStdFsStatMtimeMs,
  jsrtStdFsStatSize,
  jsrtStdFsUnlink,
  jsrtStdFsWriteText,
} from './native/fs.js';
import { __stdFailure, __stdQuote } from './internal/error.ts';

/** What `stat` reports about a path (symlinks followed). A class rather than an interface: a
 * class instance has a fixed layout and compiles static, where an object literal typed by an
 * interface is a dynamic object (docs/SUBSET.md). Programs get one from `stat`, never `new`. */
export class Stat {
  readonly size: number;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  /** Last modification, whole milliseconds since the Unix epoch. */
  readonly mtimeMs: number;

  constructor(size: number, kind: number, mtimeMs: number) {
    this.size = size;
    this.isFile = kind === 1;
    this.isDirectory = kind === 2;
    this.mtimeMs = mtimeMs;
  }
}

/** The file's contents decoded as UTF-8 (an invalid sequence becomes U+FFFD). A NUL byte ends the
 * text: the C-string boundary truncates there (docs/FFI.md §3) until byte reads land (T11.3). */
export function readText(path: string): string {
  if (jsrtStdFsReadText(path as CString) !== 0) {
    throw __stdFailure('std/fs.readText', __stdQuote(path));
  }
  return jsrtStdResult();
}

/** Creates or truncates the file and writes `text` as UTF-8. */
export function writeText(path: string, text: string): void {
  if (jsrtStdFsWriteText(path as CString, text as CString) !== 0) {
    throw __stdFailure('std/fs.writeText', __stdQuote(path));
  }
}

export function stat(path: string): Stat {
  if (jsrtStdFsStat(path as CString) !== 0) {
    throw __stdFailure('std/fs.stat', __stdQuote(path));
  }
  return new Stat(jsrtStdFsStatSize(), jsrtStdFsStatKind(), jsrtStdFsStatMtimeMs());
}

/** Creates one directory; its parent must exist, and an existing path is EEXIST. */
export function mkdir(path: string): void {
  if (jsrtStdFsMkdir(path as CString) !== 0) {
    throw __stdFailure('std/fs.mkdir', __stdQuote(path));
  }
}

/** Removes a file (not a directory). */
export function unlink(path: string): void {
  if (jsrtStdFsUnlink(path as CString) !== 0) {
    throw __stdFailure('std/fs.unlink', __stdQuote(path));
  }
}

/** Removes an empty directory; a non-empty one is ENOTEMPTY. */
export function rmdir(path: string): void {
  if (jsrtStdFsRmdir(path as CString) !== 0) {
    throw __stdFailure('std/fs.rmdir', __stdQuote(path));
  }
}

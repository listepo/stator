// The error a failed system call throws (Node v26.7.0 lib/internal/errors.js `uvException`):
// `code`, `errno`, `syscall`, `path` when the call took one, and the message
// `<CODE>: <description>, <syscall>[ '<path>']`. The descriptions and numbers are libuv's, read from
// the pinned Node's `util.getSystemErrorMap()` (checked 2026-10-02); three numbers differ between
// Darwin and Linux. A plain class, not an `Error` subclass: Stator does not compile one yet, so
// `instanceof Error` is false where Node answers true.

import { platform } from 'std/os';

/** libuv's description and errno for each code `std` reports. */
function described(code: string): readonly [string, number] {
  const linux = platform() === 'linux';
  switch (code) {
    case 'EACCES':
      return ['permission denied', -13];
    case 'EBADF':
      return ['bad file descriptor', -9];
    case 'EBUSY':
      return ['resource busy or locked', -16];
    case 'EEXIST':
      return ['file already exists', -17];
    case 'EFBIG':
      return ['file too large', -27];
    case 'EINVAL':
      return ['invalid argument', -22];
    case 'EISDIR':
      return ['illegal operation on a directory', -21];
    case 'ELOOP':
      return ['too many symbolic links encountered', linux ? -40 : -62];
    case 'ENAMETOOLONG':
      return ['name too long', linux ? -36 : -63];
    case 'ENOENT':
      return ['no such file or directory', -2];
    case 'ENOMEM':
      return ['not enough memory', -12];
    case 'ENOSPC':
      return ['no space left on device', -28];
    case 'ENOTDIR':
      return ['not a directory', -20];
    case 'ENOTEMPTY':
      return ['directory not empty', linux ? -39 : -66];
    case 'EPERM':
      return ['operation not permitted', -1];
    case 'EROFS':
      return ['read-only file system', -30];
    default:
      return ['i/o error', -5];
  }
}

export class SystemError {
  readonly name: string = 'Error';
  readonly code: string;
  readonly errno: number;
  readonly syscall: string;
  readonly path: string | undefined;
  readonly message: string;

  constructor(code: string, syscall: string, path: string | undefined) {
    const [description, errno] = described(code);
    this.code = code;
    this.errno = errno;
    this.syscall = syscall;
    this.path = path;
    const where = path === undefined ? '' : ` '${path}'`;
    this.message = `${code}: ${description}, ${syscall}${where}`;
  }

  toString(): string {
    return `${this.name}: ${this.message}`;
  }
}

/** The code a `std` failure carries: its message ends `: <CODE>` (docs/STD.md §3). */
export function stdCode(failure: unknown): string {
  const message = failure instanceof Error ? failure.message : '';
  const at = message.lastIndexOf(': ');
  return at === -1 ? 'EIO' : message.slice(at + 2);
}

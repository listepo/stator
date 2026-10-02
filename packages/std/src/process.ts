// `std/process` — the current process (docs/STD.md §5).

import { jsrtStdResult } from './native/core.js';
import {
  jsrtProcessArgc,
  jsrtProcessArgv,
  jsrtProcessExitCode,
  jsrtProcessSetExitCode,
  jsrtStdProcessAbort,
  jsrtStdProcessCheckStatus,
  jsrtStdProcessExecPath,
  jsrtStdProcessExit,
  jsrtStdProcessHrtimeNs,
  jsrtStdProcessPid,
  jsrtStdProcessPpid,
  jsrtStdProcessRss,
} from './native/process.js';
import { __stdFailure } from './internal/error.ts';
import { __stdStrings } from './internal/strings.ts';

export { arch, platform } from './os.ts';

/** Memory the process uses, in bytes. A class for the reason `std/fs.Stat` is one: a fixed
 * layout compiles static. Programs get one from `memoryUsage`, never `new`. */
export class MemoryUsage {
  /** Resident set size: the physical memory the process occupies now. */
  readonly rss: number;

  constructor(rss: number) {
    this.rss = rss;
  }
}

/** The arguments the program was started with, exactly as `main` received them: `argv()[0]` is
 * the program as it was invoked, and the arguments follow. */
export function argv(): string[] {
  return __stdStrings(jsrtProcessArgc(), (i: number): string => jsrtProcessArgv(i));
}

/** The running executable's absolute path, symbolic links resolved. */
export function execPath(): string {
  if (jsrtStdProcessExecPath() !== 0) {
    throw __stdFailure('std/process.execPath', '');
  }
  return jsrtStdResult();
}

/** Ends the process now with status `code`, an integer 0–255; anything else is EINVAL and the
 * process continues. Buffered `console` output is flushed; pending promise reactions never run —
 * an exit is immediate, not a return from `main`. */
export function exit(code: number): void {
  jsrtStdProcessExit(code);
  throw __stdFailure('std/process.exit', `${code}`);
}

/** The status the program exits with when it ends normally: 0 until `setExitCode` changes it. */
export function exitCode(): number {
  return jsrtProcessExitCode();
}

/** Sets the status a normal end exits with, an integer 0–255 (else EINVAL, and nothing
 * changes). `exit(code)` and an uncaught exception (status 1) still win. */
export function setExitCode(code: number): void {
  if (jsrtStdProcessCheckStatus(code) !== 0) {
    throw __stdFailure('std/process.setExitCode', `${code}`);
  }
  jsrtProcessSetExitCode(code);
}

/** The process id. */
export function pid(): number {
  return jsrtStdProcessPid();
}

/** The parent's process id. */
export function ppid(): number {
  return jsrtStdProcessPpid();
}

/** A monotonic clock in nanoseconds from an arbitrary origin: only differences mean anything.
 * Exact below 2^53 ns (about 104 days of uptime), microsecond-close beyond. */
export function hrtimeNs(): number {
  return jsrtStdProcessHrtimeNs();
}

/** How much memory the process uses now. */
export function memoryUsage(): MemoryUsage {
  const rss = jsrtStdProcessRss();
  if (rss < 0) {
    throw __stdFailure('std/process.memoryUsage', '');
  }
  return new MemoryUsage(rss);
}

/** Ends the process abnormally (`SIGABRT`), without flushing buffered output. */
export function abort(): void {
  jsrtStdProcessAbort();
}

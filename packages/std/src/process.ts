// `std/process` — the current process (docs/STD.md §5).

import { jsrtStdProcessAbort, jsrtStdProcessExit, jsrtStdProcessPid } from './native/process.js';
import { __stdFailure } from './internal/error.ts';

/** Ends the process now with status `code`, an integer 0–255; anything else is EINVAL and the
 * process continues. Buffered `console` output is flushed; pending promise reactions never run —
 * an exit is immediate, not a return from `main`. */
export function exit(code: number): void {
  jsrtStdProcessExit(code);
  throw __stdFailure('std/process.exit', `${code}`);
}

/** The process id. */
export function pid(): number {
  return jsrtStdProcessPid();
}

/** Ends the process abnormally (`SIGABRT`), without flushing buffered output. */
export function abort(): void {
  jsrtStdProcessAbort();
}

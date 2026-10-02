// `std/process` bindings. The `jsrt_std_process_*` functions are packages/std/zig/process.zig;
// the `jsrt_process_*` ones are the runtime's process slots (packages/runtime/src/jsrt_process.c),
// which `main` fills and returns.
import type { CString } from './core.js';

/** Returns only on failure (an out-of-range status), with 1. */
/** @statorExtern jsrt_std_process_exit */
export declare function jsrtStdProcessExit(code: number): number;

/** 0 when `code` is a valid exit status, else 1 with EINVAL recorded. */
/** @statorExtern jsrt_std_process_check_status */
export declare function jsrtStdProcessCheckStatus(code: number): number;

/** @statorExtern jsrt_std_process_pid */
export declare function jsrtStdProcessPid(): number;

/** @statorExtern jsrt_std_process_ppid */
export declare function jsrtStdProcessPpid(): number;

/** @statorExtern jsrt_std_process_abort */
export declare function jsrtStdProcessAbort(): void;

/** Parks the executable's path in the result slot. */
/** @statorExtern jsrt_std_process_exec_path */
export declare function jsrtStdProcessExecPath(): number;

/** @statorExtern jsrt_std_process_hrtime_ns */
export declare function jsrtStdProcessHrtimeNs(): number;

/** Resident set size in bytes, or -1 with EIO recorded. */
/** @statorExtern jsrt_std_process_rss */
export declare function jsrtStdProcessRss(): number;

/** @statorExtern jsrt_process_argc */
export declare function jsrtProcessArgc(): number;

/** `main`'s `argv[index]`; the caller keeps `index` below `jsrtProcessArgc()`. */
/** @statorExtern jsrt_process_argv */
export declare function jsrtProcessArgv(index: number): CString;

/** @statorExtern jsrt_process_exit_code */
export declare function jsrtProcessExitCode(): number;

/** Takes a status `jsrtStdProcessCheckStatus` accepted. */
/** @statorExtern jsrt_process_set_exit_code */
export declare function jsrtProcessSetExitCode(code: number): void;

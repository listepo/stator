// `std/process` bindings (packages/std/zig/process.zig).

/** Returns only on failure (an out-of-range status), with 1. */
/** @statorExtern jsrt_std_process_exit */
export declare function jsrtStdProcessExit(code: number): number;

/** @statorExtern jsrt_std_process_pid */
export declare function jsrtStdProcessPid(): number;

/** @statorExtern jsrt_std_process_abort */
export declare function jsrtStdProcessAbort(): void;

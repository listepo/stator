// `std/io` bindings (packages/std/zig/io.zig). Status returns: 0 success, 1 failure with the code
// in `jsrtStdLastError`; bytes cross as a `Uint8Array`, the view's own storage (docs/FFI.md §2).
import type { CString } from './core.js';

/** @statorExtern jsrt_std_io_write */
export declare function jsrtStdIoWrite(fd: number, text: CString): number;

/** Writes all of `bytes`. */
/** @statorExtern jsrt_std_io_write_bytes */
export declare function jsrtStdIoWriteBytes(fd: number, bytes: Uint8Array): number;

/** Reads at most `max` bytes into `into`: the count, or -1 on failure. */
/** @statorExtern jsrt_std_io_read */
export declare function jsrtStdIoRead(fd: number, max: number, into: Uint8Array): number;

/** 1 for a terminal, else 0. */
/** @statorExtern jsrt_std_io_isatty */
export declare function jsrtStdIoIsatty(fd: number): number;

/** @statorExtern jsrt_std_io_terminal_size */
export declare function jsrtStdIoTerminalSize(fd: number): number;

/** @statorExtern jsrt_std_io_terminal_columns */
export declare function jsrtStdIoTerminalColumns(): number;

/** @statorExtern jsrt_std_io_terminal_rows */
export declare function jsrtStdIoTerminalRows(): number;

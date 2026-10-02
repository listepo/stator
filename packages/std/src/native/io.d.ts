// `std/io` bindings (packages/std/zig/io.zig). Status returns: 0 success, 1 failure with the code
// in `jsrtStdLastError`; bytes travel through the byte channel (native/core.d.ts).
import type { CString } from './core.js';

/** @statorExtern jsrt_std_io_write */
export declare function jsrtStdIoWrite(fd: number, text: CString): number;

/** Writes the bytes pushed into the byte channel. */
/** @statorExtern jsrt_std_io_write_bytes */
export declare function jsrtStdIoWriteBytes(fd: number): number;

/** Parks what it read in the byte channel. */
/** @statorExtern jsrt_std_io_read */
export declare function jsrtStdIoRead(fd: number, max: number): number;

/** 1 for a terminal, else 0. */
/** @statorExtern jsrt_std_io_isatty */
export declare function jsrtStdIoIsatty(fd: number): number;

/** @statorExtern jsrt_std_io_terminal_size */
export declare function jsrtStdIoTerminalSize(fd: number): number;

/** @statorExtern jsrt_std_io_terminal_columns */
export declare function jsrtStdIoTerminalColumns(): number;

/** @statorExtern jsrt_std_io_terminal_rows */
export declare function jsrtStdIoTerminalRows(): number;

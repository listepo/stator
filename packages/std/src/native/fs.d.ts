// `std/fs` bindings (packages/std/zig/fs.zig). Status returns: 0 success, 1 failure with the code
// in `jsrtStdLastError`. Bytes cross as a `Uint8Array`, the view's own storage (docs/FFI.md §2).
import type { CString } from './core.js';

/** @statorExtern jsrt_std_fs_read_text */
export declare function jsrtStdFsReadText(path: CString): number;

/** @statorExtern jsrt_std_fs_write_text */
export declare function jsrtStdFsWriteText(path: CString, text: CString): number;

/** @statorExtern jsrt_std_fs_stat */
export declare function jsrtStdFsStat(path: CString): number;

/** @statorExtern jsrt_std_fs_stat_size */
export declare function jsrtStdFsStatSize(): number;

/** 0 other, 1 regular file, 2 directory. */
/** @statorExtern jsrt_std_fs_stat_kind */
export declare function jsrtStdFsStatKind(): number;

/** @statorExtern jsrt_std_fs_stat_mtime_ms */
export declare function jsrtStdFsStatMtimeMs(): number;

/** @statorExtern jsrt_std_fs_mkdir */
export declare function jsrtStdFsMkdir(path: CString): number;

/** @statorExtern jsrt_std_fs_unlink */
export declare function jsrtStdFsUnlink(path: CString): number;

/** @statorExtern jsrt_std_fs_rmdir */
export declare function jsrtStdFsRmdir(path: CString): number;

/** Reads the whole file and parks it: the byte count, or -1 with the code recorded. */
/** @statorExtern jsrt_std_fs_read_bytes */
export declare function jsrtStdFsReadBytes(path: CString): number;

/** Copies the parked file into `out` (its exact size) and frees it. */
/** @statorExtern jsrt_std_fs_read_bytes_take */
export declare function jsrtStdFsReadBytesTake(out: Uint8Array): number;

/** 1 when the path names anything, else 0 (never an error). */
/** @statorExtern jsrt_std_fs_exists */
export declare function jsrtStdFsExists(path: CString): number;

/** Parks the canonical path in the result slot. */
/** @statorExtern jsrt_std_fs_realpath */
export declare function jsrtStdFsRealpath(path: CString): number;

/** @statorExtern jsrt_std_fs_utimes */
export declare function jsrtStdFsUtimes(path: CString, atimeMs: number, mtimeMs: number): number;

/** Parks the sorted entry names for the two readers below. */
/** @statorExtern jsrt_std_fs_readdir */
export declare function jsrtStdFsReaddir(path: CString): number;

/** @statorExtern jsrt_std_fs_readdir_count */
export declare function jsrtStdFsReaddirCount(): number;

/** @statorExtern jsrt_std_fs_readdir_name */
export declare function jsrtStdFsReaddirName(index: number): CString;

/** The new descriptor, or -1 with the code recorded. */
/** @statorExtern jsrt_std_fs_open */
export declare function jsrtStdFsOpen(path: CString, flags: CString): number;

/** @statorExtern jsrt_std_fs_close */
export declare function jsrtStdFsClose(fd: number): number;

/** Reads at most `max` bytes into `into`: the count, or -1 on failure. */
/** @statorExtern jsrt_std_fs_read */
export declare function jsrtStdFsRead(
  fd: number,
  max: number,
  position: number,
  into: Uint8Array,
): number;

/** Writes all of `data`. */
/** @statorExtern jsrt_std_fs_write */
export declare function jsrtStdFsWrite(fd: number, position: number, data: Uint8Array): number;

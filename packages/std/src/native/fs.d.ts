// `std/fs` bindings (packages/std/zig/fs.zig). Status returns: 0 success, 1 failure with the code
// in `jsrtStdLastError`.
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

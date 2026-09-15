// sqlite3.d.ts — manual binding for SQLite, opaque-handle + error-code shape
// (plan.md §10 Task 7.3 step 1).
//
// Shape covered: opaque handles (`sqlite3*`, `sqlite3_stmt*`) as branded
// pointers, strings in both directions, integer error codes. Exercises the
// hard rules at once, which is why the phase Check uses SQLite.
//
// VERIFIED against headers: /opt/homebrew/opt/sqlite/include/sqlite3.h
// (brew `sqlite`, 3.51.0 — `pkg-config --modversion sqlite3` agrees) and the
// Xcode SDK copy. Declared signatures below reproduce the header's parameter
// lists; constructors are expressible via `Out` slots since v0.1, while
// `open_v2` (`zVfs` spelling), `bind_text` (function pointer), `exec`
// (callback + out-param), int64 returns (no ABI row), and macros (out of
// scope) stay refused below with reasons, not approximated
// (docs/FFI.md §2; Task 7.3 step 5).
//
// Build: links against libsqlite3 (`-lsqlite3`). No link-pragma spelling
// exists yet (Task 7.1 step 7 unstarted) — see NOTES.md ("no link pragma").

// Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md §3).
type CString = string & { readonly __statorCstr: 'CString' };

// v0.1 out-slot spelling for `T**` out-params (docs/FFI.md §2).
// Slots live in locals, pass to Out params, read via `.value`.
type Out<T> = { readonly value: T };

// Blessed slot constructor, recognized by name.
declare function outSlot<T>(): Out<T>;

/** Opaque database connection handle (`sqlite3*`). Lifetime belongs to the
 *  C library: created by `sqlite3_open_v2`, destroyed by `sqlite3_close*`.
 *  Never dereferenced by generated code (docs/FFI.md §2). */
type SqliteDb = { readonly __brand: 'sqlite3' };

/** Opaque prepared-statement handle (`sqlite3_stmt*`). Lifetime belongs to
 *  the C library: created by `sqlite3_prepare_v2`, destroyed by
 *  `sqlite3_finalize`. Never dereferenced by generated code. */
type SqliteStmt = { readonly __brand: 'sqlite3_stmt' };

// --- Version: pure scalars, no handle needed. ---

/** @statorExtern sqlite3_libversion_number */
declare function sqliteVersionNumber(): number;

// --- Error message: string OUT. ---
//
// Ownership (docs/FFI.md §3, out): the returned `const char*` is COPIED into
// a fresh runtime string at the boundary — never wrapped, never freed by the
// runtime. The pointer stays owned by the `sqlite3*` handle and is
// invalidated by the next SQLite call on that handle, so the copy is what
// makes the value safe to keep. Declared return is `CString` (borrow spelling
// reused for "copy out"; see NOTES.md "errmsg lifetime").

/** @statorExtern sqlite3_errmsg */
declare function sqliteErrmsg(db: SqliteDb): CString;

// --- Connection teardown: handle in, result code out. ---
//
// Ownership: `db` is borrowed for the call; on SQLITE_OK the library has
// freed the handle and the TS side must not use the value again — a rule the
// compiler cannot check, stated here per docs/FFI.md §6.
// Error convention: nonzero return throws. SQLITE_BUSY (handle left open,
// unfinalized statements outstanding) is therefore an exception, not a code
// the caller compares — see NOTES.md ("close BUSY").

/** @statorExtern sqlite3_close @statorError nonzero */
declare function sqliteClose(db: SqliteDb): number;

// --- Stepping and finalizing: the row-vs-done distinction. ---
//
// Ownership: `stmt` borrowed for the call in both.
// Error convention: NONE — deliberately. `sqlite3_step` returns SQLITE_ROW
// (100) for "another row ready" and SQLITE_DONE (101) for "finished", and
// neither means failure (see NOTES.md "step codes"). The caller compares the
// plain `number` return against SQLITE_ROW / SQLITE_DONE.
// SQLITE_* result-code macros have no spelling in v0 (macros are out of
// scope, Task 7.3 step 5), so callers compare against numeric literals until
// a constants mechanism exists — see NOTES.md ("macro constants").

/** @statorExtern sqlite3_step */
declare function sqliteStep(stmt: SqliteStmt): number;

/** @statorExtern sqlite3_finalize @statorError nonzero */
declare function sqliteFinalize(stmt: SqliteStmt): number;

// --- Column reads: handle + index in, scalar out. ---
//
// Ownership: parameters are copies (`number`); nothing retained.
// `sqlite3_column_text` returns `const unsigned char*` owned by the statement
// handle: COPIED into a fresh runtime string at the boundary (docs/FFI.md §3,
// out). A SQL NULL column yields a C NULL return, which `from_cstr` asserts
// on — guarded here by `@statorError null`, so NULL becomes an exception
// rather than an assert (see NOTES.md "column NULL").

/** @statorExtern sqlite3_column_int */
declare function sqliteColumnInt(stmt: SqliteStmt, col: number): number;

/** @statorExtern sqlite3_column_double */
declare function sqliteColumnDouble(stmt: SqliteStmt, col: number): number;

/** @statorExtern sqlite3_column_text @statorError null */
declare function sqliteColumnText(stmt: SqliteStmt, col: number): CString;

// --- Scalar binds: handle + index + value in, result code out. ---
//
// Ownership: all parameters borrowed for the call (doubles/ints are copies
// anyway). `sqlite3_bind_text` is NOT here: its destructor argument is a
// function pointer (`void(*)(void*)`), which v0 refuses (STA1117) — see the
// refusals below and NOTES.md ("bind destructor").

/** @statorExtern sqlite3_bind_int @statorError nonzero */
declare function sqliteBindInt(stmt: SqliteStmt, index: number, value: number): number;

/** @statorExtern sqlite3_bind_double @statorError nonzero */
declare function sqliteBindDouble(stmt: SqliteStmt, index: number, value: number): number;

// --- Scalar metadata: handle in, int out. ---
//
// `sqlite3_changes` returns C `int` — the ABI table's `number` + `i32`
// refinement row. There is no declaration-site spelling for the refinement
// (it is compiler-tracked, docs/NUMERIC.md), so the binding says `number`
// and the generator must narrow C `int` results through the refinement — see
// NOTES.md ("i32 spelling").

/** @statorExtern sqlite3_changes */
declare function sqliteChanges(db: SqliteDb): number;

// --- Constructors via out-slots: handle + statement creation. ---
//
// Ownership: the caller holds each slot in a local (`outSlot()`), passes it
// as the `Out` param, checks the numeric return code, then reads `.value`.
// `sqliteOpenDb`'s handle is library-owned (close to release);
// `sqlitePrepare`'s statement is library-owned (finalize to release).

/** @statorExtern sqlite3_open */
declare function sqliteOpenDb(filename: CString, db: Out<SqliteDb>): number;

// `pzTail` is `const char**` out → `Out<CString>` (copy-on-read; a NULL tail
// is guarded by checking the return code first, before reading `.value`).
/** @statorExtern sqlite3_prepare_v2 */
declare function sqlitePrepare(
  db: SqliteDb,
  sql: CString,
  nByte: number,
  stmt: Out<SqliteStmt>,
  tail: Out<CString>,
): number;

// ============================================================================
// REFUSED (v0 scope; recorded, not approximated — Task 7.3 step 5).
// Each entry names the construct and the header line it comes from, which is
// what the future generator must emit as a diagnostic.
// ============================================================================
//
// `sqlite3_open_v2(filename, ppDb, flags, zVfs)` (sqlite3.h:3998) stays
// refused for `zVfs`: nullable `const char*` has no v0 spelling (STA1119
// naming `zVfs`). `ppDb` is expressible via `Out<SqliteDb>` — see
// `sqliteOpenDb` (`sqlite3_open`) above; only `open_v2` stays refused.
//
// `sqlite3_prepare_v2` is now declared as `sqlitePrepare` above.
//
// 1. `sqlite3_bind_text(stmt, i, z, n, destructor)` (sqlite3.h:5016) —
//    `void(*)(void*)` destructor is a function-pointer parameter: STA1117.
//    The value-passing choice (SQLITE_STATIC vs SQLITE_TRANSIENT — macros,
//    out of scope) cannot be spelled either.
// 2. `sqlite3_exec(db, sql, callback, arg, errmsg)` (sqlite3.h:430) —
//    callback function pointer (STA1117) AND `char** errmsg` out-param
//    (STA1119): doubly refused.
// 3. `sqlite3_last_insert_rowid` / `sqlite3_changes64` (sqlite3.h:2795,2871) —
//    `sqlite3_int64` (signed 64-bit) return has no ABI-table row (`number` is
//    `double` and cannot hold every int64 exactly): STA1119. See NOTES.md
//    ("int64").
// 4. `SQLITE_OK` / `SQLITE_ROW` / `SQLITE_DONE` / `SQLITE_OPEN_*` macros
//    (sqlite3.h:449,479-480,603+) — macro constants are out of scope
//    (Task 7.3 step 5); no diagnostic code is allocated for the generator's
//    refusal yet. See NOTES.md ("macro constants").

// string.d.ts — manual binding for C strings (`string.h`), borrow + copy-out shape
// (plan.md §10 Task 7.3 step 1).
//
// Shape covered: NUL-terminated strings in both directions without ownership
// transfer — `CString` borrows in, copied `CString` out, one allocating
// function (`strdup`) whose free companion lives in stdlib.d.ts. Proves the
// §3 borrow/copy rules carry real libc functions, and that the stateful half
// of `string.h` (mutable buffers, tokenizers, reentrant variants) sits
// outside v0.
//
// VERIFIED against headers: the Xcode SDK `usr/include/_string.h`
// (MacOSX.sdk — `strcmp` :89, `strerror` :95, `strlen` :96, `strncmp`
// :101-102, `strncpy` :104, `strtok` :111, `strtok_r` :126, `strerror_r`
// :139, `strdup` :141). Declared signatures below reproduce the header's
// parameter lists; anything the v0 surface cannot express is refused in
// comments, not approximated (docs/FFI.md §2; Task 7.3 step 5).
//
// Build: libc, no extra link flag. No link-pragma spelling exists yet
// (Task 7.1 step 7 unstarted) — see NOTES.md ("no link pragma").
//
// Every declaration carries the per-declaration marker (docs/FFI.md §1). The
// C symbol rides in the tag's trailing text (`@statorExtern strlen`): TS
// names stay idiomatic (`cStrlen`) while the emitter calls the libc symbol.
// One C symbol per TS name — no overloads here (docs/FFI.md §1).

// Borrowed NUL-terminated UTF-8 at the FFI boundary (docs/FFI.md §3).
// Unused ownership half: nothing here takes `CStringOwned` (no callee
// retains a string); repeated here so the file is a drop-in without
// cross-file references.
type CString = string & { readonly __statorCstr: "CString" };

// --- Length and comparison: pure `CString` borrows. ---
//
// Ownership: every parameter is a `CString` borrow (freed after return; the
// callee retains nothing). `size_t` (`strlen`'s return, `strncmp`'s `n`)
// travels as `number` — there is no declaration-site width spelling (same
// gap family as the `i32` refinement; see NOTES.md "size_t width").
// `strncmp`'s `n` counts BYTES of the encoded copies (§3), not JS `.length`
// units — see NOTES.md ("counted functions"). The binding takes the number
// it is given; who computes it is a call-convention question, not answered
// here.
// Error convention: none (absent tag — the returns are values, never
// exceptions). `strcmp`/`strncmp`'s negative/zero/positive ordering is data,
// not failure: it must NEVER be read as `@statorError negative` (see
// NOTES.md "sign collision").

/** @statorExtern strlen */
declare function cStrlen(s: CString): number;

/** @statorExtern strcmp */
declare function cStrcmp(a: CString, b: CString): number;

/** @statorExtern strncmp */
declare function cStrncmp(a: CString, b: CString, n: number): number;

// --- Duplication: allocating copy-out with a fallible return. ---
//
// Ownership (docs/FFI.md §3, out): `strdup` `malloc`s its return; the
// boundary COPIES it into a fresh runtime string, and the C original must
// still be freed — by `cFree` in stdlib.d.ts, the companion free function
// §3 demands (see NOTES.md "companion file" for the same-file question).
// A NULL return can only mean allocation failure (ENOMEM): there is no
// "empty vs missing" second reading as there is for a NULL column
// (contrast NOTES.md "column NULL" in the sqlite round).
// Error convention: `@statorError null` — allocation failure returns NULL,
// which throws. The `errno` detail (ENOMEM) is lost: conventions do not
// stack (see NOTES.md "error composition", second instance after stat).

/** @statorExtern strdup @statorError null */
declare function cStrdup(s: CString): CString;

// --- Error string: static-buffer copy-out. ---
//
// Ownership (docs/FFI.md §3, out): the returned pointer addresses a static
// buffer owned by the C library — COPIED into a fresh runtime string at the
// boundary, never wrapped, never freed. The source is invalidated by the
// next `strerror` (or `strerror_r`) call in the process, so the copy is
// what makes the value safe to keep (same template as `sqliteErrmsg`; see
// NOTES.md "static buffer"). `strerror` is not required to be thread-safe;
// the reentrant spelling is refused below, and v0 FFI is single-threaded
// anyway (docs/FFI.md §2).
// Error convention: none. `strerror` never returns NULL on this platform
// (unknown codes yield "Unknown error: N"); a NULL guard would be a lie
// about the header.

/** @statorExtern strerror */
declare function cStrerror(errnum: number): CString;

// ============================================================================
// REFUSED (v0 scope; recorded, not approximated — Task 7.3 step 5).
// Each entry names the construct and the header line it comes from, which is
// what the future generator must emit as a diagnostic.
// ============================================================================
//
// 1. `strncpy(dst, src, n)` (_string.h:104) — `char *dst` is a CALLER-PROVIDED
//    mutable buffer: v0 has no mutable-buffer spelling (the ABI table's only
//    string rows are borrow/copy `CString`): STA1119 catch-all. The `n` bound
//    is expressible (`number`); the destination is not.
// 2. `strtok(str, sep)` (_string.h:111) — `char *str` is mutated in place
//    AND the tokenizer keeps internal static state between calls: a mutable
//    buffer plus a hidden lifetime, doubly outside the table: STA1119. Even
//    the "first call with a fresh string" use cannot be isolated from the
//    retained state.
// 3. `strtok_r(str, sep, lasts)` (_string.h:126) — `char **lasts` is a `T**`
//    out-param: STA1119 (docs/FFI.md §2, open item §7.4; same rule as the
//    `sqlite3_open_v2` / `prepare` refusals). The reentrant half does not
//    save the un-reentrant one: the `char*` mutation refuses first.
// 4. `strerror_r(errnum, buf, buflen)` (_string.h:139) — caller-provided
//    `char *buf` plus the XSI `int`-return convention (0 / ERANGE), whose
//    meaning differs from the GNU `char*`-returning variant of the same
//    name on other platforms: mutable buffer (STA1119) with a
//    platform-split signature on top. A future platform-conditional
//    generator could pick the XSI spelling; v0 cannot — refused, not picked-a-side.

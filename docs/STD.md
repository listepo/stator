# STD.md — Stator's `std` library

> **Status: v0 implemented** (plan.md §11c T11.2): `std/env`, `std/path`, `std/process`, sync
> `std/fs` and `std/time` live in `packages/std` and compile into any program that imports them.
> `std/sync` and `std/thread` wait for T10.2; the N1 additions (`std/os`, `std/io`, …) are T11.3.
> On any disagreement between this file and plan.md §11b/§11c, the plan wins (§15.3).

`std` is a **first-party systems-style standard library**, not a Node compatibility layer and
not user FFI (Phase 7). Users import typed modules (`std/env`, `std/fs`, …); the compiler
resolves the edge to the library's own TypeScript, which calls Zig backings in
`libjsrt_std.a`. Where `std` crosses into native code, Phase 7's extern rules (docs/FFI.md)
apply unchanged — `std` is written against the same surface a user's FFI is.

## 1. Module path: `std/*`

Imports spell `std/env`, `std/fs`, … — a **reserved prefix**, not a package and not
`@stator/std`. Rationale: `@stator/std` reads as an npm package, and bare package imports are
refused (STA1214, phaseless) — a std spelling that looks like a package invites exactly the
confusion that refusal exists to prevent.

One module owns the prefix: `packages/compiler/src/frontend/std.ts`.

- A **std module** is a lower-case top-level `packages/std/src/<name>.ts`. `std/<name>`
  resolves to it through a `paths` entry on the program's own compiler options, so the
  checker, the gate and the module graph all resolve it the same way.
- `std/sync` and `std/thread` are **not-yet** (`STA1214`, Phase 10, T10.2: OS threads).
- **Any other `std/…`** is a hard error, `STA3002`, listing the std modules — never a
  fall-through to a package lookup. That includes the library's own plumbing
  (`std/internal/error`, `std/native/env`): only top-level modules are importable.
- The std root is the sibling workspace package (`packages/std`), or `STATOR_STD_ROOT` when
  set.

Nothing about `std` depends on the mode: a `js`-mode program imports the same typed modules,
and its untyped arguments cross the boundary checks the typed signatures imply. Below the
frontend nothing knows a file came from `std`, except the link (§6).

## 2. Sync vs Promise APIs

v0 ships **sync only**. Promise-flavored `std/fs` arrives with T10.2 as thin `async` wrappers
that `await` a thread-pool job (Design B). Until then there is no sync-under-`async` lie that
blocks main by accident (T10.1 step 5).

The twins are named now, so a program that reaches for one hears when it lands rather than that
it does not exist. Each sync call's twin is its name plus `Async`, answering a `Promise`:
`readTextAsync`, `writeTextAsync`, `statAsync`, `mkdirAsync`, `unlinkAsync`, `rmdirAsync`.
Importing one is **not-yet** (`STA1214`, Phase 10, T10.2), in both modes. Any other name `std/fs`
does not export is the checker's ordinary error (`STA0012`). The list lives beside the module
list in `packages/compiler/src/frontend/std.ts`.

## 3. Error model

`std` never answers failure silently: no `-1` returns, no `null` where an error belongs. A
failing call **throws an `Error`** whose message is

```
std/<module>.<function>(<argument>): <CODE>
```

for example `std/fs.readText('/tmp/x/missing.txt'): ENOENT`. A string argument is quoted
with single quotes, a number is printed as JavaScript prints it, and `std/env.set` names
only the variable, never the value (it may be a secret).

`<CODE>` is a POSIX errno name from this closed vocabulary. It maps the backing's Zig error
(`packages/std/zig/jsrt_std.zig` `failWith`), and once listed a code is never renamed:

| Code | Meaning (Zig error) |
|---|---|
| `ENOENT` | no such file or directory (`FileNotFound`) |
| `EACCES` | permission denied (`AccessDenied`, `PermissionDenied`) |
| `EEXIST` | the path already exists (`PathAlreadyExists`) |
| `ENOTDIR` | a path component is not a directory (`NotDir`) |
| `EISDIR` | the path is a directory (`IsDir`) |
| `ENOTEMPTY` | the directory is not empty (`DirNotEmpty`) |
| `ENAMETOOLONG` | the path is too long (`NameTooLong`) |
| `ELOOP` | too many symbolic links (`SymLinkLoop`) |
| `ENOSPC` | no space left on the device (`NoSpaceLeft`) |
| `EROFS` | read-only file system (`ReadOnlyFileSystem`) |
| `EBUSY` | the file or device is busy (`FileBusy`, `DeviceBusy`) |
| `ENOMEM` | out of memory or system resources (`OutOfMemory`, `SystemResources`) |
| `EINVAL` | an invalid argument: a bad path, an empty or `=`-holding variable name, an exit code outside `0..255`, a sleep outside `0..2^31-1` ms (`BadPathName`, or checked before the call) |
| `EFBIG` | the file is too large (`FileTooBig`, `StreamTooLong`) |
| `EIO` | any other failure — never a guess at a closer code |

**v0 carries the code in the message only.** The plan is an `Error` with a `code` property,
but a `class StdError extends Error` does not compile yet (Phase 5's class work), so v0 throws
a plain `Error` and the code is the message's tail. When subclassing `Error` lands, the
thrown value gains `code` with these same strings; the message stays as it is.

## 4. Platforms

POSIX first. The backings use Zig's `std.Io`, so most of them are not POSIX-specific, but CI
builds the archive only on the Unix runtime jobs, like the runtime itself. Where the OS answers
differ, `std` answers one way and says so (§5).

## 5. v0 modules

| Module | v0 surface | Notes |
|---|---|---|
| `std/env` | `has(name): boolean`, `get(name): string \| undefined`, `set(name, value)`, `unset(name)`, `cwd(): string` | `setenv`/`unsetenv` semantics: an empty name or one containing `=` is `EINVAL`; unsetting an unset name succeeds. `args` moved to T11.3 as `std/process.argv` (plan-notes 294) |
| `std/process` | `exit(code)`, `pid(): number`, `abort()` | `exit` takes an integer `0..255` (else `EINVAL`, and nothing exits) and runs libc `exit`, so buffered output is flushed. `abort` raises `SIGABRT`. No signals yet |
| `std/path` | `isAbsolute`, `basename`, `dirname`, `join(a, b)` | pure TypeScript, no backing (see below) |
| `std/fs` | `readText(path)`, `writeText(path, text)`, `stat(path): Stat`, `mkdir(path)`, `unlink(path)`, `rmdir(path)` | sync and path-only (see below); the `…Async` Promise twins are not-yet, T10.2 (§2) |
| `std/time` | `nowMs(): number`, `sleepMs(ms)` | `nowMs` is whole milliseconds since the Unix epoch (`Date.now()`); `sleepMs` blocks the only thread on the monotonic clock, fractions truncated |
| `std/sync` | — | not-yet, T10.2 |
| `std/thread` | — | not-yet, T10.2 |

**`std/path` semantics** are POSIX `basename(3)`/`dirname(3)`, not Node's `path.posix`:
trailing slashes are ignored (`/a/b/` names `b`), the root names itself (`basename('/')` is
`/`, where Node answers `''`), runs of slashes before the last segment collapse
(`dirname('a//b')` is `a`), and nothing is normalized — `.` and `..` are ordinary segments.
`join` takes exactly two segments: an absolute second segment is the answer by itself,
otherwise the two meet at exactly one `/`.

**`std/fs` semantics.** Paths are absolute or relative to the working directory, resolved by
the OS; nothing is normalized. Text is UTF-8 both ways: an invalid byte sequence read back
becomes U+FFFD, and a NUL byte ends the text, because file contents cross the C-string
boundary (docs/FFI.md §3) until byte reads land with T11.3. `stat` follows symbolic links and
answers a `Stat` with `size`, `isFile`, `isDirectory` and `mtimeMs` (whole milliseconds).
`Stat` is a class rather than an interface because a class instance has a fixed layout and
compiles static (an interface-typed object literal is a dynamic object); programs get one from
`stat`, never from `new`. `mkdir` creates one directory (its parent must exist), `rmdir`
removes only an empty one (`ENOTEMPTY` otherwise), and `unlink` removes a non-directory —
unlinking a directory is `EISDIR` on every platform (macOS's own answer is `EPERM`, which is
what Node reports there). `unlink` and `rmdir` were planned for T11.3 and landed here, because
a test that creates files has to remove them.

**Verdicts.** A std module is ordinary strict TypeScript, and `explain` reports its functions
like any other file in the graph: everything is `static` except `std/env.get`, whose
`string | undefined` answer is a union the HIR boxes, so an importer of `std/env` explains as
`dynamic` (docs/SUBSET.md).

## 6. Implementation layers

```
packages/std/
  src/<module>.ts          the surface users import (strict TS, Stator's own subset)
  src/native/<module>.d.ts its `@statorExtern` declarations (module-form: they export)
  src/native/core.d.ts     `CString` and the shared result/error slots
  src/internal/error.ts    the §3 message builder
  zig/jsrt_std.zig         the root: panic handler, allocator, result + error slots
  zig/<module>.zig         one backing file per module, exporting `jsrt_std_<module>_*`
  justfile                 `just std` → build/libjsrt_std.a
```

- **Extern surface.** Each backing is an ordinary `@statorExtern` function (docs/FFI.md). The
  declarations are module-form `.d.ts` files the surface imports by relative path, so neither
  `CString` nor any binding lands in a user program's global scope.
- **Strings out.** A backing that answers a string parks it in one result slot and returns a
  status; the surface reads it with `jsrtStdResult()`, whose `CString` return the emitter
  copies into a JS string at once (`jsrt_string_from_cstr`). The slot frees the previous answer
  when the next one is parked, so nothing leaks and nothing is read after it is freed.
- **Status and errors.** A backing returns `0` for success and `1` for failure, after storing
  the §3 code where `jsrtStdLastError()` reads it; the surface throws.
- **Panics.** A safety trap in a backing (ReleaseSafe) prints `stator std: internal error:`
  and the message to stderr, then aborts. It is always a bug in `std`.
- **The archive** is built `-O ReleaseSafe`, `-fPIC`, `-mcpu=baseline`, with function and data
  sections, and the macOS deployment target clang uses (the runtime's own Zig rules). It calls
  only libc — never `libjsrt` — so one flavor serves every runtime flavor (plain, ASan, intl).
- **The link.** `cli/build.ts` adds `packages/std/build/libjsrt_std.a` to the link line, before
  `-ljsrt`, only when the program's module graph holds a std source file. A program that
  imports no `std/*` module never names the archive. A missing archive is `STA0011`, naming
  the `just … std` recipe.

Build it with `pnpm run runtime` (which builds the runtime and then the std archive) or
`just -f packages/std/justfile -d packages/std std`. `pnpm run test:asan` and
`pnpm run test:intl` build it too. moon's `std:build` task does the same, and every linking
test task depends on it.

## 7. Testing

- **Goldens** (`packages/tests/golden/ts/std_*.ts`, `js/std_js.js`) import `std/*` exactly as a
  user does. Node, the oracle, loads `golden/std-oracle.ts` first: a resolve hook that maps
  `std/<name>` to a Node-API twin in `golden/std-oracle/<name>.ts`, which must produce the
  same values and the same §3 messages. A module with no backing (`std/path`) maps to the real
  `packages/std/src/<name>.ts`, so the golden proves Stator compiles that source the way Node
  runs it.
- **Decision tests** (`packages/tests/subset/subset_std_*`) cover each module in both modes,
  plus the unknown (`STA3002`), threads (`STA1214`) and Promise-twin (`STA1214`) refusals.
- **Unit tests** (`packages/tests/unit/std.test.ts`) prove the conditional link and the two
  exits a golden cannot run: a non-zero `exit` and `abort`.

## 8. v0 limitations

- **C-string boundary.** `std/fs` text stops at a NUL byte, and every string argument is
  passed as UTF-8 (§5).
- **No `code` property** on thrown errors yet (§3).

## 9. Decisions that were open

1. **Error codes** (§3): POSIX errno names, one closed table for all of `std`, `EIO` for
   anything outside it.
2. **`std/path` edge semantics** (§5): POSIX `basename(3)`/`dirname(3)`, no normalization,
   two-segment `join`; Node's `path.posix` is not the reference.
3. **`std/fs` surface**: path-only in v0. File descriptors are T11.3, with a second lifetime
   to own.
4. **Encoding**: UTF-8 at every native edge. Invalid bytes coming back become U+FFFD, as
   FFI's `from_cstr` already does; nothing throws over encoding.

## 10. What `std` is not

- Not a Node polyfill: `std/fs.readText` does not accept Node's option bags or match its
  error strings — it matches POSIX and documents deltas. `packages/node` (T11.6) builds
  `node:*` on top of `std`, not the other way round.
- Not user FFI: users cannot add `std/*` modules; the prefix is reserved. Native
  extensibility stays Phase 7's `declare` surface.
- Not threads (v0): the T10.2 modules refuse until the bridge exists; the refusal names
  Phase 10, not a workaround.

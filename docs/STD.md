# STD.md — Stator's `std` library (Phase 10, T10.1) — DRAFT SKELETON

> **Status: draft skeleton, no implementation.** This file is T10.1 step 1's docs-before-code
> (§15.6): it freezes the decisions code will later implement, and marks what is still open.
> Nothing here is implemented — there is no `std/` import edge, no `jsrt_std_*` runtime code,
> and no `SUBSET.md` verdict behind these rows yet beyond the stub rows named below.
> On any disagreement between this file and plan.md §11b, the plan wins (§15.3).

`std` is a **first-party systems-style standard library**, not a Node compatibility layer and
not user FFI (Phase 7). Users import typed modules (`std/env`, `std/fs`, …); the compiler
recognizes the edge and links first-party `jsrt_std_*` runtime code. Where `std` calls libc,
Phase 7's memory/string/error rules apply unchanged.

## 1. Module path: `std/*` (decided)

Imports spell `std/env`, `std/fs`, … — a **reserved prefix**, not a package and not
`@stator/std`. Rationale: `@stator/std` reads as an npm package, and bare package imports
are refused (STA1214, phaseless) — a std spelling that looks like a package invites exactly
the confusion that refusal exists to prevent. The compiler recognizes the `std/` prefix at
the module-graph edge (like the `.d.ts`-only rule for externs: greppable, one place);
unknown `std/foo` is a hard error, never a silent package lookup.

## 2. Sync vs Promise APIs (decided)

v0 ships **sync first**. Promise-flavored `std/fs` arrives with T10.2 as thin `async`
wrappers that `await` a thread-pool job (Design B) — until then sync-only, honestly so:
no sync-under-`async` documented lie that blocks main by accident (T10.1 step 5 prefers
not-yet, and this doc records that choice rather than leaving it to the implementer).

## 3. Error model (decided in shape; exact codes open)

`std` never answers failure silently: no `-1` returns, no `null` where an error belongs.
Failing calls **throw an `Error`** carrying a stable string `code` (and `errno` where libc
supplies one) plus a human-readable `message`. The exact `code` vocabulary per module is
OPEN (see §8) — it is allocated with the implementing task, one table per module, and once
allocated a code is never renamed.

## 4. Platforms (decided)

POSIX first. Windows only when CI builds the runtime there (today it does not — the runtime
jobs are Unix-only, like FFI's). Platform deltas, if any, are documented per module rather
than papered over.

## 5. v0 module table

Deliberately smaller than Node (plan §11b Design A). `sync`/`thread` ride T10.2; the rest
is T10.1:

| Module | v0 contents | Notes |
|---|---|---|
| `std/env` | `get`/`set`/`has`, `args`, `cwd` | `argv` already exists for `main`; expose it |
| `std/process` | `exit`, `pid`, `abort` | no signals yet |
| `std/path` | `join`/`dirname`/`basename`/`isAbsolute` | pure TS or tiny C; UTF-16 ↔ bytes at the FS edge only |
| `std/fs` | sync read/write/stat/mkdir | Promise twins with T10.2 (see §2) |
| `std/time` | `nowMs`, sync `sleepMs` | timers in the microtask sense stay out until a macrotask phase exists |
| `std/sync` | `Mutex`, `CondVar`, `Channel` | with T10.2 |
| `std/thread` | `spawn`, `join`, `availableParallelism` | with T10.2 |

Wire order (T10.1 steps 2–4): `std/env` + `std/path` end to end first (types → runtime →
golden), then `std/process`, then sync `std/fs` + `std/time`.

## 6. Implementation layers

`packages/std/*.ts` (types + thin wrappers users import) → compiler recognizes `std/*` as
a value-import edge into runtime symbols → `runtime/src/jsrt_std_*.c` (C11, like the rest
of the runtime; Zig only if a later card moves buffers there — **not** by default). No
second RegExp, no Node `fs` semantics chase: match POSIX + document deltas here.

Gate: unknown `std/foo` is a hard error; partial modules use `not-yet` codes naming
**Phase 10** as the blocker owner (§15.9). Those codes are allocated with the implementing
task not here — this skeleton adds no `STA` rows and no gate arms.

## 7. What `std` is not

- Not a Node polyfill: `std/fs.readFile` need not accept Node's option bags or match its
  error strings — it matches POSIX and documents deltas.
- Not user FFI: users cannot add `std/*` modules; the prefix is reserved. Native
  extensibility stays Phase 7's `declare` surface.
- Not threads (v0): anything in §5 marked T10.2 refuses until the bridge exists; the
  refusal names Phase 10, not a workaround.

## 8. Open questions (for the implementing task, not this skeleton)

1. The exact per-module error `code` strings (§3) — propose with the first module, keep
   stable after.
2. `std/path` edge semantics: normalization of `..` above root, trailing slashes, empty
   segments — mirror POSIX `realpath`-lite or Node's `path.posix`? Decide with examples.
3. `std/fs` sync surface: file descriptors or path-only calls in v0? (Recommend path-only;
   fds are a second lifetime to own.)
4. `cwd`/`args` encoding: UTF-16 ↔ bytes at the edge per §5's note, but invalid-byte
   policy (U+FFFD like FFI's `from_cstr`, or throw?) needs one rule for all of `std`.

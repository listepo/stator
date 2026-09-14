// NOTES.md — ambiguities hit while writing the Task 7.3 step-1 manual
// bindings (plan.md §10 Task 7.3 step 2). These notes ARE the generator's
// requirements doc: each bullet names the declaration that forced it.
//
// Convention: entries are grouped by binding, then FFI.md gaps (doc silent,
// invention refused per AGENTS.md §15.6). v0 refusals (varargs, function
// pointers, unions, bitfields, macros) are recorded per-declaration in the
// `.d.ts` files themselves; only the requirement-level consequences live here.

// --- libm.d.ts ---

- **Math domain errors are values, but nobody wrote that down.** Forced by
  `libmSqrt` / `libmFmod` (`sqrt(-1)` → NaN, `fmod` by zero → NaN, overflow →
  ±HUGE_VAL + `errno`). The absent `@statorError` tag means "never throws",
  so NaN is the answer — which happens to match `Math.sqrt(-1)`. But if a
  future reader adds `@statorError errno` expecting a throw, the NaN path and
  the errno path disagree on the same call. REQUIREMENT: the generator needs
  a rule for math-library functions — either "math functions never carry an
  error convention" (documented) or a defined interaction between NaN returns
  and errno conventions.
- **No declaration-site spelling for the `i32` refinement.** Forced by every
  C-`int` parameter/return in sqlite3.d.ts (`sqliteStep`'s return,
  `sqliteColumnInt`'s `col`, `sqliteChanges`). The binding writes `number`;
  the ABI table's "`number` + `i32` refinement → `int32_t`" row is a
  compiler-tracked property with no surface syntax, so a generator reading a
  C `int` cannot print anything narrower than `number`, and a generator
  reading the `.d.ts` back cannot tell `int` from `double`. REQUIREMENT: the
  generator spec must fix how C `int`/`int32_t` round-trips through a `.d.ts`
  (new spelling, comment convention, or "always widen to `number`").
- **`sqlite3_int64` has no ABI row and must not widen silently.** Forced by
  `sqlite3_last_insert_rowid` / `sqlite3_changes64` (refused, sqlite3.d.ts
  refusal 5). `number` (`double`) cannot hold every int64 exactly, so mapping
  it would be a precision lie, not a binding. REQUIREMENT: the generator must
  refuse 64-bit integer types with a diagnostic (same class as STA1119), never
  emit `number` for them.

// --- sqlite3.d.ts ---

- **The binding's constructor is inexpressible: `T**` out-params are the
  SQLite shape.** Forced by `sqlite3_open_v2` (sqlite3.h:3998) and
  `sqlite3_prepare_v2` (sqlite3.h:4602) — refused, sqlite3.d.ts refusals 1–2.
  FFI.md §7.4 already predicts this ("the `T**` out-param question Task 7.3's
  SQLite binding will force"), and this binding is the forcing instance: the
  two functions that create every handle the binding trades in cannot be
  declared. REQUIREMENT: v0.1 must decide the out-param spelling (candidate
  shapes: return-tuple, caller-allocated pointer wrapper, explicit
  `OutParam<T>` brand) or SQLite stays a read-only-handle demo. Until then
  the generator refuses `T**` per STA1119.
- **`sqlite3_step`'s ROW-vs-DONE distinction is not an error convention.**
  Forced by `sqliteStep`: SQLITE_ROW (100) and SQLITE_DONE (101) are both
  success, and no closed-vocabulary tag (`nonzero`/`negative`/`null`/`errno`)
  expresses "100 and 101 are both fine, anything else throws". Declared with
  NO tag (plain value; caller compares). REQUIREMENT: either a set-membership
  convention (e.g. `@statorError except 100,101` — new vocabulary) or a
  documented "multi-code returns are always plain values" rule. The generator
  cannot infer it: from the header alone, 100/101 look like error codes.
- **Which returned strings the caller frees: `errmsg` vs `column_text`.**
  Forced by `sqliteErrmsg` and `sqliteColumnText`. Both return `const char*`
  the caller must NOT free, but for different reasons: `errmsg`'s pointer is
  owned by the `sqlite3*` handle (invalidated by the next call on it),
  `column_text`'s by the `sqlite3_stmt*` (invalidated by step/reset/finalize).
  FFI.md §3's "copied, never freed by the runtime" covers both — but the copy
  is load-bearing in different ways, and a reader who skips the copy (a
  future zero-copy optimization) creates a use-after-next-call. REQUIREMENT:
  the per-signature ownership comment must name the INVALIDATION event, not
  just "copied": "copied; the source is invalidated by the next X on this
  handle". Both declarations above follow that form.
- **A SQL NULL column is a C NULL return on a non-nullable declaration.**
  Forced by `sqliteColumnText`: declared `@statorError null`, so NULL becomes
  an exception. That is defensible (the alternative is asserting in
  `from_cstr`), but it means "column was NULL" and "library failed" share one
  exception shape, and the binding cannot offer a nullable return (no
  nullable-ABI spelling exists). REQUIREMENT: decide whether `T | null`
  returns map to "NULL → null" (new rule) or keep "NULL → throw" (current),
  and write it in FFI.md §3. The generator needs the rule, not a judgment
  call per function.
- **The `bind_text` destructor is a value choice disguised as a pointer.**
  Forced by `sqlite3_bind_text` (refused, sqlite3.d.ts refusal 3): the 5th
  argument is almost always SQLITE_STATIC or SQLITE_TRANSIENT (macros — out
  of scope) rather than a real function, but its C type IS a function
  pointer, so v0 refuses the whole function (STA1117) and scalar binds
  (`sqliteBindInt`/`sqliteBindDouble`) carry the binding alone. REQUIREMENT:
  when callbacks arrive (post-v0), the generator needs the
  constant-destructor special case first — it is the common case, not the
  trampoline case.
- **`sqlite3_close` succeeding destroys the handle value — unstated.**
  Forced by `sqliteClose`: on SQLITE_OK the TS-side `SqliteDb` value is a
  dangling handle, and nothing (type system, lint, runtime check) stops its
  reuse. `close_v2` differs (deferred deallocation with unfinalized
  statements) and is omitted for that reason. REQUIREMENT: affinity/consume
  semantics are out of v0 by design, but the generator's per-signature
  ownership comment MUST state post-success invalidity for destroying calls —
  `sqliteClose` above is the template.
- **Macro constants have no refusal code for the generator.** Forced by
  SQLITE_OK/ROW/DONE/OPEN_* (refused, sqlite3.d.ts refusal 6): Task 7.3
  step 5 demands "rejected with a diagnostic naming the construct and its
  header line", but DIAGNOSTICS.md allocates no code for generator refusals
  (STA1114–STA1121 are gate codes for hand-written declarations). Callers
  meanwhile compare `sqliteStep` results against bare 100/101 literals.
  REQUIREMENT: allocate the generator-refusal code family (or one code with a
  reason string) before the generator lands, plus decide whether small
  constant sets get a hand-maintained TS `const` companion.

// --- stat.d.ts ---

- **Field offsets must not be guessed; the platform proves it.** Forced by
  `posixStat`'s `StatBuf`: this box's `struct stat` is `__DARWIN_STRUCT_STAT64`
  (conditional, 64-bit inode variant — `sys/stat.h:182`), so offsets copied
  from Linux headers, from memory, or from another macOS SDK would be wrong
  without warning. The binding declares NO accessors (opaque-pointer style).
  REQUIREMENT: real field access needs the generator to emit
  `offsetof`/`sizeof`-derived glue (a companion C file or generated
  constants), never literals in the `.d.ts`. Until that mechanism exists,
  struct-by-pointer bindings are pass-the-handle-only, and the doc should say
  so (FFI.md currently implies by-pointer "covers the real use cases" — it
  covers passing, not reading).
- **Error conventions do not compose.** Forced by `posixStat`: failure is
  "negative return AND detail in errno", but the closed vocabulary offers
  `negative` and `errno` as alternatives — `@statorError negative` throws
  without the errno value; `@statorError errno` has no return-value trigger
  defined for a function whose error return is -1 rather than nonzero.
  Declared `negative` (throw, errno value lost). REQUIREMENT: either allow
  stacked tags (`@statorError negative, errno`) with defined read order, or
  define `errno` as "read errno iff the return is the function's documented
  failure value". Same latent gap for every libc function with the -1/errno
  shape — `stat` is just the first instance.
- **Who allocates the out-struct is unwritten.** Forced by `posixStat`'s
  `buf`: the comment says "caller allocates", but v0 has no allocation
  spelling — no `sizeof` exposure, no factory function shape, no
  stack-vs-heap rule. A generator cannot emit what no declaration can name.
  REQUIREMENT: the out-param decision (sqlite `T**` bullet above) must cover
  caller-allocated aggregates too, including where the storage lives (frame?
  heap? who frees?).

// --- Gaps found in FFI.md (doc silent; nothing invented) ---

- **No link-pragma spelling.** Task 7.1 step 7 says flags "come from the
  declaration file plus a `--link=` CLI escape hatch", but FFI.md defines no
  declaration-file spelling for "include this header, link this library".
  All three bindings need it (`-lm`, `-lsqlite3`, none). REQUIREMENT: fix the
  pragma form (comment convention? JSDoc tag? adjacent config?) before the
  generator emits bindings that cannot build.
- **No `CStringOwned`-as-parameter example and no transfer spelling for
  pointers.** FFI.md §3 defines `CStringOwned` (transfer) but no binding here
  needed it (nothing retained a string; `bind_text`'s TRANSIENT case is
  behind the function-pointer refusal), and §6's "copied/transferred" branch
  has no pointer-side spelling at all — a library that keeps a `T*` (a
  registry, a userdata pointer) cannot be marked. REQUIREMENT: when the first
  retaining-pointer binding arrives, the transfer spelling must be designed,
  not improvised.
- **The unchecked-boundary flag has no per-call granularity story.**
  FFI.md §5 marks "every extern call" — but `sqliteStep` inside a row-loop is
  one declaration, thousands of calls. Fine for audit (flag the site, not the
  iteration), but `stator explain`'s per-construct verdict table should say
  whether the flag attaches to the declaration, the call site, or both.
  Minor; noted while marking, not blocking.

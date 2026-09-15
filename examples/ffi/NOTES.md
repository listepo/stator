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
  refusal 3). `number` (`double`) cannot hold every int64 exactly, so mapping
  it would be a precision lie, not a binding. REQUIREMENT: the generator must
  refuse 64-bit integer types with a diagnostic (same class as STA1119), never
  emit `number` for them.

// --- sqlite3.d.ts ---

- **The binding's constructor is inexpressible: `T**` out-params are the
  SQLite shape.** Forced by `sqlite3_open_v2` (sqlite3.h:3998) and
  `sqlite3_prepare_v2` (sqlite3.h:4602) — sqlite3.d.ts refusal 1 (open_v2, zVfs) plus the converted sqliteOpenDb/sqlitePrepare declarations.
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
  Forced by `sqlite3_bind_text` (refused, sqlite3.d.ts refusal 1): the 5th
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
  SQLITE_OK/ROW/DONE/OPEN_* (refused, sqlite3.d.ts refusal 4): Task 7.3
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

// --- string.d.ts (appended 2026-09-14) ---
//
// Second binding round, part 1: C strings (`string.h`). Same convention as
// above: one bullet per forcing declaration. Gate fates cite
// `packages/compiler/src/frontend/extern.ts` (classification order: params
// left to right, then return, then convention) and `src/hir/nodes.ts` (the
// convention/return matrix).

- **`size_t` has no width spelling in either direction.** Forced by `cStrlen`
  (returns C `size_t`, `_string.h:96`) and `cStrncmp`'s `n` (`_string.h:101`).
  The binding writes `number` (`double`), which holds every `size_t` exactly
  only to 2^53 — above that it is a precision lie of the `sqlite3_int64`
  family (sqlite3.d.ts refusal 5), but refusing `size_t` would refuse
  `strlen`, the most innocent function in libc. REQUIREMENT: the generator
  spec must fix the `size_t` rule (refine-and-document like `i32`? a `SizeT`
  brand? refuse above 2^53 at runtime?), not leave each binding widening
  silently.
- **Three-way comparison returns collide with the `negative` vocabulary.**
  Forced by `cStrcmp` / `cStrncmp` (`_string.h:89,101`): "negative / zero /
  positive" is ordering DATA, and `@statorError negative` ("negative return
  throws") compiles against the same `number` return a comparison yields —
  the gate's matrix (`nodes.ts:1006-1008`) would accept the tag. The binding
  declares NO tag (plain value; caller compares against 0), but nothing stops
  a future reader — or a generator heuristic — from inferring `negative`
  from "returns int". REQUIREMENT: the generator must never infer a
  convention from a C return type; ordering returns need a documented
  "comparisons are always plain values" rule.
- **Counted functions measure the UTF-8 copy, not the JS string.** Forced by
  `cStrncmp`'s `n`: the bound counts bytes of the NUL-terminated copy §3
  allocates, so JS `.length` (UTF-16 units) is the wrong `n` for non-ASCII
  input — and embedded NULs (§3: truncated at the first NUL) make even the
  byte length over-long. REQUIREMENT: the call convention for counted string
  functions must define `n` as "bytes of the encoded copy" and say who
  computes it (caller? generated glue?), not leave a bare `number` the
  caller guesses.
- **The companion free lives in another file.** Forced by `cStrdup`
  (`_string.h:141`): FFI.md §3 (lines 150-152) demands "an explicit free
  function in the same binding", and the free is `cFree` in stdlib.d.ts —
  same binding round, sibling file. If "same binding" means same FILE, this
  binding violates §3 as written; if it means the binding set, §3 should say
  so. REQUIREMENT: fix the scope of "same binding" (file? package? module
  graph?) before the generator checks — or emits — the companion.
- **`strdup` is the second error-composition instance.** Forced by `cStrdup`
  (`@statorError null`): failure is "NULL return AND detail in errno
  (ENOMEM)" — the `stat` shape exactly (stat bullet above). Declared `null`
  (throw, errno value lost), consistent with `posixStat` but still lossy;
  stacking `null, errno` is refused by the gate (single-tag rule).
  REQUIREMENT: same as the stat bullet (stacked tags with read order, or
  errno-reads-on-failure-value); two instances now, so the rule pays twice.
- **Static-buffer functions are a third ownership flavor.** Forced by
  `cStrerror` (`_string.h:95`): the source is neither handle-owned
  (`errmsg` / `column_text` — invalidated by the next call ON THAT HANDLE)
  nor allocated (`strdup`) — it is a shared static buffer invalidated by the
  next `strerror` call IN THE PROCESS, and POSIX does not require
  `strerror` to be thread-safe. The binding copies at the boundary (same
  template) and refuses the reentrant spelling (`strerror_r`, string.d.ts
  refusal 4). REQUIREMENT: the per-signature ownership comment needs a third
  template ("shared static; invalidated process-wide; not thread-safe"), or
  a reader files it under the handle-owned one and misjudges the hazard.

// --- stdlib.d.ts (appended 2026-09-14) ---
//
// Second binding round, part 2: the deallocator (`free`). Expected verdicts
// for the round: accepts (`cStrlen`, `cStrcmp`, `cStrncmp`, `cStrdup`,
// `cStrerror`), one deferral (`cFree`), STA1119s (all refusals).

- **The binding's only declaration defers.** Forced by `cFree`
  (`_malloc.h:56`): `HeapBlock` is a well-formed branded pointer (table
  type, docs/FFI.md §2), so the landed gate answers not-yet STA1217 (step 6
  ownership, `extern.ts:233-244`), not a never-code — the file's single
  declaration is correct-by-construction and uncompilable until step 6.
  `void` here is the genuine C `void` return, so §4's value-to-`void`
  absolute does not touch it. REQUIREMENT: none for the generator (the
  deferral IS the design); noted so the round's expected verdicts read
  "deferred", not "failed" — and so step 6 knows `free` is its first
  customer.
- **Use-after-free / double-free is the second consume-semantics instance.**
  Forced by `cFree`: after `free` the TS-side `HeapBlock` is dangling and a
  second `cFree` on it is undefined behavior, yet nothing (types, lint,
  runtime) stops either — the `sqliteClose` shape exactly (`free(NULL)`'s
  no-op is the only benign case, and it needs no spelling). REQUIREMENT:
  same as the close bullet (ownership comment states post-success
  invalidity; affinity/consume stays out of v0).
- **Allocator returns have no spelling from either side.** Forced by the
  `malloc`-as-`CStringOwned` refusal (stdlib.d.ts refusal 2,
  `_malloc.h:54`): `void*` has no ABI row (STA1119 catch-all), AND the only
  ownership-carrying return spelling is refused as parameter-only (STA1119,
  `extern.ts:221-229`) — so an allocating return is refused twice, with no
  path between the refusals. REQUIREMENT: a future allocator-return kind
  (an `Owned<T>` brand? a return-transfer row?) or allocators stay refused
  permanently; the two STA1119s must not be read as "pick the other one".

// --- Gaps found in FFI.md, second round (appended 2026-09-14; doc silent,
// nothing invented) ---

- **No `size_t` row in the ABI table.** §2's table (lines 71-80) maps
  `number` → `double` and notes the `i32` refinement, but `size_t` (the
  `strlen` return, every counted bound) appears nowhere: silent on width,
  signedness, and the >2^53 story. REQUIREMENT: add the row or the refusal
  before the generator meets `string.h`.
- **"One convention per declaration" is gate behavior without a doc line.**
  The gate refuses stacked tags (`extern.ts:347-353`), but §4 (lines
  179-205) says only "one of a closed set" — never "at most one tag". Both
  the stat round and this round's `strdup` hit it. REQUIREMENT: write the
  single-tag rule — or the stacking order — into §4.
- **§3's out-direction names handles and allocators, not static buffers.**
  Lines 145-152 cover handle-owned pointers and malloc'd returns; the
  shared-static family (`strerror`, and by the same shape `asctime`,
  `inet_ntoa`, `ctime`) is silent — no invalidation template, no
  thread-safety caveat. REQUIREMENT: a static-buffer paragraph in §3 (copy
  + process-wide invalidation + reentrant-alternative pointer).
- **`void` returns get half a paragraph.** §4's second absolute (lines
  207-214) refuses value-to-`void` mappings (STA1119) — which implies
  genuinely-`void` functions (`free`) are fine — but no positive sentence
  says so; a cautious generator could refuse `cFree`'s shape. Minor; one
  sentence in §4.

// --- 2026-09-15: step-1 runnable examples + STA1130 (Task 7.3 follow-ups) ---
//
// The step-1 deliverable is now `.d.ts` + link pragma + RUNNABLE example per
// shape (`examples/ffi/libm/`, `examples/ffi/stat/`; each is example source +
// `expected.txt` + a tiny runner script comparing the stator binary AND Node
// byte-for-byte, the `packages/tests/ffi/example-c-consumer/` shape). One
// bullet per forcing construct, same convention as above.

- **Generator refusals without a gate equivalent cite STA1130.** Forced by
  every `SQLITE_*` macro and `SQLITE_OK`-family constant in sqlite3.h (539
  refusals on the current brew header: 534 macro constants, 2
  function-like macros, 3 globals — zero `[no STA code allocated yet]`
  markers left on those kinds). Closes the sqlite3.d.ts "macro constants"
  bullet above: kinds WITH a gate equivalent (`T**`, int64, function
  pointers, variadic, `void*` returns) keep their would-be gate codes
  (STA1119/STA1117/STA1120); union, bitfield, and inline-function refusals
  are the sibling half (abi.ts mapping) and cite STA1130 there, not here.
  REQUIREMENT: none left on this half — recorded so the oracle count (539)
  has a home when the next header re-runs it.
- **Scalar math output is deterministic to the last digit, NaN included.**
  Forced by `libmSqrt(-1)` in `examples/ffi/libm/main.ts`: the NaN
  domain-error path prints `NaN` on both sides (Ryū shortest-round-trip vs
  Node), which pins the NOTES.md "math domain errors" rule as behavior —
  absent `@statorError` means NaN is the answer, and the example is the
  proof. REQUIREMENT: the generator needs the documented math rule before
  it can choose "never carry an error convention" per function (libm.d.ts
  bullet above); until then every math binding hand-states it.
- **Field reads go through a demo-local accessor shim, not a struct
  spelling.** Forced by `statSize` / `statMtime` in
  `examples/ffi/stat/stat_shim.d.ts`: v0 has no struct spelling, so the
  binding declares scalar accessors over a C shim (`stat_shim.c`, field
  offsets derived by the platform compiler, never literals), wired with a
  quote-form `@statorLink #include` (absolute-resolved against the `.d.ts`)
  plus the shim object through `--link=`. int64 fields (`st_size`,
  `st_mtime`) cross as `double` — exact for real files, stated at the
  declaration — and a missing file is -1 as DATA (the multi-code rule).
  REQUIREMENT: the `offsetof`-derived glue mechanism (stat.d.ts bullet
  above) stays the real fix; the shim is the documented pattern until it
  exists, and the generator must refuse raw field access, never emit
  offset literals.

---

## 2026-09-15 addendum — v0.1 resolutions (Out<T> pipeline)

- **Out-param spelling: decided.** `Out<T>` (`T**` over brands, `Out<CString>` over
  `const char**`), created by blessed `outSlot<T>()`, read via `.value` (docs/FFI.md §2;
  misuses STA1125). The constructor question above is closed: `sqlite3_open` and
  `sqlite3_prepare_v2` declare through it (sqlite3.d.ts `sqliteOpenDb`/`sqlitePrepare`;
  `open_v2` stays refused for its nullable `zVfs`, which has no v0 spelling).
- **Generator-refusal code: allocated.** STA1130 (`both`/`never`) names the construct and
  header line for macro/enum/inline/global/union/bitfield refusals; gate-equivalent kinds
  keep citing their gate codes. The `sqliteStep`-against-literals pattern stands until a
  constants mechanism exists.
- **int64/i32:** unchanged (still refused); the generator narrows C `int` results with a
  documented legend. `size_t` still widens to `number` with the 2^53 caveat above.

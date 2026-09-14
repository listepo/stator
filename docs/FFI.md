# FFI.md — calling C from Stator (Phase 7, Task 7.1)

The contract for the extern surface: how a C function is declared, which types
may cross the boundary, who owns the memory, and what the compiler promises
(and refuses to promise) about the call. This file implements plan.md §10 Task
7.1 steps 1–2 — the surface and the ABI table, written down **before** any
lowering (plan §15.6).

Steps 5+ (lowering, the emitter, per-signature GC treatment, link plumbing) are
**not** started. Sections below say where each one's mechanism will hook in,
but no mechanism is claimed. §7 lists what the implementation steps still owe.

Normative companions: `docs/SUBSET.md` carries the extern rows (feature × mode
matrix), and `docs/DIAGNOSTICS.md` is the sole allocator — every code named
below has a row there. On any disagreement between this file and plan.md §10,
the plan wins and this file is edited (§15.3).

---

## 1. The marker: `declare` + `@statorExtern` in a `.d.ts`

An extern function is an ambient function declaration carrying one explicit
per-declaration marker — a JSDoc tag, TS-native, rather than Static Hermes's
`$SHBuiltin.extern_c` call form:

```ts
// sqlite.d.ts
/** @statorExtern */
declare function sqliteVersionNumber(): number;
/** @statorExtern sqlite3_open_v2 */
declare function sqliteOpenV2(filename: CString, flags: number): Ptr_sqlite3;
```

Three sub-decisions, settled here because each becomes unchangeable once
bindings exist (plan §10 Task 7.1 step 1):

1. **The marker attaches per declaration, never to a whole file.** A whole-`.d.ts`
   marking would make extern-ness silent: one new declaration in an annotated
   file would cross the trust boundary (§5) without anyone writing it down.
   Each binding is an audit point (`stator explain` flags every one, §5), so
   each one is marked. A `declare function` in a `.d.ts` *without* the tag is
   an ordinary ambient declaration, not an extern call.
2. **The C symbol defaults to the TS name; the tag's trailing text overrides
   it.** `/** @statorExtern */` calls the C symbol spelled exactly like the TS
   function; `/** @statorExtern sqlite3_open_v2 */` calls `sqlite3_open_v2`.
   Rationale: JSDoc is readable through the TS API (`ts.getJSDocTags`) with no
   new syntax, and comments erase at emit — safe under `erasableSyntaxOnly`,
   where a decorator marker is unavailable anyway (decorators are
   error(STA1112) in both modes). No second spelling exists: one marker, one
   override position.
3. **Extern declarations are legal only in `.d.ts` files.** Elsewhere they are
   error(STA1121). Rationale (the plan's recommendation): keeping them in
   declaration files is what makes Task 7.3's generator output a drop-in, and
   it keeps the trust boundary greppable — every unchecked call site (§5) is
   declared in a file whose extension already says "this is an interface, not
   an implementation".

---

## 2. The ABI table

The table is the contract, and it is small on purpose (plan §10 Task 7.1
step 2):

| TS type | C type | Notes |
|---|---|---|
| `number` | `double` | The unmarked case; no conversion |
| `number` + `i32` refinement | `int32_t` | The refinement already exists (`docs/NUMERIC.md`) |
| `boolean` | `bool` | `<stdbool.h>` |
| `void` | `void` | Return position only; a `void` parameter is STA1119 |
| branded pointer type | `T*` | Opaque; never dereferenced by generated code (see below) |
| `CString` / `CStringOwned` | `const char*` | Allocates; see §3. `CStringOwned` is parameter-only |
| anything else | — | Compile error (STA1119 catch-all; specific kinds below) |

**Branded pointer.** An opaque handle the TS side names but never inspects:

```ts
type sqlite3 = { readonly __brand: "sqlite3" };
```

Generated code passes the pointer through and never dereferences it. Its
lifetime belongs to the C library, not to the collector: a binding that keeps
a pointer (a database handle, a prepared statement) uses this type, and the
declaration's documentation says who frees it and when. The two-lifetime rule
(borrowed for the call, or copied/transferred — §6) is per signature because
the compiler cannot check it.

**`string` deliberately maps to nothing.** UTF-16 in, bytes out is a real
conversion with a real allocation, so it is spelled at the declaration and
never inferred. A bare `string` in an extern signature is error(STA1118); the
fix is `CString` (borrow) or `CStringOwned` (transfer), §3.

**Each refusal gets its own code** (never class — the table is small by
design, so these are permanent, not scheduled; a future task that widens the
table splits a kind out with a NEW code, never by reusing one):

| Refused kind | Code | Fix |
|---|---|---|
| `unknown` in an extern signature | error(STA1114) | Narrow first, or pick an ABI type |
| object type in an extern signature | error(STA1115) | Branded pointer, or `CString` for text |
| array type in an extern signature | error(STA1116) | Pass a pointer + length as ABI types |
| function/closure type in an extern signature | error(STA1117) | v0 has no trampoline; C calls in via Task 7.2 exports instead |
| bare `string` in an extern signature | error(STA1118) | `CString` (borrow) or `CStringOwned` (transfer) |
| anything else outside the table — incl. struct by value, `T**` out-params, `void` as a parameter, `CStringOwned` as a return | error(STA1119) | No mapping exists in v0 |
| variadic (`printf`-style) extern declaration | error(STA1120) | No sound signature; each call site is a different function type (permanent — plan §10 out-of-scope table) |
| extern declaration outside a `.d.ts` | error(STA1121) | Move it into a `.d.ts` (§1.3) |

Notes on the refusals: `Unknown`, objects, arrays, and closures are errors by
construction — they are the cases that would need boxing, and "no boxing for
primitives" is only meaningful if the non-primitives are refused rather than
silently boxed. Struct **by value** is STA1119 for v0 (ABI layout per platform
is a task of its own; plan §10 out-of-scope table). `T**` out-params — the
SQLite shape — are STA1119 in this surface: Task 7.3's manual bindings will
force the question, and this file grows then (§7). C++ symbols, name mangling,
and C calling back into a JS closure have no spelling in this surface at all,
so there is nothing for the gate to refuse; they are out of scope for v0 by
the plan's table, not by a code. Threads: v0 FFI is single-threaded, said out
loud (OS threads + async bridge are Phase 10, T10.2).

---

## 3. Strings, both directions, with the lifetime written down

`CString` is NUL-terminated UTF-8 at the boundary. The two directions are
asymmetric on purpose:

- **In (TS → C).** The runtime allocates a NUL-terminated UTF-8 copy of the
  JS string for the call. Default (`CString`) is a **borrow**: the copy is
  freed after the call returns, and the callee must not retain the pointer.
  If the callee stores the pointer, the declaration spells `CStringOwned`
  instead — ownership **transfers** to the callee, and the runtime never frees
  it. Two options only, because a third would be a lifetime the compiler
  cannot express.
- **Out (C → TS).** A `const char*` return is **copied** into a fresh runtime
  (UTF-16) string at the boundary — never wrapped, because a wrapper's
  lifetime belongs to the C library and nothing in the runtime can track it.
  The original pointer is never freed by the runtime either: the allocator is
  the library's, not ours. A C function that `malloc`s its return needs an
  explicit free function in the same binding, declared as its own extern; the
  binding's documentation says so.

Two stated answers, not accidents:

- **Embedded NULs (in).** A JS string containing U+0000 is truncated at the
  first NUL — C string semantics. Documented here so no one discovers it from
  a corrupted query.
- **Invalid UTF-8 (out).** Bytes that are not well-formed UTF-8 decode to
  U+FFFD (replacement character), one per maximal invalid subsequence — the
  rule Node's `Buffer.toString('utf8')` applies.

`CStringOwned` in return position is STA1119: a returned pointer the runtime
must free has no known allocator (§5's asymmetry again — the doc cannot name
what it cannot check, so it refuses instead).

---

## 4. Errors: C returns codes, and only the declaration knows what they mean

**Default: the return value is a plain value and a failing call is not an
exception.** Opt in per declaration with one of a closed set of conventions,
spelled as a second JSDoc tag with a closed vocabulary:

```ts
/** @statorExtern @statorError nonzero */
declare function sqliteStep(stmt: sqlite3_stmt): number;
```

| Tag | Meaning; the lowering emits the throw |
|---|---|
| *(absent)* | No convention: the return is a value, never an exception |
| `@statorError nonzero` | Nonzero return throws |
| `@statorError negative` | Negative return throws |
| `@statorError null` | NULL (pointer-typed) return throws |
| `@statorError errno` | `errno` carries the failure; it is read immediately after the call, before any other runtime call |

The thrown value is an `Error` naming the function and the failed convention;
its exact wording is step-5 lowering detail (§7). The vocabulary is closed: a
misspelled convention is a gate error at the declaration, not a silent
default — a binding that invents its own convention is the failure this
section exists to prevent.

Two absolutes (plan's words):

- A JS exception must **never** unwind through a C frame. The extern call is
  emitted outside any construct that could throw across it; the mechanism is
  step 5's, the invariant is stated here.
- An unmapped nonzero return must not be silently discarded. A declaration
  that maps a value-returning C function to TS `void` is STA1119 — discarding
  would hide exactly the failures conventions exist to surface.

---

## 5. The trust boundary, honestly named

Plan §0 rule 2 says never trust an annotation without a boundary check — but
a C return value **cannot** be runtime-checked, so FFI is the one boundary
where the annotation is asserted by a human and not verified. `stator explain`
marks every extern call as an **unchecked boundary** so an audit can enumerate
every one of them. The mark rides **alongside** the verdict, not instead of
it: the four-verdict vocabulary (`static | dynamic | error | not-yet`,
`docs/MODES.md` §6) is unchanged, and `tests/subset/run.ts` keeps reading
verdict + code only. Until steps 5+ land, the verdict on any extern construct
is not-yet(STA1217, Phase 7), flag included, so extern sites are auditable
from the first gate implementation. Once landed: `ts`-mode extern calls are
`static` + flag (direct C calls, unboxed); `js`-mode calls are `static` + flag
when every argument is statically typed, else `dynamic` + flag.

This is also the honest answer to "why is FFI not available in `ts` mode's
safety story" — it is, with the caveat printed. (`docs/MODES.md`'s rule that
`.d.ts` declarations are trusted-with-a-call-site-check holds for
Stator-compiled implementations; extern C declarations are the carved-out
exception, and the flag is the carve mark.)

**`js` mode.** The extern declaration itself is identical in both modes; only
the checks differ. Arguments arriving from untyped code are dynamic, so they
get a boundary check at the call and `STA2001` on mismatch — the existing
runtime trap doing its existing job, not a new mechanism.

---

## 6. Ownership, per signature

A pointer handed to C is invisible to the collector for the duration of the
call. The frame that owns it stays live across the call, and the callee must
not retain it past return unless the declaration says it takes ownership —
`CString` (borrow) versus `CStringOwned` (transfer) in §3 is this rule worked
out for strings. The full per-signature treatment (where the frame discipline
meets the emitter's temporaries on every exit path, landing pads included) is
Task 7.1 step 6's, and lands with the lowering; the rule stated here is what
that lowering must honor, not the lowering itself.

---

## 7. Open items for steps 5+

When the implementation starts, it owes, in one change each where the plan
demands it (§15.3, §15.6):

1. Gate wiring for the marker, the eight refusal codes, and STA1217 (phase 7 —
   an open phase, so `src/support/phases.ts` needs no change; `COMPLETED_PHASES`
   lists finished phases only, and `tests/unit/phases.test.ts` already enforces
   that no `not-yet` names one).
2. Decision fixtures in both modes for every `docs/SUBSET.md` extern row
   (extern call, each refusal kind, varargs, outside-`.d.ts`, the
   unchecked-boundary mark) — `// @expected-fail: true` until the gate lands
   them, removed in the landing commit (AGENTS.md Testing rules).
3. The `@statorError` throw wording, the errno-read sequence, and the
   ambient `CString` / `CStringOwned` declarations in the stator lib.
4. The `T**` out-param question Task 7.3's SQLite binding will force
   (STA1119 until then — §2).
5. `docs/README.md` index and the AGENTS.md repo map do not list this file
   yet; both live outside this task's file set and follow with the
   implementation.
6. `docs/SUBSET.md` Types-row note still says "FFI returns are still Phase 6";
   FFI is Phase 7 (§10) and Phase 6 is conformance/fuzzing (§9). Flagged for
   the parent session — correcting it is outside this task's additive-only
   edit grant.

# FFI.md — Calling C from Stator (Task 7.1)

**Status: surface frozen, implementation pending.** This document settles Task 7.1
steps 1–2 (the declaration surface and the ABI table) and the policies steps 3–4
and 6–9 will implement, **before** any lowering exists. Nothing here compiles yet:
an extern-shaped call today reads as the unmodelled-global catch-all
(`STA1214`, Phase 5 — the wrong phase; the gate learns the marker in step 5).
Decision tests and golden fixtures land with the lowering (steps 5 and 10), never
before it.

The order is 7.1 → 7.2 → 7.3 and it is not arbitrary (plan.md §10): 7.2 reuses
this ABI table in reverse, and 7.3 generates the declarations this document
specifies. What is out of scope for v0 lives in plan.md §10 (struct by value,
varargs, C++, callbacks into closures, threads) — this file does not restate it.

## 1. The declaration

An extern function is a `declare function` in a **script (non-module) `.d.ts`
file**, promoted by an explicit per-declaration JSDoc marker. Three decisions,
frozen here because each becomes unchangeable once bindings exist:

1. **The marker attaches to the declaration, not the file.** A binding file may
   mix extern functions with helper types; per-declaration presence is what
   promotes one ambient declaration to an extern call. A `declare function`
   *without* the marker is not an extern — a call to it keeps today's answer
   (the `STA1214` global surface).
2. **The C symbol defaults to the TS name** and is overridden per declaration
   (see `@statorSymbol`). A collision between two extern C symbols is a compile
   error; its code is allocated with step 5, which is where the whole program's
   symbol table first exists.
3. **Extern declarations are legal only in a `.d.ts` file.** In a `.ts` file an
   ambient `declare function` keeps today's answer (the gate's overload-signature
   `STA1214`). In a *module* `.d.ts` (top-level `import`/`export` present) or any
   other file kind it is `STA2008`. Keeping externs in declaration files is what
   makes Task 7.3's generator output a drop-in.

The entry pulls the file in with a triple-slash reference — the TS-native
inclusion mechanism for global declaration files, verified against the pinned
`typescript` (6.0.3): the referenced file enters the program with no checker
diagnostics, and its JSDoc survives on `node.jsDoc[].tags` for the gate to read:

```ts
/// <reference path="./libm.d.ts" />
console.log(sqrt(9));
```

```ts
// libm.d.ts
/**
 * Square root.
 * @statorExtern
 * @statorHeader math.h
 * @statorLib m
 */
declare function sqrt(x: number): number;
```

## 2. The marker tags

One tag, one job. Tags are read from the declaration's JSDoc block; unknown
`@stator*` tags, duplicate single-valued tags, or values that fail their shape
below are `STA2009`. A tag that names a parameter (`@statorAbi`) must name a
real parameter, else `STA2009`.

| Tag | Cardinality | Meaning |
|---|---|---|
| `@statorExtern` | exactly one, no value | The marker: this ambient declaration is an extern call. On anything but a `declare function` in a `.d.ts` it is `STA2009`. |
| `@statorSymbol <c-name>` | optional | The C symbol when it differs from the TS name. Must match `[A-Za-z_][A-Za-z0-9_]*`, else `STA2009`. Absent means the TS name. |
| `@statorHeader <file>` | ≥1, repeatable, order preserved | Headers the emitted translation unit includes, each as `#include "<file>"` verbatim (double quotes always — quoted lookup still finds system headers). Duplicates across declarations are deduplicated; a missing header surfaces at clang time as the existing `STA0009`, not a new code. |
| `@statorLib <lib>` | optional, repeatable, order preserved | Libraries appended to the link line as `-l<lib>` by step 7's plumbing, deduplicated across the program with first occurrence winning — link order is load-bearing for static archives, so no sorting, ever. The `--link=` CLI escape hatch (extra flags, same dedupe) lands with step 7. |
| `@statorAbi <param>: <ctype>` | optional, repeatable | Selects the non-default C spelling where the TS type is ambiguous (see §3). `<param>` is a parameter name or `return`; `<ctype>` is `int32_t` or `const char*`, spelled exactly so. |
| `@statorThrows <convention>` | optional | Declares the C error convention (see §6). Closed set: `nonzero`, `negative`, `null`, `errno` — exactly one, else `STA2009`. Absent means the return is a plain value. |

## 3. The ABI table

Small on purpose. Each row is total: a TS type that appears in an extern
signature maps to exactly the C type shown, or the signature is refused.

| TS type | C type | Notes |
|---|---|---|
| `number` | `double` | The unmarked case; no conversion. |
| `number` + `@statorAbi x: int32_t` | `int32_t` | Opt-in per parameter (or `return`). The call boundary range-checks: a non-integral or out-of-range argument throws rather than truncates. This spelling is deliberate — v0 needs **no HType `i32` refinement** (which `hir/types.ts` records as still absent): the HType stays `number` and the check lives at the call boundary, so plan.md §10's old "the refinement already exists" parenthetical is corrected by plan-notes 241. |
| `boolean` | `bool` | `<stdbool.h>` is included by the emitter. |
| `void` | `void` | Return position only; `(x: void)` is `STA2010`. |
| branded pointer type (§4) | `T*` | Opaque; never dereferenced by generated code. |
| `string` + `@statorAbi s: const char*` | `const char*` | See §5. |
| anything else | — | Compile error, `STA2010`, naming the type and the declaration. `Unknown`, objects, arrays, and closures are errors here by construction — they are the cases that would need boxing, and "no boxing for primitives" is only meaningful if the non-primitives are refused rather than silently boxed. A bare `string` without the `const char*` selection is this error too: UTF-16 in means bytes out is a real conversion with a real allocation, so it is spelled at the declaration and never inferred. |

Extern shape is part of the contract: no type parameters, no overloads (every
`.d.ts` overload of one name is refused — there is no body to share), no
optional/rest parameters (a C prototype has no `undefined` to pad with, and rest
is varargs-adjacent, which v0 excludes), no `this` parameter. Violations are
`STA2011`.

## 4. Branded pointers

An opaque C handle is an interface (or type literal) with exactly one property:

```ts
interface sqlite3 { readonly __stator_brand: 'sqlite3'; }
```

The literal **is** the C type spelling: `'sqlite3'` calls through `sqlite3*`,
`'sqlite3_stmt'` through `sqlite3_stmt*` (the emitted prototype names it; the
included header defines it). Two handles with different literals are
incompatible at `tsc` level, which is the whole point — a statement is never a
database. Handles only ever arrive as extern returns and are passed back as
arguments; nothing constructs or dereferences one in TS.

A dynamic (`Unknown`) value reaching a branded-pointer parameter is always a
boundary failure (`STA2001`): untyped code cannot mint an address. Statically
branded values pass with no check.

## 5. Strings, both directions, with the lifetime written down

- **In** (`@statorAbi s: const char*` on a `string` parameter): the call encodes
  a NUL-terminated UTF-8 copy, frees it after the call on **every** exit path
  (landing pads included — the `JSRT_FRAME` discipline already demands this of
  temporaries), and hands the callee a **borrow**. v0 has no retain spelling:
  if the callee stores the pointer, the binding is wrong, and the per-signature
  prose (§7) is where that must be caught.
- **Out** (`@statorAbi return: const char*`): the bytes are copied into a runtime
  UTF-16 string at the boundary — never wrapped, because a wrapper's lifetime
  belongs to the C library and nothing in the runtime can track it. C-side
  memory is untouched; whose `free` it is belongs to the library's documented
  contract, quoted in the binding's doc comment.
- **Embedded NULs** in an argument truncate at the first NUL (C reality, stated
  rather than hidden). **Invalid UTF-8** in return bytes decodes to U+FFFD per
  WHATWG UTF-8. A failed copy allocation aborts like other generated-code
  allocation failures — there is no catchable OOM on this path.

## 6. Errors: C returns codes, and only the declaration knows what they mean

Default: the return value is a plain value and a failing call is not an
exception. `@statorThrows` opts one declaration into one closed convention:

| Convention | Throw when | Thrown |
|---|---|---|
| `nonzero` | return ≠ 0 | catchable `Error` naming the symbol and the value |
| `negative` | return < 0 | same |
| `null` | pointer return is NULL | same |
| `errno` | `errno` ≠ 0 after the call | `Error` naming the symbol and the `errno` number |

Two absolutes: a JS exception must **never** unwind through a C frame (the call
is made outside any construct that could throw across it), and with no
`@statorThrows` the return is data — but a declaration that *documents* a
failure mode without selecting the convention is a binding bug, caught in review,
not by the compiler.

## 7. GC and ownership, per signature, in prose

A pointer handed to C is invisible to the collector for the duration of the
call; the owning frame stays live across it (emitter discipline, step 5), and
the callee must not retain anything past return — v0 offers exactly two
lifetimes, **borrowed for the call** or **copied at the boundary** (§5),
because a third would be a lifetime the compiler cannot express. This is
documentation the compiler cannot check, which is exactly why it is
per-signature prose in the binding file rather than one global paragraph. A
binding that keeps a handle (SQLite's statement handles) uses the §4 brand,
whose lifetime is the C library's, not the collector's.

## 8. The trust boundary, stated honestly

Plan §0 rule 2 says never trust an annotation without a boundary — but a C
return value **cannot** be runtime-checked, so FFI is the one boundary where the
annotation is asserted by a human and not verified. `stator explain` marks every
extern call as an **unchecked boundary** so an audit can enumerate them; the
schema field for that mark lands with step 5 (it does not exist yet, and this
document does not invent it early).

## 9. `js` mode

The declaration is identical in both modes; only the checks differ. Arguments
arriving from untyped code are dynamic, so they get a boundary check at the call
and `STA2001` on mismatch — the existing runtime trap doing its existing job,
not a new mechanism (§4's always-fail rule for pointer brands included).

## 10. Implementation map

Steps 1–2 land with this document. Steps 3 (string copies), 4 (throw lowering),
5 (direct-call lowering + `#include` + frame discipline), 6 (ownership prose per
binding), 7 (link plumbing + `--link=`), 8 (`explain` mark), 9 (`js`-mode
checks) keep their plan.md §10 owners. Decision tests (both modes: extern call,
refused non-primitive, refused varargs-shape) and the golden tests (libm `sqrt`/
`fmod`, a two-function `.c` fixture the harness compiles itself, one ASan test
where C writes into a runtime-owned buffer) land with steps 5 and 10 — the
fixtures would assert codes no emitter produces yet, so writing them now would
be fiction, not coverage.

## Codes allocated by this document

`docs/DIAGNOSTICS.md` is the sole allocator; this section records what the FFI
surface needed and why.

| Code | Meaning |
|---|---|
| `STA2008` | Extern declaration outside a script `.d.ts` (a `.ts` ambient, a module `.d.ts`, any other file). |
| `STA2009` | Malformed `@stator*` marker (misplaced, duplicated, unknown tag, bad symbol shape, `@statorAbi` naming no parameter, unknown convention). |
| `STA2010` | Extern signature uses a type outside the ABI table — including a bare `string` with no `const char*` selection. |
| `STA2011` | Extern is not a plain function (type parameters, overloads, optional/rest parameters, `this`). |

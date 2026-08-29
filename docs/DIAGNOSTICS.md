# Diagnostics — Stator

This file is the authoritative reference for all diagnostic codes emitted by Stator. Codes are never reused or renumbered — tests and external tools reference them by number, and renaming a shipped code breaks tooling.

## Code ranges and classes

Stator divides diagnostics into six ranges, each with distinct semantics:

| Range | Purpose | Class | Characteristic |
|---|---|---|---|
| `STA0xxx` | CLI, configuration, toolchain | error | Argument parsing, missing files, compiler setup |
| `STA10xx` | Mode & typing policy | **never** | By-design rejections; permanent by mode choice (e.g., `any` in ts mode) |
| `STA11xx` | Rejected constructs | **never** | Unsupported language features (v1 non-goals, ESM-only rules, etc.); permanent |
| `STA12xx` | **Not yet** | not-yet | Planned features; message names the implementing phase |
| `STA2xxx` | Lowering / boundary errors | error, runtime | Cast failures and unimplemented lowering operations are compile-time `error`; boundary-check failures are class `runtime`, raised by the emitted program rather than the compiler (currently only `STA2001`) |
| `STA3xxx` | Module graph | error | Cyclic imports, missing modules, resolution failures |
| `STA4xxx` | Internal invariant violations | internal error | Always a compiler bug; message says so and asks for a report |

### Never vs. Not-yet: why this distinction matters

**Never** (`STA10xx`, `STA11xx`): By design, this will never compile in this mode/version. It is an explicit anti-goal. Tests and tooling use the code to enforce *policy* — for example, a test suite can assert "no code should hit `STA1001` (any in ts mode)" as a style rule. A never code is shipped and stable.

**Not-yet** (`STA12xx`): Planned for a future phase. The code documents *when* it will be addressed. Tests use it to mark expected-fail cases before the feature exists. When the phase ships, not-yet tests flip to passing in the same commit, and the code remains stable.

Never reuse: once a code is shipped in a release, every variant (the message, the mode, the phase name) is frozen. Future refinements get new codes in the reserved ranges.

## Output formats

### Human format

```
file:line:col STA1234 [mode] message text
```

Example:
```
src/app.ts:42:10 STA1001 [ts] explicit 'any' is not allowed in ts mode; use 'unknown' instead
```

Fields:
- `file:line:col`: source location (1-indexed)
- `STA1234`: diagnostic code (5 chars, always)
- `[mode]`: `ts` or `js` (braced, always)
- `message text`: human-readable explanation (may name phases, hint fixes, etc.)

### JSON format

`--diagnostics=json` turns the *diagnostic stream* into an array of diagnostic objects. This is
not the same thing as `stator explain --json`, which reports a per-construct verdict array plus
a file-level rollup — that schema is specified in `docs/MODES.md` §6 and is what
`tests/subset/run.ts` consumes. A diagnostic is "what went wrong"; an explain verdict is "how
this construct would compile", and most constructs produce a verdict without producing any
diagnostic at all.

```json
[
  {
    "file": "src/app.ts",
    "span": { "start": 42, "length": 3 },
    "line": 42,
    "column": 10,
    "code": "STA1001",
    "class": "never",
    "mode": "ts",
    "message": "explicit 'any' is not allowed in ts mode; use 'unknown' instead"
  },
  {
    "file": "src/async.ts",
    "span": { "start": 105, "length": 5 },
    "line": 12,
    "column": 4,
    "code": "STA1201",
    "class": "not-yet",
    "mode": "ts",
    "message": "async/await is not yet supported; planned for Phase 4",
    "phase": 4
  }
]
```

Schema:
- `file` (string): source file path
- `span` (object): offset and length in the source, in UTF-16 code units (the units the TypeScript compiler API reports, so no re-encoding is needed)
  - `start` (number): 0-indexed offset
  - `length` (number): span length
- `line` (number): 1-indexed line number
- `column` (number): 1-indexed column number, in UTF-16 code units
- `code` (string): the `STA` code — always present, on every diagnostic
- `class` (string): one of `error`, `never`, `not-yet`, `runtime`, `internal` — the same value this document's tables give the code, so it is derivable from `code` alone and is included only to save consumers a lookup
- `mode` (string): `ts` or `js`
- `message` (string): human-readable text
- `phase` (number): the delivering phase — present **only** when `class` is `not-yet`, and omitted (never `null`) otherwise, matching the `explain` schema's convention in `docs/MODES.md` §6

Note what is *not* here: `construct` and `verdict`. Those belong to `explain`, which reports on
constructs whether or not anything is wrong with them. A diagnostic always means something is
wrong, so its class already carries that information.

---

## STA0xxx: CLI, config, toolchain

| Code | Mode(s) | Class | Message template | Notes |
|---|---|---|---|---|
| STA0002 | both | error | unknown mode "{mode}" (expected "ts" or "js") | Triggered by invalid `--mode=` argument |
| STA0003 | both | error | unknown command "{cmd}" (expected "build" or "explain") | First non-flag argument is not `build` or `explain` |
| STA0004 | both | error | {context} requires {missing} | Covers: entry file missing, `-o` path missing, build requires `-o` |
| STA0005 | both | error | unknown flag "{flag}" | Any unrecognized flag starting with `-` |
| STA0006 | both | error | unexpected argument "{arg}" | Extra positional argument after entry file |
| STA0007 | both | error | entry file "{path}" does not exist | Checked before building the program, so the user gets a path error rather than a `tsc` "file not found" |
| STA0008 | both | error | C compiler "{cc}" not found — install clang (macOS: `xcode-select --install`; Debian/Ubuntu: `apt install clang`) or set `CC` | The message must name a fix: a missing toolchain is the one build failure a user can always act on. `CC` overrides the default `clang` |
| STA0009 | both | error | C compiler failed (exit {code}) — this is a compiler bug; keep the C with `--keep-c` and report it | Emitted C that clang rejects is always Stator's fault, never the user's. Points at `--keep-c` because the C is the evidence |
| STA0011 | both | error | runtime archive not found at {path} — run `make -C runtime` | Linking needs `runtime/build/libjsrt.a`; in a source checkout it is a build step the user has not run yet |
| STA0012 | both | error | {tsc message} | A diagnostic from the TypeScript checker itself, passed through with its location intact. One code for all of them on purpose: `tsc` already has a stable numbered error space (`TS2345` and friends), and mirroring it into the `STA` space would create a second name for every message with nothing to keep the two in sync |

`STA4001` is also raised by the CLI (`--version` with an unreadable `package.json`), but it lives
in the `STA4xxx` table below: the range is decided by what the code *means* — an internal
invariant violation — not by which module happens to raise it.

---

## STA10xx: Mode & typing policy (never)

These rejections are by design. They enforce the mode's philosophy: strict static typing in `ts` mode, flexibility in `js` mode.

| Code | Mode(s) | Class | Message template | Notes |
|---|---|---|---|---|
| STA1001 | ts | never | explicit 'any' is not allowed in ts mode; use 'unknown' instead | Triggered by bare `any` or `as any` cast in ts mode. Dynamic escape hatch; `any` in js mode compiles as dynamic value |
| STA1002 | ts | never | .js files are not allowed in ts mode; use `--mode=js` or convert to .ts | Attempt to load a `.js` file when mode is `ts`. Hint directs user to the right mode |
| STA1003 | ts | never | implicit 'any' is not allowed in ts mode; add a type annotation | Untyped variable, parameter, or expression in ts mode. `unknown` is the universal type if the type cannot be inferred |

---

## STA11xx: Rejected constructs (never)

These are language features that Stator does not support, either by design (ESM-only, v1 non-goal) or by architectural choice (no sloppy mode, no dynamic code generation).

| Code | Mode(s) | Class | Message template | Notes |
|---|---|---|---|---|
| STA1101 | ts | never | eval() is not allowed in ts mode — it prevents static analysis and is a permanent design choice | `eval` in any form (bare call or `globalThis.eval`) |
| STA1103 | ts | never | new Function() is not allowed in ts mode — code generation is not supported | Constructor form of dynamic code generation |
| STA1104 | ts | never | var is not allowed in ts mode; use let or const instead | Function-scoped hoisting is not supported; use block-scoped declarations. (js mode allows `var`) |
| STA1105 | ts | never | arguments pseudo-variable is not allowed in ts mode; use rest parameters instead | `arguments` object does not exist in ts mode; use `...rest` parameters |
| STA1106 | ts | never | Proxy is not supported in ts mode — metaprogramming is outside the static compilation model | `new Proxy()` in any form |
| STA1107 | ts | never | prototype mutation is not supported in ts mode — Object.setPrototypeOf, __proto__, and similar are incompatible with static shape analysis | `Object.setPrototypeOf()`, assignment to `__proto__`, or prototype rewrites |
| STA1108 | ts | never | delete on class fields is not supported in ts mode — classes have fixed shape at compile time | `delete` operator applied to a class field or property |
| STA1109 | both | never | with statement is not supported — ESM is strict; with is not allowed in strict mode | `with` keyword |
| STA1110 | both | never | CommonJS require() is not supported — Stator uses ES modules only | `require()` call or reference |
| STA1111 | both | never | .tsx and .jsx files are not supported in v1 — JSX is a post-MVP goal | Attempt to load `.jsx` or `.tsx` file |
| STA1112 | both | never | decorators are not supported in v1 | Any `@decorator` on a class, method, accessor, property, or parameter. A v1 non-goal (plan §0 "Non-goals"), so it is a `never` code rather than a `not-yet` one: no phase promises to deliver it |

---

## STA12xx: Not-yet (planned features)

These are language features on the roadmap. The message names the phase that will implement them.

| Code | Mode(s) | Class | Message template | Phase | Notes |
|---|---|---|---|---|---|
| STA1201 | both | not-yet | async/await and generators are not yet supported; planned for Phase 4 (runtime v1) | 4 | Coroutines require runtime support (event loop, task scheduling) |
| STA1202 | js | not-yet | arguments pseudo-variable is not yet supported in js mode; planned for Phase 5 (stretch goal) | 5 | In js mode, `arguments` accesses require shape tables and runtime support. ts mode rejects it permanently (STA1105) |
| STA1203 | js | not-yet | Proxy is not yet supported in js mode; planned for Phase 8 (dynamic tier) | 8 | Metaprogramming via proxies deferred to Phase-8 dynamic semantics |
| STA1204 | js | not-yet | prototype mutation is not yet supported in js mode; planned for Phase 8 (dynamic tier) | 8 | Shape-based optimizations and dynamic shape tables for prototype chains require Phase-8 support |
| STA1205 | js | not-yet | delete on properties is not yet supported in js mode; planned for Phase 8 (dynamic tier) | 8 | Deleting from dynamic shapes requires Phase-8 shape table updates. (ts mode rejects it permanently: STA1108) |
| STA1206 | js | not-yet | eval() and new Function() are not yet supported in js mode; planned for Phase 8 (dynamic tier) | 8 | One code for both dynamic-code-generation constructs — they land together with the Phase-8 interpreter tier. ts mode rejects them permanently (STA1101, STA1103) |
| STA1207 | both | not-yet | dynamic import() is not yet supported; planned for Phase 4 (runtime v1) | 4 | Returns a Promise, so it cannot land before async/await (STA1201) |
| STA1208 | both | not-yet | top-level await is not yet supported; planned for Phase 4 (runtime v1) | 4 | Module initialization becomes async; same prerequisite as STA1207 |
| STA1210 | both | not-yet | Date is not yet supported; planned for Phase 4 (builtins) | 4 | Constructor and `Date.prototype` methods (Phase 4 Task 4.2) |
| STA1211 | both | not-yet | RegExp methods are not yet supported; planned for Phase 4 (builtins) | 4 | `test`, `exec`, `match`, `replace`, `split`; needs vendored QuickJS-NG libregexp (Phase 4 Task 4.3). RegExp *literals* parse and compile before this lands |
| STA1212 | both | not-yet | Symbol is not yet supported; planned for Phase 5 | 5 | Well-known symbols, `Symbol.for`/`Symbol.keyFor`, and the global registry |
| STA1213 | both | not-yet | BigInt is not yet supported; planned for Phase 5 | 5 | A second numeric type with its own arithmetic and no implicit coercion to `number` |
| STA1214 | both | not-yet | {construct} is not yet supported; planned for Phase {n} | 3 | **The subset-boundary code.** Emitted by the frontend gate for any construct outside the subset the compiler currently lowers — functions, `for`, classes, `try`, objects, arrays, template literals, `&&`/`\|\|`, `==`/`!=`, globals the compiler does not model (`String`, `NaN`, `Math`, `globalThis`, …), and the rest. Deliberately ONE code rather than one per construct: these are not deferred for different reasons, they are deferred for the same reason (the subset has not reached them yet) and they arrive together as the lowering ladder climbs. The construct is named in the message; the code names the boundary. Constructs that graduate move to `static`, not to their own code, so this row shrinks every phase and is deleted when the subset is complete |

`STA1209` is unallocated: `STA1207`/`STA1208` are Phase 4 module features and `STA1210`+ are Phase 4/5 builtins, so the gap keeps room for a third module-level not-yet. Gaps are free; renumbering is not.

---

## STA2xxx: Lowering & boundary errors

These errors occur during translation from TypeScript AST to HIR, or when checking type boundaries and FFI contracts.

| Code | Mode(s) | Class | Message template | Notes |
|---|---|---|---|---|
| STA2002 | both | runtime | sparse arrays are not yet supported: writing index {i} of an array of length {len} would leave a hole | **The second runtime-emitted diagnostic.** Raised by `jsrt_array_set` when the index is more than one past the end. ECMA-262 leaves the skipped indices genuinely ABSENT — `console.log` prints `<2 empty items>`, not `undefined` — and the dense runtime array has no way to be absent, so it refuses loudly instead of filling with `undefined` and printing a different program's output. In-range writes and the append idiom `a[a.length] = v` are unaffected. Not a compile error by construction: the index is a runtime value. Lifts with sparse arrays (plan §5 Task 3.3 rung 5) |
| STA2001 | both | runtime | boundary check failed at {file}:{line}:{col} — expected {expected}, got {actual} | **The only runtime-emitted diagnostic.** Raised by `jsrt_check_*()` when a value crossing a type boundary (`unknown` narrowing, `JSON.parse`, FFI return, `.js`→`.ts` import) does not match the type the program claimed. Not a compile error by construction: the boundary exists precisely because the type is unknowable statically (plan §0.2). What the compiler guarantees is that the check is emitted and the location is preserved |

Everything else in this range is reserved; Phase 2+ populates it as lowering is implemented.

---

## STA3xxx: Module graph

| Code | Mode(s) | Class | Message template | Notes |
|---|---|---|---|---|
| STA3001 | both | error | import cycle detected: {cycle} | Cyclic module imports. Includes the cycle path for diagnosis. Phase 2 implements module-graph scanning |

---

## STA4xxx: Internal errors (always a bug)

Every code here means the compiler contradicted itself. A user can do nothing about one except
report it, so the message names the precise invariant that broke and asks for the input.

`STA4002`–`STA4020` are the HIR verifier's (`src/hir/verify.ts`). The verifier runs on HIR the
lowering just produced from source the gate just accepted, so a problem it reports always means the
gate and the HIR disagree about the subset — see the invariant at the top of `gateConstruct`.

| Code | Mode(s) | Class | Message template | Notes |
|---|---|---|---|---|
| STA4001 | both | internal | package.json has no readable "version" field | Reading `package.json` to emit version failed |
| STA4002 | both | internal | identifier '{name}' is not defined | Verifier: reference with no binding in scope |
| STA4003 | both | internal | identifier '{name}' assigned before declaration | Verifier: assignment target never declared |
| STA4004 | both | internal | assignment target type {a} does not match value type {b} | Verifier |
| STA4005 | — | — | *(retired)* | Was "if condition must be boolean". Retired once `if` applied ToBoolean: every value is truthy or falsy, so the rule rejected correct IR. Never reuse this number |
| STA4006 | — | — | *(retired)* | Was "while condition must be boolean". Retired with `STA4005`, same reason. Never reuse this number |
| STA4007 | both | internal | number-literal must have type 'number', got '{t}' | Verifier |
| STA4008 | both | internal | string-literal must have type 'string', got '{t}' | Verifier |
| STA4009 | both | internal | boolean-literal must have type 'boolean', got '{t}' | Verifier |
| STA4010 | both | internal | identifier '{name}' has type '{a}' but is used as '{b}' | Verifier |
| STA4011 | both | internal | arithmetic operand must be number, got {t} | Verifier: left operand. `unknown` is accepted too -- the emitter wraps every arithmetic operand in ToNumber, which is defined on every value. What this catches is a KNOWN non-number |
| STA4012 | both | internal | arithmetic operand must be number, got {t} | Verifier: right operand. Same rule as `STA4011` |
| STA4013 | both | internal | arithmetic operator result must be number, got {t} | Verifier |
| STA4014 | — | — | *(retired)* | Was "comparison operands must have the same type". Retired at rung 2: Abstract Relational Comparison accepts any two primitives, and `"10" < 9` is legal (and false). Never reuse this number |
| STA4015 | — | — | *(retired)* | Was "comparison operand must be number or string". Retired with `STA4014`: `true < 2` is legal (and true). Never reuse this number |
| STA4016 | both | internal | comparison result must be boolean, got {t} | Verifier |
| STA4017 | — | — | *(retired)* | Was "strict equality operands must have the same type". Retired because `null === undefined` is legal code that answers false. Never reuse this number |
| STA4018 | both | internal | equality result must be boolean, got {t} | Verifier |
| STA4019 | both | internal | console.log must have type 'undefined', got '{t}' | Verifier |
| STA4020 | both | internal | {kind} node missing HType | Verifier: a node reached the IR without a type. Allocated after `STA4001` was already taken — the verifier's own first code, not a renumbering |
| STA4021 | both | internal | lowering produced no module and no diagnostic | Raised by `stator explain` when `lowerSourceFile` returns `null` without saying why. Reporting `static` in that state would be a false claim about a program that does not compile |
| STA4022 | both | internal | null-literal must have type 'null', got '{t}' | Verifier |
| STA4023 | both | internal | undefined-literal must have type 'undefined', got '{t}' | Verifier |
| STA4024 | both | internal | bitwise operator result must be number, got '{t}' | Verifier. The result is a *number*, never an integer type: `>>>` can exceed int32 range (docs/NUMERIC.md §4.2) |
| STA4025 | both | internal | unary operator '{op}' result must be {number\|boolean}, got '{t}' | Verifier. `!` yields boolean; `-`, `+` and `~` yield number |
| STA4026 | both | internal | template literal has {n} literal chunks for {m} substitutions; expected {m+1} | Verifier. The chunks bracket the holes, so there is always exactly one more chunk than hole; a violation means the emitter would silently drop or duplicate text |
| STA4027 | both | internal | template literal must have type 'string', got '{t}' | Verifier |
| STA4028 | both | internal | string length must have type 'number', got '{t}' | Verifier. A count of UTF-16 code units (docs/VALUE.md §2) |
| STA4029 | both | internal | {break\|continue} has no {enclosing\|labelled '{l}'} {loop\|loop or switch} to jump out of | Verifier. The last code in the verifier's original band. A jump whose target does not resolve would be emitted as a `goto` to a C label the emitter never wrote, so the failure would surface as a clang error against generated code instead of a diagnostic. Note the asymmetry the message carries: `break` may leave a loop *or* a switch, `continue` only a loop |
| STA4040 | both | internal | switch has {n} default clauses; at most one is legal | Verifier. First code of the verifier's second band. Unreachable from source today — TypeScript rejects a duplicate `default` before the gate sees it — but it is an invariant of the HIR, which later passes will also construct |
| STA4041 | both | internal | callee has type '{t}', which is not callable | Verifier. `unknown` is exempt: in js mode a call on an unresolved value is the whole point, and the check happens at runtime. A *concrete* non-function callee means the lowering built a call the checker would already have rejected |
| STA4042 | both | internal | return statement outside a function | Verifier. The emitter would compile it to a `JSRT_FRAME_POP(); return` in `main`, popping the globals frame that must outlive the program |
| STA4043 | both | internal | array length must have type 'number', got '{t}' | Verifier. The `.length` of an array is a `number` by construction; anything else means the lowering built the node with the operand's type or the element's |
| STA4044 | both | internal | index target has type '{t}', which is not indexable | Verifier. Covers `a[i]` as a read and as an assignment target. `unknown` is exempt for the same reason it is exempt from `STA4041` — in js mode indexing an unresolved value is the point, and the runtime decides |
| STA4045 | both | internal | for-of iterable has type '{t}', which is not an array | Verifier. Separate from `STA4044` because the emitted shape differs, not just the message: for-of over an array compiles to a counted loop, and no other iterable is in the subset yet |
| STA4046 | both | internal | field '{f}' is not slot {n} of {C} / field target has type '{t}', which has no fields | Verifier. This is the reason `FieldAccess` and `FieldAssignment` STORE a slot instead of letting the emitter recompute one: a recomputed index is correct by construction and therefore unfalsifiable, while a stored one can be checked against the layout it claims to index. A disagreement between the lowering's field order and the type's would otherwise be a silent read of the wrong field |
| STA4047 | both | internal | receiver has type '{t}', not {C} / {C} has no method '{m}' | Verifier. `MethodCall` names the class so the emitter can call the method directly rather than loading a closure per instance. That name is only safe while it still matches the receiver's type and the method still exists on it — otherwise the emitted call runs another class's body |
| STA4048 | both | internal | new {C} has type '{t}' | Verifier. The allocated descriptor and the expression's type must be the same class; they are chosen at different points in the lowering |
| STA4049 | both | internal | {C}.{m} does not take {C} as its receiver | Verifier. Every constructor and method is lowered as an ordinary function whose parameter zero is the instance. A member missing it would read fields out of whatever the caller happened to pass first |
| STA4030 | both | internal | internal error during lowering: {detail} | Lowering: an exception escaped. The catch-all that keeps a stack trace from reaching the user |
| STA4031 | both | internal | unexpected {statement\|expression} kind: {kind} | Lowering: a construct the gate accepted and the lowering cannot lower — the two disagree about the subset. See the invariant at the top of `gateConstruct` in `src/frontend/gate.ts` |
| STA4032 | both | internal | {empty declaration list \| multiple declarations in one statement \| declaration without initializer} | Lowering: a `VariableStatement` shape the gate should have rejected |
| STA4033 | both | internal | assignment target must be an identifier | Lowering |
| STA4034 | both | internal | identifier '{name}' assigned before declaration | Lowering |
| STA4035 | both | internal | identifier '{name}' used before declaration | Lowering |
| STA4036 | both | internal | unsupported binary operator: {kind} | Lowering |
| STA4037 | — | — | *(retired)* | Was "unsupported call expression". Retired at rung 4a: the lowering now lowers every call the gate accepts, so no call can reach it. A callee the gate should have rejected is a gate bug, and a non-callable callee is `STA4041`. Never reuse this number |
| STA4060 | both | internal | no field '{f}' on {t} | Lowering. First code of the lowering's second band. The checker proved the name is declared and the gate proved the target is a class this subset lays out, so a miss means `classTypeToHType` and the gate disagree about what a class is — the load-bearing invariant, seen from the inside |
| STA4061 | both | internal | this outside a class member | Lowering. `this` lowers to a read of the receiver parameter, which only a constructor or method has; the gate rejects every other position |
| STA4062 | both | internal | new produced '{t}', which is not a class instance / receiver has type '{t}', which is not a class instance / not a class instance the type model describes | Lowering. One code for the three places the same invariant is checked — `new`, a method receiver, and a class declaration — because the failure is identical in all three: the gate accepted a class the type model then declined to describe |

---

## Adding a new diagnostic code

1. **Identify the range.** Consult the ranges table above. Is this a CLI error (STA0), a never-reject (STA1x), a not-yet (STA12), a lowering error (STA2), module graph (STA3), or internal bug (STA4)?

2. **Pick the next free number.** Scan the appropriate range in this file and choose the lowest unoccupied code.

3. **Add a row** to the appropriate table with:
   - Code
   - Mode(s) affected (`ts`, `js`, or `both`)
   - Class (`error`, `never`, `not-yet`, `runtime`, `internal`)
   - Message template (may use `{placeholders}` for dynamic values)
   - Phase (for `not-yet` only)
   - Notes (explain when triggered, interactions with other codes, etc.)

4. **Add a decision test** in `tests/subset/` for error/not-yet codes (see AGENTS.md testing rules). The test must reference the new code in a `// @code: STAxxxx` directive.

5. **Update the emitter** in `src/`. The code must be hardcoded in the throw site; never derive it from data.

6. **Commit together.** The code, test, and emitter update land in one commit, with the code cited in the commit message.

**Never:**
- Reuse a shipped code
- Change a shipped code's message in any form
- Move a code between ranges
- Delete a code (if it became obsolete, leave it in the table and mark it reserved)

---

## Reserved and not-yet-allocated

The following ranges are reserved for future phases:

- **STA0007–STA0009**: CLI/toolchain (Phase 2+)
- **STA0011–STA0099**: CLI/toolchain and config
- **STA1113–STA1199**: Rejected constructs (Phase 1+ may add more as new anti-goals are clarified)
- **STA1209, STA1215–STA1299**: Not-yet features (Phase 2+ will expand as phases land)
- **STA2003–STA2999**: Lowering and boundary errors (Phase 2 onward)
- **STA3002–STA3999**: Module graph errors (Phase 2+)
- **STA4038–STA4039, STA4050–STA4059, STA4063–STA4999**: Internal errors (may grow as invariants are formalized). STA4002–STA4020, STA4022–STA4029 and STA4040–STA4059 are the HIR verifier's; STA4030–STA4037 and STA4060–STA4079 are the lowering's. The gap between the verifier's first two ranges was deliberate room for each to grow without renumbering.
  The verifier's first band is **full** (STA4029 was the last of it) and it now works in its second band, **STA4040–STA4059**, of which STA4040–STA4049 are taken. The lowering's first band is also effectively full — STA4038–STA4039 are its only remaining room, and `STA4037` is retired rather than reusable — so it has opened a second band, **STA4060–STA4079**, of which STA4060–STA4062 are taken. Each is a new band, not a renumbering of an old one, which is why the free ranges above are discontiguous.

Each phase's task-list entries in `plan.md` will allocate from these ranges as features ship. Allocations are made in this file — never in source code comments or separate documents.

---

## Retired codes — never reuse

| Code | Was | Why retired |
|---|---|---|
| STA0010 | "{cmd}" is not implemented yet — plan.md Phase 2 delivers it | The placeholder `build`/`explain` emitted before Phase 2. Phase 2 implements both commands, so nothing can reach it. A missing entry file is now `STA0007`. |
| STA1102 | eval / `new Function` in js mode ("not yet", Phase 8) | A **not-yet** code allocated inside the `STA11xx` **never** range, which breaks the disjoint-range invariant in plan §1.3 — a test could not tell design intent from schedule by looking at the number. Renumbered to `STA1206` before anything shipped. |

A retired code is dead, not free: it stays listed here and is never assigned a new meaning. Retirement is only possible because nothing has shipped yet; after the first release, a mistaken code is fixed by *adding* a correct one, never by moving it.

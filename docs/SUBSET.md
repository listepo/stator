# SUBSET.md — Feature support matrix for Stator

## Overview

This document specifies which language features Stator compiles in each mode, and how. The four verdict values are:

- **static** — compiled to unboxed machine values (i32, f64, struct fields, function pointers); the default fast path.
- **dynamic** — compiled via tagged NaN-boxed values with shape tables and inline caches; used for untyped code and type-narrowed unions in `js` mode.
- **error(CODE)** — compile error, by design, with a permanent diagnostic code. Features marked as errors will never be supported in that mode.
- **not-yet(CODE, phase)** — planned feature; the diagnostic code and phase name indicate when support arrives.

Each row becomes ≥1 decision test (§4 Task 1.4 in plan.md) per mode, executable via `stator explain --json`.

This matrix operationalizes plan.md §1 (product spec). Rows must not contradict the starting matrix in plan.md §4 Task 1.1. Rows marked **[proposed]** represent language features not listed there but that implementers will encounter early (e.g., `for`-`of`, template literals, destructuring, exceptions); each is documented in the "Codes allocated by this document" section with a defensible verdict consistent with the plan's philosophy.

### Mode semantics

`ts` mode rejects untyped code entirely; `js` mode accepts both `.ts` and `.js` files, treating untyped code as `Unknown` and lowering to the dynamic path (shape tables, inline caches, tagged values). One pipeline, two policy layers: file acceptance, diagnostic table, and typing of unresolved constructs.

---

## Syntax & control flow

| Feature | `ts` mode | `js` mode | Notes |
|---|---|---|---|
| `let`, `const` bindings | static | static if typed, else dynamic | Binding semantics are static; initialization and narrowing drive the static/dynamic split. |
| Function declarations, function expressions, arrow functions | static | static if typed, else dynamic | Closure capture via environment structs; untyped parameters widen to `Unknown`. Capturing a binding declared *inside a loop* is `STA1214` until loops carry per-iteration environments — one environment per call would give every iteration's closure the same slot. |
| `if` statements | static | static | Condition is evaluated; predicate narrowing is type-driven. |
| `while`, `do`/`while` loops | static | static | Control flow only. |
| `for` loop (C-style) **[proposed]** | static | static | Loop variable and bounds are typed; control flow is unboxed. |
| `for`...`of` loop over an array | static if the element type is typed, else dynamic | same | Compiled to a counted loop, with the length re-read each step so a body that shortens the array stops early. Labels work on it like any other loop. A string, `Map`, `Set` or user iterable is `not-yet(STA1214)`: that is the Symbol.iterator protocol, which needs the object model. |
| `for`...`in` loop **[proposed]** | dynamic | dynamic | Property enumerability is a runtime decision in both modes; no static optimization for for-in exists. |
| `switch` statement **[proposed]** | static | static if cases are typed, else dynamic | Control flow; case evaluation is type-driven. |
| `break` and `continue` **[proposed]** | static | static | Unlabeled and labeled control-flow redirection. |
| Labeled statements and labeled `break`/`continue` **[proposed]** | static | static | Compile to plain `goto` — not *computed* `goto`, which is a GCC extension taking a label's address and is not needed: every jump target is known at compile time. Unlabeled jumps use `goto` too, so a `break` inside a `switch` inside a loop cannot be captured by C's own binding rules. |
| Template literals **[proposed]** | static | static if interpolations are typed, else dynamic | String concatenation of typed values compiles to direct C concatenation; untyped interpolations use `jsrt_string_coerce()`. |
| Spread operator `...` in array literals **[proposed]** | static | static if spread source is typed, else dynamic | Untyped spread arrays route via `Unknown` shape dispatch. |
| Rest parameters `...args` **[proposed]** | static | static if all consumers are typed, else dynamic | Captured as an array; untyped call sites route via `Unknown`. |
| Object destructuring **[proposed]** | static | static if source object is typed, else dynamic | Destructured bindings must match the source's type; untyped sources use `Unknown` shape dispatch. |
| Array destructuring **[proposed]** | static | static if source array is typed, else dynamic | Similar to object destructuring; requires typed iterables for the source. |
| `try`/`catch`/`finally`/`throw` **[proposed]** | static | static; catch binding is `Unknown` in `.js` without JSDoc type | Exception unwinding via landing pads; catch variable is typed in `.ts`, untyped in `.js` unless JSDoc-annotated. |
| `async` function declarations and expressions, generators **[proposed]** | not-yet(STA1201, Phase 4) | not-yet(STA1201, Phase 4) | State-machine lowering in HIR; event loop and Promise support (Phase 4 Task 4.6). Generator protocol via `yield`. |

---

## Types & typing policy

| Feature | `ts` mode | `js` mode | Notes |
|---|---|---|---|
| Type annotations (`: number`, `: string[]`, etc.) | static | static (where present) | Types are strictly required in `ts` mode; optional in `js` mode (inferred from code or JSDoc). |
| Interfaces and type aliases | static | static (where present) | Compile-time constructs; no runtime representation. |
| Explicit `any`, `as any` | error(STA1001) | dynamic | `ts` mode forbids `any` entirely (use `unknown` instead); `js` mode lowers to tagged values with dynamic dispatch. |
| Implicit `any` | error(STA1003) | dynamic | `ts` mode rejects untyped parameters and variables under strict mode; `js` mode lowers to `Unknown` (tagged, dynamic). |
| Union types | dynamic (tagged; narrowing = runtime check) | dynamic | Discriminated unions compile to checks on the discriminant tag; checked narrowing produces unboxed values on the hot path. |
| `unknown` type | dynamic (narrowing = runtime check) | dynamic | First-class HType; narrows only when a check is proven (typeof guard, `instanceof`, pattern match). |
| `JSON.parse()`, FFI returns, `as` casts to incompatible types | dynamic (boundary-checked, always) | dynamic | Every unchecked type boundary gets a `jsrt_check_*()` call at the narrowing point. A check failure is a runtime type error with source location. |
| Generics | static (monomorphized per concrete type tuple) | monomorphized where typed; boxed `Unknown` fallback for cold generics | Instantiation sharing by type identity; cyclic instantiation depth triggers a compile error. |

---

## Objects & classes

| Feature | `ts` mode | `js` mode | Notes |
|---|---|---|---|
| Classes with fixed shape (no getters/setters) | static (fixed slot offsets) | static if fully typed, else dynamic | **Implemented (rung 6a).** An instance is one allocation: a pointer to a file-scope `JSRTClass` descriptor followed by its slots, with declaration order as slot order. A field read is an offset load, not a lookup. The slot list comes from the CHECKER's property list, not from the member nodes, which is why a `.js` class — whose fields are declared by `this.x = …` in the constructor and have no member node at all — gets the same layout with `unknown` field types. Methods occupy no slot: one function is shared by every instance and the call resolves at compile time to that class's method, so `o.m()` is a direct call with the receiver as argument zero. Inheritance, `super`, statics, `#private` and `instanceof` are rung 6b. |
| Classes with getters/setters | dynamic (property access lowers to function call) | dynamic | Getters and setters prevent fixed-slot layout; all access becomes a call site. Not-yet today: the fixed-shape gate rejects a class with an accessor rather than silently laying it out as if the accessor were a field. |
| Class inheritance, `super` calls, instance methods **[proposed]** | static (vtable dispatch; `super` resolved at compile time) | static if types are present, else dynamic | Inheritance chains are known; `super.method()` resolves to the parent's implementation statically. |
| Static methods and static class members **[proposed]** | static | static if typed, else dynamic | Class-level members are compile-time constants or static function pointers. A static *method* is always static — its identity is fixed at compile time. A static *field* follows its value: an untyped one holds `Unknown` and reads route through the dynamic path like any other. |
| Private fields (class `#field` syntax) **[proposed]** | static | static if typed, else dynamic | Private fields are compile-time known; no runtime property lookup. Access is a struct field read. |
| Object literals with static keys **[proposed]** | static | static if all values are typed, else dynamic | Fixed shape, similar to classes; key set is compile-time known. |
| Object literals with dynamic keys, index signatures | dynamic (shape table + inline cache) | dynamic | Runtime property dispatch via shape table and per-site inline cache. |
| Getters/setters on object literals **[proposed]** | dynamic | dynamic | Accessor descriptors cannot be compiled to fixed field access; property access routes through the descriptor. |

---

## Collections & data structures

| Feature | `ts` mode | `js` mode | Notes |
|---|---|---|---|
| Arrays: dense, homogeneous element type | static (dense buffer, bounds-checked; elision when provably in-range is Phase 3 Task 3.5) | static if typed, else dynamic | `[…]` literals, `.length`, `for-of` and index WRITE are all static. js mode is not "always dynamic": `[1, 2, 3]` infers `number[]` with or without the annotation, so it compiles on the same path. |
| Arrays: index READ `a[i]` | dynamic | dynamic | `noUncheckedIndexedAccess` types the read `T \| undefined`, because out of range it really is `undefined`. That union is `Unknown`, and Task 3.5 (boundary-check insertion) is what narrows it back to `T`. `for (const x of a)` binds the ELEMENT type and stays static — it is the typed way to read an array today (plan-notes 53). |
| Arrays: sparse (a write more than one past the end) | not-yet(STA2002, raised at runtime) | not-yet(STA2002, raised at runtime) | ECMA-262 leaves the skipped indices absent — `console.log` prints `<2 empty items>`, not `undefined` — and a dense buffer cannot be absent, so the write refuses loudly rather than printing a different program's output. In-range writes and `a[a.length] = v` are unaffected. Lifts with the object model. |
| Arrays: heterogeneous or untyped | dynamic (element type `Unknown`, tagged values) | dynamic | Elements stored as tagged `jsrt_value`; shape check on access to narrow type. |
| `Map` with primitive keys (string, number, boolean, null, undefined) | static (specialized hash table for primitives, unboxed key/value) | static if typed, else dynamic | Value-based key lookups; no identity-based hashing. |
| `Map` with object or unknown keys | dynamic (identity-hash table; JS object keys compare by identity, so pointer identity is the hash) | dynamic | Objects keyed by pointer identity; HashMap lookups use pointer equality. |
| `Set` with primitive elements | static (specialized) | static if typed, else dynamic | Primitive uniqueness is value-based. |
| `Set` with object elements | dynamic (identity-based set; elements compared by pointer) | dynamic | Set membership determined by pointer identity. |
| `Date` **[proposed]** | not-yet(STA1210, Phase 4) | not-yet(STA1210, Phase 4) | Builtin class; constructor and methods planned for Phase 4 Task 4.2 (builtins). |
| `RegExp` literals **[proposed]** | static (compile-time pattern) | static (same) | Regex objects with compiled patterns; methods depend on Phase 4 support. |
| `RegExp.prototype` methods **[proposed]** | not-yet(STA1211, Phase 4) | not-yet(STA1211, Phase 4) | `test()`, `exec()`, `match()`, `replace()`, `split()`; depend on QuickJS-NG libregexp (Phase 4 Task 4.3). |
| `Symbol` primitive **[proposed]** | not-yet(STA1212, Phase 5) | not-yet(STA1212, Phase 5) | Well-known symbols, Symbol.for/Symbol.keyFor, registry. Deferred past MVP. |
| `BigInt` primitive **[proposed]** | not-yet(STA1213, Phase 5) | not-yet(STA1213, Phase 5) | Separate numeric type with dedicated arithmetic. Deferred past MVP. |

---

## Numbers & operators

| Feature | `ts` mode | `js` mode | Notes |
|---|---|---|---|
| `number` type, `i32`/`f64` split per `NUMERIC.md` | static (i32 where range-provable; overflow to f64; all double by default) | static / dynamic | Typed numbers compile to machine integers and doubles; untyped numbers use dynamic boxing. |
| `string` type | static | static / dynamic | Typed strings are `JSString` pointers; untyped strings use tagged `jsrt_value`. |
| `boolean` type | static | static | Booleans always unboxed (1-bit tag in NaN-box). |
| Arithmetic operators: `+`, `-`, `*`, `/`, `%` **[proposed]** | static (where operands are typed) | static if typed, else dynamic | Typed numeric operands use fast C arithmetic; untyped route via `ToNumber()` coercion. |
| Unary `+`, `-`, `~` (bitwise NOT), `!` (logical NOT) **[proposed]** | static | static if operand is typed, else dynamic | Negation and bitwise complement depend on operand type knowledge. |
| Bitwise operators: `&`, `\|`, `^`, `<<`, `>>`, `>>>` **[proposed]** | static (apply `ToInt32`/`ToUint32` per ES spec) | static if typed, else dynamic | Always apply spec-mandated integer coercion; `>>>` produces uint32, may need f64. |
| Exponentiation operator `**` **[proposed]** | static | static if typed, else dynamic | Lowers to `pow()` call; type-driven. |
| `==`, `!=` loose equality | static where operand types decide it, else dynamic (full ToPrimitive coercion on the dynamic path) | same | Typed operands (primitives or disjoint types) compile to direct comparison; untyped route via `jsrt_equal_loose()`. |
| `===`, `!==` strict equality **[proposed]** | static | static | Unboxed comparison (pointer equality for objects, value equality for primitives). |
| Comparison operators: `<`, `>`, `<=`, `>=` **[proposed]** | static where types allow, else dynamic | same | Typed primitives use C comparison; untyped route via `ToPrimitive()` and `jsrt_compare_*()`. |
| Logical operators: `&&`, `\|\|` **[proposed]** | static (control flow; short-circuit optimization) | static (same) | Compiled to conditional branches. |
| `typeof` operator **[proposed]** | static | static | Builtin operator; evaluates to a constant string per value type. |
| `instanceof` operator **[proposed]** | static if class is typed, else dynamic | static if typed, else dynamic | Typed instances check the class tag; untyped values route via `jsrt_instanceof()`. |
| Optional chaining `?.` **[proposed]** | static (compiles to null/undefined check) | static (same) | Null-check short-circuits the rest of the chain. |
| Nullish coalescing `??` **[proposed]** | static (compiles to null/undefined check) | static (same) | Binary operator; RHS evaluated only if LHS is null/undefined. |

---

## Globals & builtins

| Feature | `ts` mode | `js` mode | Notes |
|---|---|---|---|
| `console.log(x)` with one argument | static | static | The one global the compiler models today. It is a single HIR node, not a property lookup on a `console` object — there is no `console` value to look anything up on. |
| `undefined` | static | static | Not a global reference at all: it lowers to an undefined-literal. A user binding that shadows the name wins, exactly as it does at runtime. |
| Every other global: `String`, `Number`, `Boolean`, `parseInt`, `parseFloat`, `NaN`, `Infinity`, `Math`, `JSON`, `globalThis`, `console` as a value | not-yet(STA1214) | not-yet(STA1214) | These need the global object, which is Phase 4 (builtins). Deferred at the **gate**, deliberately: the lowering builds bindings only for declarations it lowers, so accepting one produced `STA4035` — an internal error, for legal source (plan-notes 61). `Date` and `RegExp` methods keep their own codes (`STA1210`, `STA1211`). |
| A user binding that shadows a global name | static | static | The rule is "declared nowhere in the module", not "spelled like a global". |

## Modules & imports (ESM only)

| Feature | `ts` mode | `js` mode | Notes |
|---|---|---|---|
| `import` declarations (named, default, namespace) | static (resolved at compile time; reachable exports linked) | static (same) | ESM is the only module system; all imports must be resolvable at compile time. |
| `export` declarations (named, default) | static | static | Compile-time visibility; exported symbols exposed to importers. |
| Re-exports (`export { x } from 'y'`) **[proposed]** | static | static | Passthrough; re-exported symbols included in output if reachable. |
| `import()` dynamic import **[proposed]** | not-yet(STA1207, Phase 4) | not-yet(STA1207, Phase 4) | Dynamic module loading requires async/await support (Phase 4 Task 4.6); returns Promise. |
| Top-level `await` **[proposed]** | not-yet(STA1208, Phase 4) | not-yet(STA1208, Phase 4) | Module initialization with await; requires async infrastructure (Phase 4). |
| Cyclic module imports | error(STA3001), source-located | error(STA3001), source-located | Cycles rejected outright; diagnostic names the cycle path. |

---

## Dynamic escape hatches (errors or not-yet)

| Feature | `ts` mode | `js` mode | Notes |
|---|---|---|---|
| `var` declarations, hoisting | error(STA1104) | static (function-scoped, hoisted, initialized `undefined`) | `var` forbidden in `ts` mode (use `let`/`const`); in `js` mode, lowered to function scope with hoist semantics. |
| `arguments` binding | error(STA1105) | not-yet(STA1202, Phase 5 stretch) | `arguments` forbidden in `ts` mode (use rest parameters); `js` mode support deferred due to lack of fast path for untyped arrays. |
| `eval()` function | error(STA1101), permanent | not-yet(STA1206, Phase 8) | Permanent error in `ts` mode by design (no dynamic code generation). `js` mode defers to Phase 8 (interpreter tier with QuickJS-NG). |
| `new Function()` | error(STA1103), permanent | not-yet(STA1206, Phase 8) | Permanent error in `ts` mode. `js` mode depends on Phase 8 interpreter tier. |
| `Proxy` object | error(STA1106) | not-yet(STA1203, Phase 8) | Proxies intercept all property access via traps; no static analysis of their behavior exists. `ts` mode rejects; `js` mode defers to Phase 8 (interpreter tier). |
| Prototype mutation: `Object.setPrototypeOf()`, `__proto__` writes | error(STA1107) | not-yet(STA1204, Phase 8) | Prototype changes after object construction break compile-time shape assumptions. Forbidden in `ts` mode; deferred in `js` mode. |
| `delete` on class field (instance or static) | error(STA1108) | not-yet(STA1205, Phase 8) | Class fields are compile-time-known struct members; deletion requires runtime shape changes. Forbidden in `ts` mode; deferred in `js` mode. |
| `with` statement, sloppy mode | error(STA1109) | error(STA1109) | ESM is always strict, and `with` is illegal in strict mode — so this is not a Stator restriction, it is the language's. |
| CommonJS `require()` | error(STA1110) | error(STA1110) | ESM is the only module system in both modes. |

---

## Out of scope for v1

| Feature | `ts` mode | `js` mode | Notes |
|---|---|---|---|
| `.tsx`, `.jsx` JSX syntax | error(STA1111) | error(STA1111) | JSX deferred; `.tsx` and `.jsx` files rejected in both modes. React and JSX-using libraries out of scope for MVP. (A `.js` file in `ts` mode is a different diagnostic: STA1002, which points at `--mode=js`.) |
| Decorators **[proposed]** | error(STA1112) | error(STA1112) | Decorators (TC39 stage 3) are a v1 non-goal in both modes. A `never` code, not a `not-yet` one: no phase currently promises them. |

---

## Codes allocated by this document

`docs/DIAGNOSTICS.md` is the authoritative allocator (plan §4 Task 1.3): every code below has a row there with its exact message template. This section records *which* codes the matrix needed and why, not what they say.

### "Never" class (errors by design, STA10xx/STA11xx)

All codes in this range reused from plan.md except the four below.

| Code | Feature | Mode | Meaning |
|---|---|---|---|
| STA1106 | `Proxy` | `ts` | Proxy objects prevent static analysis; forbidden in strict-static mode. |
| STA1107 | Prototype mutation (`Object.setPrototypeOf`, `__proto__` write) | `ts` | Prototype changes after construction break shape assumptions; forbidden in strict-static mode. |
| STA1108 | `delete` on class field | `ts` | Class field deletion requires runtime shape changes; struct layout is compile-time fixed. |
| STA1112 | Decorators | both | A v1 non-goal in both modes; no phase promises them, so this is a `never` code. |

### "Not yet" class (planned, STA12xx)

All codes in this range reused from plan.md except those listed below.

| Code | Feature | Mode | Phase | Meaning |
|---|---|---|---|---|
| STA1201 | `async`/`await`, generators | both | Phase 4 | State-machine lowering; event loop and Promise support (Phase 4 Task 4.6). |
| STA1202 | `arguments` binding | `js` | Phase 5 stretch | Untyped `arguments` arrays lack a fast path; support deferred. |
| STA1203 | `Proxy` | `js` | Phase 8 | Requires interpreter tier (QuickJS-NG) for trap interception. |
| STA1204 | Prototype mutation | `js` | Phase 8 | Interpreter tier allows runtime shape changes. |
| STA1205 | `delete` on class field | `js` | Phase 8 | Interpreter tier allows runtime property deletion. |
| STA1206 | `eval()` **and** `new Function()` | `js` | Phase 8 | One code, because both land with the same interpreter tier and neither can ship without it. |
| STA1207 | `import()` dynamic import | both | Phase 4 | Async module loading; depends on async/await infrastructure. |
| STA1208 | Top-level `await` | both | Phase 4 | Module-init async support (Phase 4 Task 4.6). |
| STA1210 | `Date` builtin class | both | Phase 4 | Constructor and `Date.prototype` methods (Phase 4 Task 4.2 builtins). |
| STA1211 | `RegExp.prototype` methods | both | Phase 4 | `test()`, `exec()`, `match()`, `replace()`, `split()`, etc.; QuickJS-NG libregexp (Phase 4 Task 4.3). |
| STA1212 | `Symbol` primitive type | both | Phase 5 | Well-known symbols, Symbol.for/Symbol.keyFor, and registry. |
| STA1213 | `BigInt` primitive type | both | Phase 5 | Separate numeric type with dedicated arithmetic. |

`STA1102` appeared in an early draft of this matrix for eval-in-`js`-mode. It is **retired** and must never be reused — it put a "not yet" verdict inside the `STA11xx` "never" range, which is exactly the confusion the two ranges exist to prevent. See the retired-codes table in `docs/DIAGNOSTICS.md`.

---

## Notes and clarifications

- **Decidability:** Every row is testable via `stator explain --json` on a minimal program exercising that feature. Pre-Phase-1-implementation tests carry `// @expected-fail: true` and are reported (never hidden) by the test runner (§4 Task 1.4).
- **Boundary checks:** All "dynamic" verdicts rely on `jsrt_check_*()` functions at type-narrowing points. A runtime type mismatch is a located error, never silent corruption.
- **Specialization:** Features marked "static if typed, else dynamic" route to the static fast path only when the TS compiler can infer a concrete type. Untyped code in `js` mode takes the dynamic path using tagged `jsrt_value`.
- **Phase clock:** "Not yet" features are gated by the phase system in plan.md; out-of-scope features are permanently off v1's roadmap. No feature moves earlier than its phase without a plan amendment (plan §15.3).
- **Decision boundary:** The same feature may differ between modes because `ts` mode rejects untyped code outright (error), while `js` mode lowers it to the dynamic path (tagged values, shape tables, inline caches). This is by design (plan §1).

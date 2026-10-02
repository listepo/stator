# MODES.md — Stator operational specification

This document operationalizes plan.md §1 "Product spec — the two modes." On conflict, plan.md wins; contradictions are reported in plan-notes.md.

## 1. Purpose and authority

Stator compiles TypeScript/JavaScript to native binaries in one of two modes that differ radically in what code they accept and how they type untyped or dynamically-valued code. Mode is a **policy layer**: the frontend gate (file acceptance + diagnostic table + typing of unresolved code). Nothing below the frontend—passes, lowering, codegen, runtime—knows the mode exists; if a pass or the emitter reads the mode, the design is wrong (plan §0.8).

- **`ts` mode (default):** Static TypeScript compilation. `.ts` files only. `any`, `as any`, `eval`, `new Function`, `Proxy`, prototype mutation, `var`, `arguments` are compile errors. Unresolved types are errors. Types fully trusted inside type boundaries.
- **`js` mode:** JavaScript + TypeScript mixed, never rejected. Untyped code compiles via a dynamic representation. `eval` is "not yet" (Phase 8). Types trusted only at narrow points where dynamic values enter typed code.

## 2. `ts` mode (default)

### Inputs

- **Files:** `.ts` only. A `.js`, `.jsx`, or `.tsx` file anywhere in the module graph (including transitive dependencies) is `STA1002` (error) with message "expected .ts, got [ext]; use `--mode=js` for untyped code."
- **Module format:** ESM only (enforced by `tsconfig.json` `module: NodeNext`).
- **Semantic:** ECMAScript semantics, not Node.js; no global `__dirname`, `require`, `process` (these are runtime-provided via standard library or rejected as undefined).

### Typing contract

Stator owns `tsconfig.json` (plan §4 Task 1.0): `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly`. User code cannot relax these; they are the foundation of the mode's correctness.

- **Implicit `any`:** Untyped function parameters, unresolved global identifiers, or index accesses without type guards are `STA1003` (error): "implicit `any`; annotate the type or use `--mode=js`."
- **Explicit `any` or `as any`:** `STA1001` (error): "explicit `any` is not allowed in `ts` mode; use `unknown` instead and narrow at type boundaries."
- **Unresolved identifiers:** `STA1003` (error): "unknown identifier; import it or declare its type."
- **Constructor/function calls with unknown return type:** `STA1003` (error): "return type is `any`; check the function's type signature."

### Permanently rejected (by design)

No escape hatches; these are design errors, not missing features.

Each construct gets its **own** code — `docs/DIAGNOSTICS.md` holds the exact message text, and
a test that asserts "this file is rejected for using `Proxy`" must not also pass when the file
is rejected for using `var`.

- `eval`: `STA1101` — dynamic code execution defeats static analysis outright.
- `new Function`: `STA1103` — the constructor form of the same thing.
- `Proxy`, `Reflect`: `STA1106` — every property access becomes an opaque trap call.
- Prototype mutation (`Object.setPrototypeOf`, `__proto__` writes): `STA1107` — shapes are fixed at compile time.
- `delete` on a class field: `STA1108` — class instances are C structs with a fixed layout.
- `var` declarations: `STA1104` — function scoping, hoisting, and `undefined` initialization; use `let`/`const`.
- `arguments` object: `STA1105` — use rest parameters.
- `with`: `STA1109`, CommonJS `require()`: `STA1110`, `.jsx`/`.tsx`: `STA1111` — these apply in **both** modes, not just `ts`.
- Untyped catch bindings: `STA1003` — the implicit-`any` rule; annotate the parameter `unknown` (or `Error`) and narrow.

**Not on this list:** `Symbol` and `BigInt`. They are *deferred*, not rejected — `STA1212` and
`STA1213`, both Phase 5 (`docs/SUBSET.md`). Nothing outside plan §1.1's closed list may be
described as permanently rejected, and `Symbol.iterator` in particular cannot be: `for`…`of`
over a typed iterable is a static, supported construct that depends on the protocol.

### Type soundness at boundaries

Inside checked `ts` code, types are trusted fully. At boundaries where typed and untyped code meet (e.g., imports from ambient declarations, JSON.parse results, FFI calls), types are narrowed by runtime checks:

- **`unknown` and unions:** The type checker forces narrowing via guards (`typeof`, `instanceof`, or type predicates) before code can use the value. Stator verifies the narrowing logic statically; the emitted code includes a runtime check that halts compilation if the narrowed type is violated at runtime (a bug in the caller, not Stator).
- **`JSON.parse`:** Returns type `unknown`; must be narrowed.
- **Ambient module declarations (`.d.ts`):** Types are trusted as declared; if they lie (e.g., a function signature in a `.d.ts` doesn't match the implementation), the runtime check at the call site may fail. Stator generates a safe boundary with a source location so the lie is caught immediately with precise feedback.

## 3. `js` mode

### Inputs

- **Files:** Any mix of `.ts` and `.js` (and `.jsx`, `.tsx` in Phase 2+). ESM only; always strict (ESM enforces strict mode).
- **Module format:** ESM enforced by the pipeline (not configurable).

### Typing rules

- **`.ts` files:** The full static treatment (strict, implicit `any` is an error, `as any` is an error, unresolved types are errors). `.ts` is an **assertion** that the code is statically typeable.
- **`.js` files:** Treated as `allowJs: true` + `checkJs: true` (TypeScript's JavaScript inference mode).
  - Function parameters without JSDoc `@param` annotations are untyped; they lower to `Unknown` (the dynamic representation).
  - Return types without JSDoc `@returns` are inferred from return statements; if inference fails, the return type is `Unknown`.
  - JSDoc annotations are trusted and checked at runtime (see "Mixed-graph boundaries" below).
  - Untyped object literals `{ a: 1, b: "x" }` are inferred as `{ a: number, b: string }`; if inference is impossible (e.g., `{ [someVariable]: value }`), the object lowers to a dynamic shape table.
  - Array literals without type hints are inferred element-wise; heterogeneous arrays (e.g., `[1, "x", true]`) are allowed and lower to `Unknown[]`.
  - Untyped variables are inferred from initial assignment; if no assignment, the type is `Unknown`.

- **`any` in `.js` files:** Allowed. The type `any` is a no-op in `js` mode; it downgrades to the dynamic representation (same as `Unknown`). No error.
- **Unresolved identifiers in `.js` files:** Not an error; the identifier is assumed to be a runtime global or dynamic property and lowers to `Unknown`.

### Which checker diagnostics are fatal

`checkJs` runs the full checker over `.js` files, and its diagnostics surface as `STA0012`. In
`js` mode they split three ways (plan-notes 297):

- **Always fatal:** every syntactic diagnostic, and every JavaScript **early error** — the
  binder and grammar groups of TypeScript's own `plainJSErrors` list, the codes `tsc` reports
  for a `.js` file even without `checkJs` (`let x; let x;`, `with`, `break` outside a loop, …).
  A program carrying one is not JavaScript; Node refuses it before running a line. No code may
  name one of these in the js-mode list below, and `tests/unit/js-early-errors.test.ts` reads
  the list out of the pinned `typescript` to hold that.
- **Degraded to the dynamic path:** a type-level refusal of JavaScript Node runs, listed in
  `JS_MODE_RUNTIME_CODES` (`src/frontend/program.ts`) together with its run-time answer — a
  widened binding, a dynamic read, a runtime throw. Examples: a possibly-`undefined` read
  (TS2532), `"" == 0` (TS2367), a namespace IIFE reassigning a function declaration's binding
  (TS2630; a named function expression's own name is immutable and stays fatal), a spread the
  checker narrowed to `never` (TS2698).
- **Fatal until listed:** every other type-level refusal. The lowering trusts JSDoc types and
  the checker's control flow, so dropping a refusal it has no answer for compiles to an internal
  error at best and to a silent miscompile at worst (`const c = 1; c = 2` printed `2` where Node
  throws a `TypeError`). A code moves to the degraded list with its answer and a test.

### JS-only constructs that compile

- **`var` declarations:** Function scoping, hoisting, and `undefined` initialization are honored by lowering to a dynamic representation with explicit scope tracking. Hoisting is visible (assignment without declaration before use initializes to `undefined`).
- **`==` and `!=` operators:** Full ToPrimitive coercion (ES5 spec) on the dynamic path. When both operands are typed, the typed comparison is used; when either is `Unknown`, a dynamic comparison is emitted.
- **Untyped object literals:** Heterogeneous properties, computed property names, and getters/setters compile via dynamic shape tables and inline caches.
- **Function `arguments` object:** Compiled to an `Unknown[]` that mirrors the actual arguments at runtime.
- **`new.target`:** Accessible as `Unknown`.
- **`this` binding in untyped functions:** `this` is `Unknown` unless a type annotation provides it.

### Not yet (Phase 8)

- `eval`, `new Function`: `STA1206` — both land with the interpreter tier, so they share one code.
- `Proxy`: `STA1203`. Prototype mutation: `STA1204`. `delete` on a class field: `STA1205`.

These are the same five constructs `ts` mode rejects permanently, which is the clearest
illustration of what a mode is: identical code, identical pipeline below the gate, different
policy. In `ts` mode the answer is "no"; in `js` mode it is "not until Phase 8."

### Mixed-mode type narrowing in `.js`

When a value flows from untyped or loosely-typed `.js` into strictly-typed `.ts`, a runtime boundary check enforces the declared type:

```javascript
// util.js (untyped)
export function getValue() {
  return 42 || "fallback";  // inferred as unknown (heterogeneous)
}
```

```typescript
// main.ts (typed)
import { getValue } from "./util.js";

const x: number = getValue();  // type error at narrowing, not import
// Emitted code: runtime_check(x, "number"), halt if mismatch
```

## 4. Mixed-graph boundaries

When a value flows from a `.js` module (untyped or partially typed) into `.ts` code (strictly typed), Stator inserts a runtime type check at the import site or use site. The check is deterministic and pinpointed to the source location of the lie.

### Boundary-check examples

**Example 1: a value the checker cannot see, narrowed in `.ts`**

```javascript
// math.js
/**
 * @param {number} x
 * @returns {number}
 */
export function double(x) {
  return x * 2;
}

/** No annotation, so `settings` is `any` and so is everything read out of it. */
export function factorFrom(settings) {
  return settings.factor;
}
```

```typescript
// main.ts
import { double, factorFrom } from "./math.js";

const factor: number = factorFrom(JSON.parse(raw));  // Type-checks: `any` narrows to `number`
// Emitted: check(factorFrom(...), "number") → STA2001 runtime error:
//   "type error at main.ts:3:24: expected number, got string"
console.log(double(factor));
```

The JSDoc on `double` is not what needs checking, and cannot be: `checkJs` verifies it against the
body and Stator makes that verdict fatal, so `double("5")` is a **compile** error (`STA0012 [js]
Argument of type 'string' is not assignable to parameter of type 'number'`) rather than a runtime
one — measured 2026-09-01, plan-notes 140. What no checker can see is the value `factorFrom`
actually answers, and narrowing it to `number` is where the boundary check goes.

**Example 2: inferred `number` from untyped `.js` is already a number**

```javascript
// config.js
export const MAX_RETRIES = 3;
```

```typescript
// app.ts
import { MAX_RETRIES } from "./config.js";

const retries: number = MAX_RETRIES;  // no check: the checker inferred `number`
// `const retries: string = MAX_RETRIES` is checked: check(MAX_RETRIES, "string") → STA2001
```

When the checker's inferred type and the `.ts` annotation disagree (`TS2322`), `ts` mode refuses
the program (`STA0012`). `js` mode does not: it suppresses `TS2322` because in a `.js` file the
disagreement is ordinary JavaScript (`let x = 1; x = 'a'` widens `x` to a dynamic binding). A
`.ts` variable annotated `number`, `string` or `boolean` is not widened. Its annotation stays,
and every declaration or assignment whose value has another type gets a check. A value that
matches passes. One that does not fails with `STA2001` at the narrowing point (plan-notes 301):

```javascript
// lib.js
export function pick(wantNumber) { return wantNumber ? 1 : "one"; }  // inferred 1 | "one"
export function label(x) { return `${x}`; }                          // inferred string
```

```typescript
// main.ts
import { label, pick } from "./lib.js";

const n: number = pick(true);  // check(pick(true), "number") passes
const s: number = label(10);   // check(label(10), "number") → STA2001
```

An annotation no tag settles (an object type or a union) still widens the binding to the dynamic
path, the way a `.js` binding does.

The call and return edges follow the same rule (plan-notes 307). An argument the checker refuses
for a parameter (`TS2345`), or a returned value it refuses for the function's return type (`TS2322`
on a `return` or an arrow's concise body), is suppressed in `js` mode and checked when a TypeScript
file annotated that parameter or return. Function, method and constructor parameters all count;
async functions and generators do not, since their annotation is a `Promise` or a generator, not
the returned value's type:

```typescript
// main.ts
import { label, pick } from "./lib.js";

function inc(x: number): number { return x + 1; }
function first(): number { return pick(true); }  // check(pick(true), "number") passes
const h = (): number => label(4);                // check(label(4), "number") → STA2001

inc(pick(true));  // check(pick(true), "number") passes
inc(label(1));    // check(label(1), "number") → STA2001, `inc` never runs
```

A callee declared in a `.js` file (or described by a `.d.ts`) keeps Node's coercion: its JSDoc is
not a TypeScript annotation, so `increment("2")` against `/** @param {number} value */` still
prints `21`, as Node does (golden `js/argument_mismatch`).

A check appears only when the imported value is still Unknown:

```javascript
export function retriesFrom(settings) {
  return settings.n;
}
```

```typescript
const retries: number = retriesFrom({});  // check(retriesFrom(...), "number")
```

**Example 3: Heterogeneous array from .js**

```javascript
// data.js
export const items = [1, "two", true];  // Inferred as unknown[]
```

```typescript
// consumer.ts
import { items } from "./data.js";

const nums: number[] = items;
// `number[]` is not a tag the runtime can settle in constant time, so this assignment
// is NOT wrapped (docs/HIR.md §3.2.1). Element reads stay on the dynamic path until a
// checkable narrowing (`as number`, `typeof`) at the use.
```

### Typing contract at boundaries

- A value type-checked at a boundary is checked exactly once (at import or use).
- If the check passes, the value is trusted downstream without further checks.
- A check failure is a **runtime** error (`STA2001`) carrying the source location of the narrowing point — never silent undefined behavior, and never memory corruption. It has to be a runtime error: the whole reason a boundary exists is that the value's real type is unknowable at compile time (plan §0.2). What is guaranteed statically is that the check *is emitted*, and that every place one is needed is visible in the source (an import, an assignment, or an `as` cast Stator audits).

## 5. Mode mechanics

### Mode selection

The `--mode=ts|js` flag (default `ts`) determines the mode. No inference magic: a `.js` file under default `ts` mode is always `STA1002` (error), never a silent mode switch. The entry point's extension does not dictate the mode.

```bash
stator build app.ts -o app                # ts mode (default)
stator build app.ts -o app --mode=js      # js mode; .ts files in .ts mode rules
stator build app.js -o app --mode=js      # js mode; .js files allowed
stator build app.js -o app                # ERROR: STA1002 (.js in ts mode)
```

### Diagnostic format

Every diagnostic carries three parts: **source span**, **stable STA code**, **mode**, and **message**.

**Human format (stdout/stderr):**

```
file.ts:10:5 STA1001 [ts] explicit 'any' is not allowed in ts mode; use 'unknown' instead
```

Structure: `path:line:col STA#### [mode] message`

- `path:line:col` — source location, 1-indexed in both axes (matches `tsc`, `clang`, and editor gutters)
- `STA####` — stable diagnostic code (4 digits), never reused or renumbered
- `[mode]` — the active mode (`[ts]` or `[js]`)
- `message` — human-readable, actionable

**JSON format (`--diagnostics=json`):**

```json
{
  "diagnostics": [
    {
      "file": "file.ts",
      "line": 10,
      "column": 5,
      "code": "STA1001",
      "mode": "ts",
      "message": "explicit 'any' is not allowed in ts mode; use 'unknown' instead",
      "severity": "error"
    }
  ]
}
```

- `severity` — one of `"error"`, `"warning"` (warnings in Phase 2+)
- All codes must be stable; tests reference them

### Module init and top-level await

Stator merges the program into one module in Task 3.11's topological order (dependencies first, entry last) and evaluates that body as a single unit. When the body contains a top-level `await`, that unit is async: `main` starts it and drains the microtask queue until it settles.

Node's ESM loader may **interleave sibling subgraphs** — two modules that do not import each other can both run their prefix, hit `await`, and continue in registration order. Stator does not. A dependency's top-level await runs to completion before the next file in topological order begins. The difference is observable only in sibling interleavings; a linear import chain matches Node. Mirroring Node would need per-file init promises and a scheduler, which the whole-program merge does not have.

## 6. `stator explain` — what the compiler will do with a program

`explain` runs the build's front half — program, gate, module graph, lowering — and stops before
codegen. It reports one **file verdict** for the whole module graph, the diagnostics that decided
it, and, when the program lowers, one row per compiled function. Source:
`packages/compiler/src/cli/explain.ts`. A rejected program still exits 0: the verdict is the answer.

### Usage

```bash
stator explain file.ts                   # human-readable
stator explain file.js --mode=js         # js mode
stator explain file.ts --json            # one JSON object on stdout (never through ink)
```

### Verdicts

| Verdict | Meaning |
| --- | --- |
| `error` | a `never`-class diagnostic (rejected by design), or an `error`/`internal` one |
| `not-yet` | a `STA12xx` diagnostic: outside today's subset, scheduled |
| `dynamic` | compiles; some value anywhere in the graph — signature or body — is Unknown |
| `static` | compiles fully typed |

Precedence when one stage reports several classes: `never` > `not-yet` > `error`/`internal`. The
first stage that reports a deciding diagnostic ends the run, so a later stage's diagnostics are
never in the report — the program stage and the gate decide together, then the module graph, then
lowering.

### JSON schema (`--json`)

| Field | Present | Content |
| --- | --- | --- |
| `verdict` | always | one of the four verdicts |
| `code` | exactly when `verdict` is `error` or `not-yet` | the deciding diagnostic's code — the first of the highest-precedence class |
| `diagnostics` | exactly when `code` is | **every** diagnostic of the deciding stage, in source order (file, line, column): `{ file, line, column, code, mode, message }` (plan-notes 291) |
| `functions` | when the program lowered | `{ name, line, provenance, verdict }` per compiled function, in source order; `provenance` is `typed`, `inferred` or `dynamic`, `verdict` is `static` or `dynamic` |
| `externCalls` | when the program makes an extern call | `{ name, line }` per call — the unchecked boundaries (`docs/FFI.md` §5) |

Optional fields are **omitted**, never `null` or empty, so a report carries only what applies.
Consumers key on `verdict` and `code`, never on `message` (`docs/DIAGNOSTICS.md`).
`packages/tests/subset/run.ts` reads only `verdict` and `code`: a decision fixture isolates one
construct, so the file verdict *is* that construct's verdict.

**Why `diagnostics` lists them all.** One code says a file fails; it does not say how far the file
is from compiling. Sizing a large input — Phase 11's `_tsc.js` (§11c T11.4) — is a tally of codes,
and the human output prints that tally first.

**Per-function rows describe signatures.** A row is `static` when the function's signature is
typed; the file verdict still counts every Unknown in every body, so a `dynamic` file over
all-`static` rows is a body-level dynamic site, not a contradiction.

### Human output

The file line, then — when more than one diagnostic decided — a count per code, most frequent
first, then every diagnostic in the build's rendering (`file:line:col CODE [mode] message`), then
the function rows and the unchecked boundaries.

### Worked example: `ts` mode, rejected

```typescript
function unsafe(data: any) {
  return data.x;
}
const other: any = 1;
console.log(unsafe({ x: 1 }), other);
```

```
unsafe.ts: error (STA1001)
  STA1001 x2
  unsafe.ts:1:17 STA1001 [ts] explicit 'any' is not allowed in ts mode; use 'unknown' instead
  unsafe.ts:4:7 STA1001 [ts] explicit 'any' is not allowed in ts mode; use 'unknown' instead
```

```json
{"verdict":"error","code":"STA1001","diagnostics":[
  {"file":"unsafe.ts","line":1,"column":17,"code":"STA1001","mode":"ts","message":"explicit 'any' is not allowed in ts mode; use 'unknown' instead"},
  {"file":"unsafe.ts","line":4,"column":7,"code":"STA1001","mode":"ts","message":"explicit 'any' is not allowed in ts mode; use 'unknown' instead"}]}
```

(`file` is the absolute path the program loaded; shortened here.)

### Worked example: `ts` mode, compiles

```typescript
function add(a: number, b: number): number {
  return a + b;
}

const parsed: unknown = JSON.parse('2');
const n = typeof parsed === 'number' ? parsed : 0;
console.log(add(1, n));
```

```
example.ts: dynamic
  1: add: static (typed)
```

```json
{"verdict":"dynamic","functions":[{"name":"add","line":1,"provenance":"typed","verdict":"static"}]}
```

`JSON.parse` is a boundary in both modes (plan §1.1), so `parsed` is tagged and the file is
`dynamic`; `add`'s signature is typed, so its row is `static`.

### Worked example: `js` mode

```javascript
/** @param {number} a @param {number} b @returns {number} */
function add(a, b) {
  return a + b;
}

function pluck(record) {
  return record.x;
}

console.log(add(1, 2), pluck({ x: 3 }));
```

```
example.js: dynamic
  2: add: static (typed)
  6: pluck: dynamic (dynamic)
```

```json
{"verdict":"dynamic","functions":[{"name":"add","line":2,"provenance":"typed","verdict":"static"},{"name":"pluck","line":6,"provenance":"dynamic","verdict":"dynamic"}]}
```

Untyped `pluck` is not an error in `js` mode — it compiles through the dynamic representation.

### Planned: `--node` (Phase 11)

`--node` (plan §11c T11.5) is a platform flag, orthogonal to `--mode`, and `explain` accepts it
like `build` does. Under it, a `node:*` or Node-global member that `packages/node` has not landed
yet is a `not-yet` diagnostic naming T11.6, so `diagnostics` lists the platform gaps the same way
it lists the language ones, and `docs/NODE.md` is the coverage the two must agree with. Until
T11.5 lands, `--node` is an unknown flag (`STA0005`).

## 7. One pipeline, one gate

The pipeline is uniform:

1. **Frontend gate** (mode-aware): parse + typecheck (via `typescript` API) → mode policy (file acceptance, diagnostic table, unresolved type handling)
2. **Typed HIR** (mode-agnostic): lowering (`ts.Type` → `HType`), verifier
3. **Passes** (mode-agnostic): monomorphize, boundary-insert, const-fold, DCE, inline
4. **Codegen** (mode-agnostic): C emitter + runtime library → machine code

**Mode touches only:**

- **File acceptance:** `.ts` only (mode `ts`), or any mix `.ts` + `.js` (mode `js`)
- **Diagnostic table:** Different error codes and constraints per mode (table in §5)
- **Unresolved type handling:** Error in `ts` mode; lower to `Unknown` in `js` mode

**Below the gate (lowering, passes, codegen, runtime):** No reference to the mode. If any pass reads `mode` or branches on it, the design is wrong. Mode is baked into the typed HIR or lowered to `Unknown` by the frontend gate.

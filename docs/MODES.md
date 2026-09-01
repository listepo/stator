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

**Example 2: Inferred type from untyped .js**

```javascript
// config.js
export const MAX_RETRIES = 3;
```

```typescript
// app.ts
import { MAX_RETRIES } from "./config.js";

const retries: string = MAX_RETRIES;  // Type-checks: inferred number from assignment
// Emitted: assignment checks the type; retries can be a string only if Stator
// failed to infer MAX_RETRIES's type. If inference succeeds (number), this is STA2001 at runtime.
```

**Example 3: Heterogeneous array from .js**

```javascript
// data.js
export const items = [1, "two", true];  // Inferred as unknown[]
```

```typescript
// consumer.ts
import { items } from "./data.js";

const nums: number[] = items;  // Type-checks against unknown[]
// Emitted: check(items[i], "number") for each element access,
//   halt with STA2001 if type mismatch
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

## 6. `stator explain` — per-construct verdict reporter

The `explain` command analyzes a source file and reports the verdict for each top-level construct (function, class, const, etc.). It shows what would happen if that construct were compiled: static (compiles to unboxed machine code), dynamic (uses the dynamic representation), error (rejected), or not-yet (deferred to a later phase).

### Usage

```bash
stator explain file.ts                   # human-readable
stator explain file.ts --mode=js         # js mode
stator explain file.ts --json            # JSON output
```

### Output schema (human)

```
file.ts: construct verdict [code]

const PI = 3.14159                        # static
function add(a: number, b: number)        # static
function unsafe(data)                     # STA1003 (implicit any in ts mode)
const config = JSON.parse(...)            # dynamic (a boundary value stays tagged until narrowed)
eval("x + 1")                             # STA1101 (eval in ts mode)
```

### Output schema (JSON `--json` flag)

The document carries **both** a per-construct array (what a human audits) and a file-level
rollup (what a decision test asserts). One object, two readers:

```json
{
  "file": "example.ts",
  "mode": "ts",
  "verdict": "error",
  "code": "STA1003",
  "constructs": [
    {
      "construct": "PI",
      "kind": "const",
      "span": { "line": 1, "column": 1, "endLine": 1, "endColumn": 23 },
      "verdict": "static"
    },
    {
      "construct": "add",
      "kind": "function",
      "span": { "line": 3, "column": 1, "endLine": 5, "endColumn": 2 },
      "verdict": "static"
    },
    {
      "construct": "unsafe",
      "kind": "function",
      "span": { "line": 7, "column": 1, "endLine": 9, "endColumn": 2 },
      "verdict": "error",
      "code": "STA1003"
    }
  ]
}
```

**Rollup rule.** The top-level `verdict` is the most severe verdict in `constructs`, ordered:

```
error  >  not-yet  >  dynamic  >  static
```

`code` is the code of the first construct (in source order) carrying that most-severe verdict,
and is present exactly when the rollup verdict is `error` or `not-yet`. An empty `constructs`
array rolls up to `static` with no `code`. `code` is **omitted**, never `null`, when absent —
`static` and `dynamic` entries carry no `code` key at all.

This is why the rule is a rollup and not "the first construct": a decision-test fixture isolates
one construct, so its rollup *is* that construct's verdict, while a real source file still
reports honestly at the top level that something in it failed.

Consumers:

- **`tests/subset/run.ts`** reads only the top-level `verdict` and optional `code`. Because
  each fixture isolates one construct, the rollup is exactly that construct's verdict.
- **Humans and tooling** read `constructs` to audit precisely what went dynamic, and where.

### Worked example: `ts` mode

**Input file (`example.ts`):**

```typescript
const PI = 3.14159;

function add(a: number, b: number): number {
  return a + b;
}

function unsafe(data) {  // implicit any — error
  return data.x;
}

const result = JSON.parse('{"x": 1}');  // unknown, must be narrowed
type Result = typeof result;

const narrowed: number = result?.x ?? 0;  // narrowing with optional chain
```

**Human output:**

```
example.ts:1:1  static  const PI
example.ts:3:1  static  function add
example.ts:7:1  STA1003 [ts] function unsafe (implicit 'any' in parameter 'data')
example.ts:11:1 dynamic const result (JSON.parse is boundary-checked, always)
example.ts:12:1 static  type Result (erased)
example.ts:14:1 dynamic const narrowed (narrowing a boundary value inserts a runtime check)
```

`result` and `narrowed` are **dynamic**, not static: `JSON.parse` is a boundary in both modes
(plan §1.1, `docs/SUBSET.md`), so its value is tagged and every narrowing of it is a runtime
check. Being annotated `: number` does not make it static — that annotation is the *claim* the
check enforces.

**JSON output:**

```json
{
  "file": "example.ts",
  "mode": "ts",
  "verdict": "error",
  "code": "STA1003",
  "constructs": [
    { "construct": "PI", "kind": "const",
      "span": { "line": 1, "column": 1, "endLine": 1, "endColumn": 20 },
      "verdict": "static" },
    { "construct": "add", "kind": "function",
      "span": { "line": 3, "column": 1, "endLine": 5, "endColumn": 2 },
      "verdict": "static" },
    { "construct": "unsafe", "kind": "function",
      "span": { "line": 7, "column": 1, "endLine": 9, "endColumn": 2 },
      "verdict": "error", "code": "STA1003" },
    { "construct": "result", "kind": "const",
      "span": { "line": 11, "column": 1, "endLine": 11, "endColumn": 39 },
      "verdict": "dynamic" },
    { "construct": "Result", "kind": "type-alias",
      "span": { "line": 12, "column": 1, "endLine": 12, "endColumn": 31 },
      "verdict": "static" },
    { "construct": "narrowed", "kind": "const",
      "span": { "line": 14, "column": 1, "endLine": 14, "endColumn": 42 },
      "verdict": "dynamic" }
  ]
}
```

The rollup is `error` / `STA1003`: one construct failed, so the file failed, and the top-level
code names the first (in source order) most-severe construct.

### Worked example: `js` mode

**Input file (`example.js`):**

```javascript
const PI = 3.14159;

/** @param {number} a @param {number} b @returns {number} */
function add(a, b) {
  return a + b;
}

function pluck(record) {
  return record.x;  // untyped in js mode: no error, just dynamic
}

export const config = JSON.parse('{"debug": true}');
```

**Human output:**

```
example.js:1:1  static  const PI
example.js:4:1  static  function add (JSDoc supplies both parameter types and the return type)
example.js:8:1  dynamic function pluck (parameter 'record' is untyped, so it lowers to Unknown)
example.js:12:1 dynamic const config (JSON.parse is a boundary in both modes)
```

**JSON output:**

```json
{
  "file": "example.js",
  "mode": "js",
  "verdict": "dynamic",
  "constructs": [
    { "construct": "PI", "kind": "const",
      "span": { "line": 1, "column": 1, "endLine": 1, "endColumn": 20 },
      "verdict": "static" },
    { "construct": "add", "kind": "function",
      "span": { "line": 4, "column": 1, "endLine": 6, "endColumn": 2 },
      "verdict": "static" },
    { "construct": "pluck", "kind": "function",
      "span": { "line": 8, "column": 1, "endLine": 10, "endColumn": 2 },
      "verdict": "dynamic" },
    { "construct": "config", "kind": "const",
      "span": { "line": 12, "column": 1, "endLine": 12, "endColumn": 51 },
      "verdict": "dynamic" }
  ]
}
```

Two things this example is here to show. First, no `code` key anywhere: nothing failed, so the
rollup is the most severe verdict present — `dynamic` — and codes only accompany `error` and
`not-yet`. Second, `pluck` is the whole difference between the modes. The identical function in
`ts` mode is `STA1003` (implicit `any`); here it simply compiles on the dynamic path, and
`add` next to it stays static because JSDoc gave the checker enough to work with. That is what
"untyped means dynamic, not rejected" means in practice.

### Resolved: per-construct array *and* a file-level rollup

An earlier draft of this document flagged a contradiction: plan.md §1.3 and AGENTS.md promise
*per-construct* verdicts, while `tests/subset/run.ts` reads a *single* top-level verdict.

**Resolution (2026-08-29, recorded in `plan-notes.md`):** emit both, as specified above. The
per-construct array is the primary artifact — dropping it would break the plan's stated purpose
for `explain`, which is letting a user audit what went dynamic. The top-level rollup is derived
from it by the severity rule, costs one pass over the array, and makes the decision-test runner
correct without weakening anything.

Rejected alternative: "single verdict per file only". It is simpler, but it contradicts plan
§1.3 and AGENTS.md, and it would leave a user unable to locate *which* construct went dynamic
in a file — the one question `explain` exists to answer.

No runner change was required: `tests/subset/run.ts` already reads exactly the top-level
`verdict` + optional `code` this schema guarantees.

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

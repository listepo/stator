# HIR — the typed intermediate representation

This document is **normative**. The Stator compiler produces and transforms one intermediate representation: a typed, structurally-scoped HIR with explicit type information on every node. Lower passes and the code generator speak HIR and nothing else; `ts.Type` never leaks past the frontend gate (`src/frontend/`).

Per plan.md §6 Task 3.1, this document is read before implementing any phase beyond the skeleton; where this document and the code disagree, this file is right and the code is a bug.

## Table of contents

1. [Shape of the IR](#1-shape-of-the-ir)
2. [The HType lattice](#2-the-htype-lattice)
3. [Unknown is first-class](#3-unknown-is-first-class)
4. [TypeScript types map to HType](#4-typescript-types-map-to-htype)
5. [The HIR verifier](#5-the-hir-verifier)

---

## 1. Shape of the IR

The HIR is **structured control flow, not SSA**. Every node has an explicit `HType` and a source `Span`. Expressions and statements are separate unions—statements are not expressions.

### 1.1 Why structured, not SSA?

The compiler emits C, and C has its own `if`/`while`/`goto` control structures. An SSA form would need to be lowered back to structured control flow to emit C correctly. The cost—constructing SSA, then un-SSA'ing it—is paid twice with no optimization benefit when the target is a structured language. Keeping the IR structured from the start means C emission is **the identity transformation on control flow**: an `if-statement` HIR node becomes an `if()` in C directly.

### 1.2 Span — source location

Every node carries a `Span`:

```typescript
interface Span {
  readonly start: number;        // 0-indexed UTF-16 offset
  readonly length: number;       // span length in UTF-16 units
  readonly line: number;         // 1-indexed line for #line directives
}
```

These are UTF-16 offsets because the TypeScript API uses them; the frontend copies them directly from `ts.Node` without conversion. The `line` field is 1-indexed and is computed once during lowering—the emitter never has to recompute it from source text, so source never leaks below the frontend.

### 1.3 Expressions and statements

Expressions produce values; statements do not. An expression-statement wraps an expression and discards its value.

**Expression union** (current scope):
- `NumberLiteral` — a numeric value
- `StringLiteral` — a string value
- `BooleanLiteral` — `true` or `false`
- `NullLiteral` — `null`
- `UndefinedLiteral` — `undefined`. Not a keyword but a global binding, so the lowering resolves it through the binding table first: a local named `undefined` shadows it, exactly as at runtime
- `Identifier` — reference to a binding
- `BinaryOp` — the nineteen operators whose operands are **both** evaluated, exactly once, left to right: `+ - * / %`, `< > <= >=`, `=== !== == !=`, `& | ^ << >> >>>`
- `UnaryOp` — prefix `-`, `+`, `!`, `~`
- `LogicalOp` — `&&`, `||`, `??`
- `TemplateLiteral` — `` `a${x}b` ``, as `quasis` and `expressions` with the invariant `quasis.length === expressions.length + 1`
- `StringLength` — `.length` on a string, in **UTF-16 code units** (an astral character counts twice)
- `ConsoleLogCall` — builtin call to `console.log`
- `FunctionExpr` — a function expression or arrow function; `params`, a `body` Block, and an
  optional `name` (a declaration's name, or the binding a function expression is assigned to, so
  `[Function: name]` survives to the runtime)
- `CallExpr` — a call to an arbitrary callee expression

`TemplateLiteral` is a node rather than sugar for `+`, and this is the same kind of decision as
`LogicalOp` below. The two agree on every primitive and diverge at objects: `` `${o}` `` is defined
as ToString, while `"" + o` runs ToPrimitive with hint *default* and therefore consults `valueOf`
**first**. Desugaring while only primitives exist would bake that difference in as a bug that first
appears when objects land, in code nobody is looking at any more.

`StringLength` is a dedicated node for the same reason `ConsoleLogCall` is: the subset admits
exactly one property, and giving it a node keeps the gate's accept set equal to this vocabulary.
The gate tests the *type* of the receiver, not the syntax — `arr.length` and `fn.length` are spelled
identically and neither is representable here. General property access arrives with the object model.

`LogicalOp` is deliberately **not** a `BinaryOp`, and the separation is load-bearing rather than
cosmetic. The two differ in both ways a compiler cares about: the right operand is evaluated
*conditionally*, and the result is one of the operands rather than a fresh value. `a && b` is not
`and(a, b)`; it is `let t = a; t ? b : t`. Folding it into `BinaryOp` would license any pass that
assumes "both children are evaluated" to hoist work out of a branch that may never run.

For the same reason the emitter gives each `LogicalOp` its own **frame slot** for the left
operand: the value is tested and then possibly returned, so evaluating it twice would duplicate
its side effects, and a value the GC cannot see is a value it can collect. Nested short-circuits
therefore need distinct slots — in `(a && b) && c` the outer operand stays live while the inner
one is evaluated.

**Statement union** (current scope):
- `Declaration` — `let` or `const` binding with required initializer
- `Assignment` — assignment to an existing binding
- `ExpressionStatement` — wraps an expression
- `IfStatement` — `if` (optionally with `else`)
- `WhileStatement` — `while` loop
- `DoWhileStatement` — `do`/`while`; the body runs before the first test
- `ForStatement` — C-style `for`; all three header slots optional, `init`/`update` are Statements
- `SwitchStatement` — a discriminant and clauses in **source order**, `default` included
- `BreakStatement` / `ContinueStatement` — optionally labelled
- `FunctionDeclaration` — a named function; the binding is established at the **top of its unit**,
  not where the statement appears, so `f(); function f() {}` works
- `ReturnStatement` — `return`, with an optional value
- `Block` — sequence of statements

Rung 5 added `ArrayLiteral`, `ArrayLength`, `IndexAccess` (a read), `IndexAssignment` (a write) and `ForOfStatement`.

Rung 6a added classes: `ClassDeclaration` (a statement, in source order — a class is in its temporal dead zone until its declaration is reached), `NewExpr`, `FieldAccess` (a read), `FieldAssignment` (a write) and `MethodCall`. Three decisions in that set are load-bearing:

- **There is no `this` node.** A constructor or method's `params` begins with a receiver under a name no source can spell, and `this` lowers to an ordinary `Identifier` reading it. That reduction is why methods needed no machinery of their own: they inherit the closure ABI, arity padding, capture analysis and the static-closure path unchanged, and an arrow inside a method that closes over `this` is just an arrow capturing a parameter.
- **`FieldAccess` and `FieldAssignment` store a `slot`, resolved once during lowering.** The point is not speed — the emitter could recompute it — but *checkability*: a recomputed index is correct by construction and therefore unfalsifiable, while a stored one is verified against the layout it claims to index (`STA4046`).
- **A method has no slot and is not in `HObject.fields`.** One function is shared by every instance, so `MethodCall` names the class and the emitter makes a direct call, rather than every object carrying one closure per method.

Future phases add: `for-in`, `try`/`catch`/`finally`, object literals, general property access, inheritance and `super`, and the rest.

A loop or switch carries its own optional `label`; there is no LabeledStatement wrapper. A label exists only to be named by `break`/`continue`, so it belongs to the thing being jumped out of, and a wrapper would sit between the jump and its target for no gain.

Three shapes here exist to stop the emitter from being clever:

- **`ForStatement.condition` is optional, not defaulted to `true`.** `for (;;)` has no test, and a synthesised literal would make "no test" and "a test that happens to be true" indistinguishable.
- **`SwitchClause.statements` is not a `Block`.** A clause opens no scope and falls through into the next one; a Block would imply both are false.
- **Clauses keep source order, `default` in place.** `default` is *tried* last but still falls through from whatever clause precedes it textually, so hoisting it changes which statements run.

`switch` does not lower to a C `switch`, and cannot: C requires integer constant cases, while JavaScript compares with **strict equality** against arbitrary expressions. It becomes a chain of tests plus `goto`s into clause labels laid out in source order — which delivers fall-through by simply not jumping.

Jumps are always `goto`, never C's `break`/`continue`, so that a `break` inside a `switch` inside a loop cannot be silently captured by the wrong construct. The emitter writes a label only where a `goto` targets it: the runtime builds with `-Wall -Wextra -Werror`, and an unused label is an error there.

**The invariant that governs every addition:** the gate's accept set (`src/frontend/gate.ts`) must equal this vocabulary *exactly*. A construct accepted above but unrepresentable below is not a missing feature — it is an `STA4xxx` internal error waiting to happen, the compiler blaming itself for source it chose to accept. Widening the HIR and widening the gate are the same change; make them in the same commit. This has been violated twice already (plan-notes 30 and 37), both times by constructs that reached the gate through a fast path rather than an explicit `case`.

### 1.4 Module root

A `Module` is the top-level container:

```typescript
interface Module {
  readonly kind: 'module';
  readonly fileName: string;      // absolute path, for #line directives
  readonly statements: readonly Statement[];
  readonly type: HType;           // usually undefined or the type of the last statement
}
```

---

## 2. The HType lattice

Stator's internal type model is small and structural. It is produced by exactly one module (`src/frontend/types.ts`) and is the only type vocabulary every pass and the emitter see.

### 2.1 Phase 2 types — the skeleton

The walking skeleton recognizes six kinds:

| Kind | Meaning | Example |
|---|---|---|
| `number` | 64-bit IEEE double (all numbers, all numeric literals) | `1`, `1.5`, `Infinity` |
| `string` | UTF-16 string | `"hello"`, `` `template` `` |
| `boolean` | logical truth value | `true`, `false` |
| `undefined` | absence of a value | `undefined`, return-less function |
| `null` | the null singleton | `null` |
| `unknown` | unknown type, unknowable statically | `any`, `unknown`, untyped variable in js mode |

Each is a singleton (except `unknown`, which carries a flag—see §3).

### 2.2 Phase 3+ types — planned

`fn(params, ret)` landed with rung 4, `array<T>` with rung 5, and `object` — a class instance: a name, fields in slot order, and method signatures — with rung 6a. `object` is compared **nominally**, unlike every other kind: two classes that declare the same fields are still two classes, which matches what the emitter allocated (one descriptor per declaration) and is also the only comparison that terminates, since `class C { self: C }` is a cyclic type.

The following kinds **do not yet exist** in the code and are mentioned here only to state the plan explicitly. Do not implement them early and do not describe them as if they work:

- **`i32`** — refinement of `number` to 32-bit integers (Phase 3 optimization; all arithmetic promotes overflows back to `number`)
- **`union<T1 | T2 | ...>`** — union of concrete types (replaces implicit unions via widening)
- **`generic-instance<G, [A1, A2, ...]>`** — a generic type applied to concrete arguments
- **`map/set` specializations** — typed `Map<K, V>` and `Set<T>` when keys/values are concrete

---

## 3. Unknown is first-class

`Unknown` is not an error state. It represents a type unknowable at compile time. In `ts` mode, `Unknown` from an implicit `any` is rejected at the gate; in `js` mode, `Unknown` is the dynamic path.

```typescript
interface HUnknown {
  readonly kind: 'unknown';
  readonly fromImplicitAny: boolean;  // gate-set flag
}
```

### 3.1 Where Unknown comes from

- Source `any` annotation (in `js` mode; in `ts` mode the gate rejects it first with `STA1001`)
- `unknown` type annotation
- Untyped code in `js` mode (inferred as `unknown`, not rejected)
- Union types that don't narrow (plans for Phase 3)
- `JSON.parse()` return value (always `unknown`)
- FFI boundary (`declare function` imports)
- `.js`→`.ts` imports (the imported value is runtime-typed, not statically typed)

### 3.2 The Unknown preservation rule

**This is the single most important rule in this document.** Every pass—const-fold, DCE, tree-shake, inline, any future optimization—must preserve `Unknown` exactly as it appears in the input. You may never:

- Elide a check on an `Unknown` value by proving it redundant
- Replace `Unknown` with a more specific type without a runtime check
- Propagate a type assumption across an `Unknown` boundary
- Constant-fold an operation whose operand is `Unknown`

**Why?** `Unknown` exists because the type is unknowable *at compile time*. If an optimizer "proves" it is redundant, it has proved something false: the source program has no type information to prove it. A boundary check is not optional; it is a **property of the type system itself** — the only way the compiled code can be correct when the type system has admitted we don't know the type.

**Invariant (enforced by the verifier):** Every value of type `Unknown` in the HIR must remain `Unknown` through lowering, optimization, and codegen. Codegen emits it as a tagged `jsrt_value` with a runtime check at every narrowing site.

### 3.3 Example

```typescript
// ts mode
const x: unknown = JSON.parse('1');  // type is unknown
const y = x + 1;                     // STA2001 boundary check at runtime: does x coerce to number?

// js mode
const x = JSON.parse('1');           // type is unknown (inferred)
const y = x + 1;                     // dynamic path: operator overload on jsrt_value
```

In both cases, `Unknown` is preserved; the difference is the route (explicit boundary check vs. dynamic operator).

---

## 4. TypeScript types map to HType

`src/frontend/types.ts` is the **only** module that maps `ts.Type` → `HType`. It is called once per expression/statement in the frontend, immediately after the type checker assigns a type. Nothing below the gate sees `ts.Type`.

### 4.1 The mapping algorithm

```typescript
export function tsTypeToHType(type: ts.Type): HType {
  const f = type.flags;

  // Primitives must match their LITERAL flag too.
  if (f & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) {
    return H_NUMBER;
  }
  if (f & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) {
    return H_STRING;
  }
  if (f & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) {
    return H_BOOLEAN;
  }
  // void is distinct in TypeScript but undefined at runtime.
  if (f & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
    return H_UNDEFINED;
  }
  if (f & ts.TypeFlags.Null) {
    return H_NULL;
  }

  // Both explicit and implicit `any` are Unknown.
  if (f & ts.TypeFlags.Any) {
    return hUnknown(true);  // conservative: set flag for gate to reject if implicit
  }

  // Everything Phase 2 cannot represent: union, array, function, etc.
  return hUnknown(false);
}
```

**Key invariant:** If the type checker produced a type, and this function returns `Unknown`, it is because Phase 2 has no representation for it. This is never a guess; `Unknown` here means the type is *representable but not yet implemented*.

### 4.2 Worked examples

Each example shows a TypeScript snippet, what `ts.Type` the checker produces, the resulting `HType`, and the reason.

#### Example 1: Number literal

**TypeScript:**
```typescript
const x = 1;
```

**`ts.Type`:** `Type { isNumberLiteral: true, value: 1 }` — the literal type `1`, not the general `number` type.

**`HType`:** `{ kind: 'number' }`

**Why:** `tsTypeToHType` checks `TypeFlags.Number | TypeFlags.NumberLiteral` and both match. **Critical detail from plan-notes #32:** TypeScript's `NumberLiteral` flag includes the general `Number` flag; we must check both and map them all to the single `number` HType. An early version mapped only the `NumberLiteral` flag and broke on bare `number` annotations. The `| TypeFlags.Number` part is the fix.

#### Example 2: String literal

**TypeScript:**
```typescript
const s = "hello";
```

**`ts.Type`:** `Type { isStringLiteral: true, value: "hello" }`

**`HType`:** `{ kind: 'string' }`

**Why:** Same as above; both `StringLiteral` and `String` flags are checked.

#### Example 3: Boolean literal type

**TypeScript:**
```typescript
const b: true = true;
```

**`ts.Type`:** `Type { isBooleanLiteral: true, value: true }` — the literal type `true`.

**`HType`:** `{ kind: 'boolean' }`

**Why:** `BooleanLiteral` and `Boolean` flags both match. The HIR has one `boolean` type; `true` and `false` are runtime values, not compile-time constants at the type level.

#### Example 4: Generic boolean type

**TypeScript:**
```typescript
let b: boolean;
b = true;
```

**`ts.Type`:** `Type { flags: TypeFlags.Boolean }` — the general `boolean` type, not a literal.

**`HType`:** `{ kind: 'boolean' }`

**Why:** The check `TypeFlags.Boolean` alone matches, same `HType`. All three — the literal type `true`, the literal type `false`, and the general `boolean` type — map to one `boolean` HType because the HIR tracks type, not specific values.

#### Example 5: The `void` keyword

**TypeScript:**
```typescript
function f(): void { }
```

**`ts.Type`:** `Type { flags: TypeFlags.Void }` — TypeScript's way of saying "no return value."

**`HType`:** `{ kind: 'undefined' }`

**Why:** `void` is a TypeScript compile-time concept meaning "you can ignore the return." At runtime, a function that doesn't return anything returns `undefined`. The HIR models *values*, not compile-time intent, so `void` and `undefined` are the same.

#### Example 6: Explicit `any` in js mode

**TypeScript (js mode):**
```typescript
const x: any = 1;
```

**`ts.Type`:** `Type { flags: TypeFlags.Any }`

**`HType`:** `{ kind: 'unknown', fromImplicitAny: true }`

**Why:** The check `TypeFlags.Any` matches. The `fromImplicitAny` flag is set `true` conservatively (see §4.1 comment). The gate later checks `isImplicitAny()` on the actual TS AST node; if it finds the annotation was explicit, the gate still keeps the flag set because:
1. `tsTypeToHType` does not have access to the AST, only the type.
2. The gate's job is to filter; the conservative flag makes the gate safe: if unsure, reject in `ts` mode.
3. In `js` mode, the flag is ignored; `Unknown` compiles as dynamic either way.

#### Example 7: Implicit `any` in ts mode

**TypeScript (ts mode):**
```typescript
let x;  // no initializer, no annotation
```

**`ts.Type`:** `Type { flags: TypeFlags.Any }` — inferred as `any` because nothing narrows it.

**`HType`:** `{ kind: 'unknown', fromImplicitAny: true }`

**Why:** Identical to example 6 at the type level. The gate calls `isImplicitAny(node, typeChecker)` on the actual `VariableDeclaration` node; if it returns `true`, the gate emits `STA1003` and the declaration is rejected in `ts` mode.

#### Example 8: Unknown type annotation (ts mode)

**TypeScript (ts mode):**
```typescript
const x: unknown = 1;
```

**`ts.Type`:** `Type { flags: TypeFlags.Unknown }` — the `unknown` keyword.

**`HType`:** `{ kind: 'unknown', fromImplicitAny: false }`

**Why:** TypeScript has two type flags for "don't know": `Any` (implicit or explicit `any`) and `Unknown` (the `unknown` keyword). We map both to `unknown` HType, but the `fromImplicitAny` flag is `true` only if `TypeFlags.Any` was set. Since `unknown` is an explicit annotation, the flag is `false`, and the gate does not reject it in `ts` mode—`unknown` is the approved way to say "I don't know the type."

#### Example 9: Union type

**TypeScript:**
```typescript
const x: number | string = 1;
```

**`ts.Type`:** `Type { flags: TypeFlags.Union, types: [Type{Number}, Type{String}] }` — a union of two types.

**`HType`:** `{ kind: 'unknown', fromImplicitAny: false }`

**Why:** Phase 2 has no `union` HType. The union exists in the type system but not in the HIR. When the lowering sees this, it must insert a runtime check (boundary-check insertion, Phase 3 Task 3.5) to narrow the union before using the value. Until then, it is `Unknown`, which triggers:
- In `ts` mode: the gate rejects it as unsupported (STA1214, "not yet").
- In `js` mode: it is the dynamic path.

#### Example 10: Function type

**TypeScript:**
```typescript
const f: (x: number) => string = ...;
```

**`ts.Type`:** `Type { flags: TypeFlags.Object, objectFlags: ObjectFlags.ClassOrInterface, ... }` — internally represents function types as interface-like objects.

**`HType`:** `{ kind: 'unknown', fromImplicitAny: false }`

**Why:** Phase 2 has no `fn` HType. Functions arrive in Phase 3. The gate rejects this as not-yet (STA1214).

#### Example 11: Array type

**TypeScript:**
```typescript
const arr: number[] = [1, 2];
```

**`ts.Type`:** `Type { flags: TypeFlags.Object, ... }` — arrays are objects with special properties.

**`HType`:** `{ kind: 'unknown', fromImplicitAny: false }`

**Why:** implemented in Phase 3 Task 3.3 rung 5. `checker.isArrayType` maps `T[]` and `Array<T>` to `HArray`; a TUPLE is deliberately excluded, since it has a different type per position and `HArray` holds one element type for all of them.

#### Example 12: Enum (ts mode)

**TypeScript (ts mode):**
```typescript
enum Color { Red = 0, Green = 1 }
const c: Color = Color.Red;
```

**`ts.Type`:** `Type { flags: TypeFlags.Number | TypeFlags.Enum, ... }` — enums are number-like.

**`HType`:** `{ kind: 'unknown', fromImplicitAny: false }`

**Why:** Enums are **deliberately excluded**, even though `TypeFlags.NumberLike` includes them. The gate (via `gateConstruct`) rejects enum declarations outright with `STA1104` (a never code: `erasableSyntaxOnly` bans them, and the enum AST node never reaches lowering). If lowering did see one, mapping it to `number` would hide the gate's rejection. The `tsTypeToHType` function and lowering are not the gate's agents; they assume the gate has already filtered the input. **Envelope principle:** the gate's accept set must equal the HIR's vocabulary exactly.

---

## 5. The HIR verifier

The verifier is a post-transform invariant checker. It runs after every pass that modifies the HIR (lowering, const-folding, DCE, inline) to ensure the pass produced valid HIR.

### 5.1 What the verifier checks

Each check is a compiler invariant. If it fails, the compiler has contradicted itself—the gate accepted a construct and the pass produced invalid HIR for it.

**Type presence:** Every node has an `HType`. Missing `type` → `STA4020`.

**Binding scope:** Every `Identifier` reference refers to a binding declared before use. Using a name never declared → `STA4002`. Assigning to a name never declared → `STA4003`.

**Type agreement:** The type of each expression matches the operation that produced it:
- `NumberLiteral` must have type `number` → `STA4007`
- `StringLiteral` must have type `string` → `STA4008`
- `BooleanLiteral` must have type `boolean` → `STA4009`
- `Identifier` must have the type of the binding it refers to → `STA4010`
- Arithmetic operators (`+`, `-`, `*`, `/`, `%`) must have both operands of type `number` and result type `number` → `STA4011`, `STA4012`, `STA4013`
- Comparison operators (`<`, `>`, `<=`, `>=`) must have operands of matching type (number or string, not mixed) and result type `boolean` → `STA4014`, `STA4015`, `STA4016`
- Strict equality (`===`, `!==`) must have operands of matching type and result type `boolean` → `STA4017`, `STA4018`
- `console.log` call must have type `undefined` → `STA4019`

**Control flow:** `IfStatement` and `WhileStatement` conditions must have type `boolean` → `STA4005`, `STA4006`.

**Assignment compatibility:** An assignment's value type must match the target binding's type → `STA4004`.

### 5.2 Verifier output

The verifier returns a list of problems (not thrown exceptions). Each problem includes:
- `kind`: the HIR node kind (e.g., `'binary-op'`)
- `code`: the STA code (all codes in `STA4xxx`)
- `span`: the node's source location
- `message`: human-readable explanation

Example:
```
{
  kind: 'binary-op',
  code: 'STA4011',
  span: { start: 42, length: 1, line: 5 },
  message: 'arithmetic operand must be number, got string'
}
```

### 5.3 Verifier discipline

**When:** The verifier runs after:
- The initial lowering from TypeScript AST to HIR
- Every optimization pass (const-fold, DCE, inline) in debug builds
- For now, in all builds—Phase 3 optimization may add a flag to disable it in release builds if measurements show it is a bottleneck

**What counts as a verifier failure:** Always a compiler bug (`STA4xxx`), never a user error. The gate has already accepted the source and the lowering has already produced the HIR. A verifier failure means one of them violated an invariant—either the gate let through a construct it shouldn't have, or the pass produced invalid HIR. The verifier's job is to **catch bugs early**, before they cascade into wrong code.

**Envelope principle:** The invariant that holds the design together is simple:

> The set of constructs the gate accepts (`gateConstruct` in `src/frontend/gate.ts`) must equal the set of constructs the HIR can represent exactly. No more, no fewer.

If the gate accepts a construct but the HIR has no node type for it, lowering fails. If the HIR has a node type but the gate rejects it, the gate is wrong. A verifier problem always points to one of these disagreements.

---

## Notes

- **HIR stability:** The Phase 2 skeleton HIR (expressions, statements, control flow) is stable. Phases 3+ add new node kinds (arrays, objects, etc.) and new HType kinds (fn, array, object-shape, etc.). All existing nodes remain valid; new passes only have to handle new cases in their switch statements.

- **Scope and binding:** Phase 2 is expression-level and block-scoped only. Function scopes, function parameters, and closure capture arrive in Phase 3 Task 3.4.

- **Type narrowing:** Discriminated unions, type guards (`typeof`, `instanceof`), and pattern matching arrive in Phase 3 Task 3.5 (boundary-check insertion). Until then, `unknown` and unions stay wide.

- **Unknown is forever:** `Unknown` does not narrow during optimization. A type inference pass that "learns" a better type must emit a runtime check (boundary-check insertion) to validate it; without a check, `Unknown` stays.

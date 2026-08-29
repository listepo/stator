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
| Union types | dynamic (tagged; narrowing = runtime check) | dynamic | **Implemented (Task 3.5), by having no union at all.** The HType model has no union node, so `string \| number` IS `Unknown` — and narrowing one therefore lands on exactly the machinery an `unknown` already needed, with no separate feature. A union whose constituents all map to ONE HType is that type instead: `"a" \| "b"` is a `string`, which is what makes `typeof` usable (its own type is a union of eight string literals). Discriminated unions checking a discriminant TAG are still deferred — that needs a union the model can see the constituents of. |
| `unknown` type | dynamic (narrowing = runtime check) | dynamic | **Implemented (Task 3.5).** A narrowed read emits `jsrt_check_number/string/boolean`, which returns the value or raises `STA2001` with a `file:line:col`. The check is per USE, not per binding: nothing proves the value did not change between two reads. An UNnarrowed `unknown` gets no check — printing one asks nothing of it — and a narrowing to a type no tag settles in constant time (an object, an array, a signature) leaves the value `unknown` on the dynamic path rather than being refused. |
| `as` casts | dynamic (boundary-checked) | dynamic | **Implemented (Task 3.5).** A cast off an `unknown` to a checkable type emits `jsrt_check_*`. An identity cast and a widening to `unknown` assert nothing and lower to the operand alone. A cast to a type no tag settles is DROPPED rather than believed: the value stays `unknown` and every operation downstream stays on the dynamic path, which is sound and costs nothing that compiles today. The older `<T>x` spelling is not accepted — it is ambiguous with JSX and adds a second syntax for a construct that has one. |
| `JSON.parse()`, FFI returns | dynamic (boundary-checked, always) | dynamic | Deferred: `JSON` is a builtin (plan §7 Task 4.2) and FFI is Phase 6. The check machinery they need is the one `as` and narrowing already use. |
| Generic function declarations | static (monomorphized per concrete type tuple) | static, identically — a `.js` file cannot spell a type parameter, so a js-mode generic is a `.ts` file and gets the same specializations | Specialization happens AT the lowering, so no type parameter ever enters the HIR. Instantiations are shared by HType identity, which collapses literal types for free: `box(1)` and `box(2)` are one function. Depth is capped at 16 (STA2003) — `f<T>` calling `f<T[]>` has no fixed point. |
| Generic function used as a value, generic arrows, constrained or defaulted type parameters, explicit type arguments, generic classes | not-yet(STA1214) | not-yet(STA1214) | Each has no tuple to specialize on, or no declaration to lower a second time. A value has one identity and many instantiations; a constraint is a check the subset cannot make. |

---

## Objects & classes

| Feature | `ts` mode | `js` mode | Notes |
|---|---|---|---|
| Classes with fixed shape (no getters/setters) | static (fixed slot offsets) | static if fully typed, else dynamic | **Implemented (rung 6a).** An instance is one allocation: a pointer to a file-scope `JSRTClass` descriptor followed by its slots, with declaration order as slot order. A field read is an offset load, not a lookup. The slot list comes from the CHECKER's property list, not from the member nodes, which is why a `.js` class — whose fields are declared by `this.x = …` in the constructor and have no member node at all — gets the same layout with `unknown` field types. Methods occupy no slot: one function is shared by every instance and the call resolves at compile time to that class's method, so `o.m()` is a direct call with the receiver as argument zero. Statics, `#private`, inheritance, overriding, accessors and object literals have all landed on top of this layout — see the rows below, each of which says what it reduced to rather than what it added. |
| Classes with getters/setters | static (the accessor is a call; the fields keep their slots) | static if typed, else dynamic | **Implemented (rung 6b).** An accessor is a pair of METHODS under a name no source can spell — `get x`, `set x`, where the space does what the dot does for a static. So `o.x` is a call to `get x`, `o.x = v` is a call to `set x`, and the property occupies no slot, which is exactly what the property MEANS. The reduction is why accessors needed no HIR node, no verifier case and no emitter case: they inherit dispatch, the method table, arity padding and the receiver parameter unchanged, and `util.inspect` never prints them because there is no slot to print. This is a correction to what this row used to claim — an accessor does NOT force the class onto the dynamic path, and the other fields keep their fixed slots (plan-notes 69). Deferred: a compound assignment to an accessor (`o.x += 1` is a get and a set of one property, and what evaluates the receiver once across the pair hoists a slot), a static accessor (it belongs to the class object, which a plain binding is not), a `#private` or computed accessor name, and overriding an inherited accessor. |
| Class inheritance and `super(...)` | static (prefix layout; direct dispatch) | static if types are present, else dynamic | **Implemented (rung 6b).** A subclass's slots START with its base's, in the base's own slot order, so a base-typed read of a subclass instance lands on the right slot and a `Dog` is assignable wherever an `Animal` is declared. The slot list is rebuilt root-first from the chain — the checker lists a subclass's OWN properties first, which is the opposite of what a prefix layout needs — and a name an ancestor already claimed keeps the ancestor's slot, which is what makes a `.js` field assigned in both the base and the subclass one slot rather than two. `super(...)` is the base constructor run against the receiver this one was handed; a derived class that writes no constructor gets JavaScript's implicit `constructor(...args) { super(...args) }`, taking the nearest declared ancestor constructor's parameters. Field initializers run AFTER `super(...)`, so an initializer may read a field the base wrote. A method call names the class that DECLARES the method, so an inherited method is a direct call to the one function that exists. |
| Method overriding and `super.method()` | static (method-table dispatch) | static if types are present, else dynamic | **Implemented (rung 6b).** One name, one slot, a different entry per class: a subclass's method table BEGINS with its base's, in the base's order, so a slot resolved against a receiver's static type indexes the right method on every descendant. A call is virtual exactly where it has to be — the lowering asks the whole file whether any chain containing the receiver's class declares that method twice, so a method nothing overrides keeps rung 6a's direct call and costs nothing. `super.m()` is a call on the SAME receiver that skips the override, which is why it stays direct even where every other call to `m` is virtual; a virtual call there would find the override again and recur. The table lives in the class descriptor and its entries are file-scope closure constants, which is what forces the two deferrals: overriding inside a function (a method there may capture, and a captured environment is per evaluation, so there is no one table) and re-declaring a FIELD (a field is a slot, and two declarations of one slot have two initializers racing for it). `super.x` on a field is refused for the sharper version of that: `super.x` and `this.x` are the same slot. In `js` mode `noImplicitOverride` is off — it would demand a JSDoc `@override` tag on ordinary JavaScript — while `ts` mode keeps it, since there the modifier is real syntax and an accidental override is exactly what a table makes silent. |
| Static methods and static class members | static | static if typed, else dynamic | **Implemented (rung 6b).** A static belongs to the class object, not to any instance, so it is not a slot: it is ONE binding for the whole program, under a name no source can spell (`C.count` — the dot is what makes it unspellable, the same trick the receiver parameter plays with a leading space). That reduction is why statics needed no HIR node, no verifier case and no emitter case of their own — a static read is an identifier, a write is an assignment, and `C.m()` is an ordinary call. The binding is named by the DECLARING class, because statics are inherited: `Sub.count` and `Base.count` are the same static, and mangling by the receiver's spelling would make a write through one invisible through the other. The initializer runs where the class declaration sits, and forward references between statics work for the reason function declarations hoist. Deferred: a `static {}` initialization block, and `this` inside a static member — both need the class object this model does not build. |
| Private fields (class `#field` syntax) | static | static if typed, else dynamic | **Implemented (rung 6b).** A `#private` member is an ordinary member: `#count` takes a slot, `#step()` is a member function, `static #next` is a static binding. Privacy is not a layout property — the checker has already rejected every access from outside the class body, so nothing below the gate has to enforce it. The one place it survives is printing: `util.inspect` omits `#private` fields, so the runtime printer skips a descriptor field name that starts with `#`, and a class whose fields are ALL private prints as `C {}`. The `#` cannot collide with a public name because no public property may be spelled with one. Deferred: a subclass re-declaring an ancestor's `#private` name (two distinct slots that share a spelling, which a layout keyed by name cannot hold apart), and `#brand in o`, which asks whether an object carries the slot at all rather than reading it. |
| Object literals with static keys | static (fixed slot offsets) | static if all values are typed, else dynamic | **Implemented (rung 6b).** A literal is a CLASS whose declaration is a type: the shape comes from `checker.getTypeAtLocation`, and the entries the source wrote are its slots, in written order. That is the whole reduction — the same `JSRTClass` descriptor, the same allocation, the same offset load for `p.x`, and no HIR node beyond `ObjectLiteral` itself. Two literals with the same field names and types get the same STRUCTURAL descriptor name (`{x: number, y: string}`, whose leading brace is what no source identifier may start with), so one descriptor is emitted and shared; a different key ORDER is a different shape, because order is layout. The descriptor's name is the empty string, and the printer treats an empty name as "no constructor name", which is what makes `{ x: 1 }` print without a prefix where a class instance prints `Point { x: 1 }`. Deferred: a shorthand, spread, method or accessor member, a key that is not an identifier, and a literal whose type is not a layout (an optional property or an index signature — those wait on the shape table). |
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
| `Map` with primitive keys (string, number, boolean, null, undefined) | static (open-addressed hash table; `get`/`set`/`has`/`delete`/`clear`/`size`) | static if typed, else dynamic | **Implemented (rung 7).** A Map and a Set are ONE structure under two `JSRTClass` descriptors — `jsrt_class_map` and `jsrt_class_set`, distinguished by descriptor pointer the way object literals are — because the value half is the only difference between them and SameValueZero is the only comparison either needs. There is no separate "specialized primitive" table, and this row used to claim one: a NaN-boxed primitive key already IS its unboxed bits and an object key already IS its pointer, so one comparison serves both key kinds and two implementations would have been two copies of the same code (plan-notes 72). Entries are appended to a dense array and indexed by an open-addressed probe table kept at load ≤ ½, so INSERTION ORDER is iteration and print order — including across a delete-then-reinsert, which appends at the end rather than reclaiming the hole, and across the growth compaction. The type arguments must be on the CONSTRUCTION: `const m: Map<string, number> = new Map()` types the call itself `Map<any, any>`, which is Unknown, so only `new Map<string, number>()` is static. `.get` is dynamic wherever it appears — `noUncheckedIndexedAccess` aside, the lib types it `V \| undefined`, and that union has no HType. Deferred: constructing from an iterable (`new Map([['a', 1]])` — the Symbol.iterator protocol), iteration of any kind (`for-of`, `keys`, `values`, `entries`, `forEach`), and `WeakMap`/`WeakSet`, which need the collector to have a notion of weakness. |
| `Map` with object or unknown keys | dynamic (the KEY TYPE is Unknown; the table underneath is the same one) | dynamic | **Implemented (rung 7).** Not a separate path: SameValueZero on a non-primitive IS pointer identity, so two instances with identical fields are two keys and the table needs no object model to say so. The verdict on the FILE still turns on the type — `Map<object, V>` is Unknown, because `object` describes no layout — but that is the type model talking, not the table. |
| `Set` with primitive elements | static (the Map table with the value half unused) | static if typed, else dynamic | **Implemented (rung 7).** `add` rather than `set`, and one argument rather than two; everything else is the row above. |
| `Set` with object elements | dynamic (the ELEMENT TYPE is Unknown; the table is the same one) | dynamic | **Implemented (rung 7).** See the two rows above — the element kind changes nothing about the structure. |
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
| `typeof` operator | static | static | **Implemented (Task 3.5).** Its own HIR node, not a `UnaryOp`: it coerces nothing (it is total on every value, where every other prefix operator runs ToNumber or ToBoolean) and its result is a `string`, where `UnaryOp`'s is fixed to number or boolean. Not constant-folded — `typeof` asks the VALUE, and a value whose static type is `number` may still be an unchecked `unknown` underneath, which is the entire reason a guard is worth compiling. |
| `instanceof` operator | static | static | **Implemented (rung 6b).** The right operand must be a class NAME, not an expression: there is exactly one `JSRTClass` descriptor per class in the program, so the test is a pointer comparison against it and `x instanceof (cond ? A : B)` has no descriptor to name. The left operand is anything at all — every primitive answers `false`, and so does an array or a function, which are objects carrying no descriptor. Each descriptor carries its base's, so the test walks the parent chain — that walk lives entirely inside `jsrt_instanceof()`, which is why inheritance landing changed no generated C at the call site. |
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

/** Typed HIR node definitions for Phase 2 micro-subset (plan.md §5 Task 2.3).
 *
 * Every node carries an HType and a source span {start, length} for error reporting
 * and #line source mapping in the C emitter.
 *
 * Expressions and statements are separate unions — statements are not expressions
 * in this IR.
 */

import type { HType } from './types.ts';

/* jscpd:ignore-start
 *
 * Everything below is DECLARATION, not code: this file holds the HIR's discriminated union and
 * nothing else -- no function, no constant, nothing a copy/paste detector can be right about. A
 * union member is `interface X extends Node { readonly kind: '...'; ... }` by construction, and
 * the `kind` is what makes the union discriminated, so the repetition cannot be factored out
 * without deleting the thing that makes the IR type-safe. jscpd charges that similarity by LINE,
 * so a 50-token structural match here was billed as 623 duplicated lines (plan-notes 71). The
 * markers cover the declarations only; a function added to this file would still be checked. */

/** Source span for diagnostics and #line maps.
 *
 * `start`/`length` are 0-indexed UTF-16 offsets, matching TypeScript's own coordinate system so
 * the frontend can copy them across without conversion. `line` is 1-indexed, because it exists
 * for `#line` directives in emitted C and clang counts from 1 — the emitter must never have to
 * recompute it, since that would mean carrying the source text below the frontend. */
export interface Span {
  readonly start: number;
  readonly length: number;
  readonly line: number;
}

/** Base interface for all HIR nodes. */
interface Node {
  readonly type: HType;
  readonly span: Span;
}

// ─────────────────────────────────────────────────────────────────────────────
// Expressions

export interface NumberLiteral extends Node {
  readonly kind: 'number-literal';
  readonly value: number;
}

export interface StringLiteral extends Node {
  readonly kind: 'string-literal';
  readonly value: string;
}

export interface BooleanLiteral extends Node {
  readonly kind: 'boolean-literal';
  readonly value: boolean;
}

/** `null`. A keyword, so it is unambiguous in the source. */
export interface NullLiteral extends Node {
  readonly kind: 'null-literal';
}

/** `undefined`. Not a keyword — it is a global binding, which is why the lowering has to resolve
 * the identifier rather than pattern-match a token, and why a local named `undefined` shadows it
 * exactly as any other global would. */
export interface UndefinedLiteral extends Node {
  readonly kind: 'undefined-literal';
}

export interface Identifier extends Node {
  readonly kind: 'identifier';
  readonly name: string;
}

/** The operators BinaryOp models: both operands are always evaluated, exactly once, left to right.
 *
 * `&&`, `||` and `??` are absent on purpose — see LogicalOp. */
export type BinaryOperator =
  // Arithmetic. `/` is always f64 division and `%` is fmod, never C's integer forms
  // (docs/NUMERIC.md §3).
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  // Relational. All four are false when either operand is NaN (docs/NUMERIC.md §6.1).
  | '<'
  | '>'
  | '<='
  | '>='
  // Equality. `==` coerces per the docs/NUMERIC.md §6.3 table; `===` never coerces.
  | '==='
  | '!=='
  | '=='
  | '!='
  // Bitwise. Every operand goes through ToInt32/ToUint32 first, and the result is a NUMBER,
  // not an integer type — `>>>` can exceed int32 range (docs/NUMERIC.md §4).
  | '&'
  | '|'
  | '^'
  | '<<'
  | '>>'
  | '>>>';

export interface BinaryOp extends Node {
  readonly kind: 'binary-op';
  readonly operator: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
}

/** Prefix unary operators.
 *
 * `-` is here even though the lowering folds `-<numeric literal>` into a NumberLiteral: that fold
 * is a spelling convenience for constants, and `-x` on a variable is a real operation. Note that
 * `-` is the only way to produce `-0` from a positive zero (docs/NUMERIC.md §3.4), so it must
 * never be optimized away as identity. */
export interface UnaryOp extends Node {
  readonly kind: 'unary-op';
  readonly operator: '-' | '+' | '!' | '~';
  readonly operand: Expression;
}

/** `typeof x` — not a UnaryOp, for two reasons that both matter downstream.
 *
 * It does not coerce: every other prefix operator runs ToNumber or ToBoolean on its operand and so
 * constrains what may reach it, while `typeof` is total on every value there is and constrains
 * nothing. And its result is a `string`, where UnaryOp's is fixed to `number` or `boolean` by the
 * verifier's own rule — folding this in would mean weakening that rule for all four.
 *
 * The `type` is always `string`. What the operand's type is has no bearing on it: `typeof` asks the
 * VALUE, and a value whose static type is `number` can still be an unchecked `unknown` underneath,
 * which is precisely why the guard `typeof x === 'string'` is worth compiling at all. */
export interface TypeOf extends Node {
  readonly kind: 'typeof';
  readonly operand: Expression;
}

/** A runtime check that a value is what the program says it is — STA2001 if it is not.
 *
 * This is golden rule 4 made executable. TypeScript's types are unsound at exactly the places this
 * node appears: an `unknown` narrowed by a guard, an `as` cast, a value arriving from untyped code.
 * At each, the program ASSERTS a type it has not proven, and everything the compiler emits after
 * that point is entitled to trust the assertion completely — so the assertion is settled here,
 * once, rather than defended by every later operation.
 *
 * `type` is the checked type, which is what the node's consumers see; `value.type` is what it was
 * before, which is `unknown`. A check whose two types already agree is not built at all: the
 * lowering emits this node only where the narrowing is real, so its presence in the HIR IS the
 * statement that a boundary was crossed.
 *
 * `where` is `file:line:col`, carried on the node rather than derived from `span` at emission. A
 * column needs the source text to compute, the emitter does not have it, and adding one to `Span`
 * would grow every node in the IR to serve the one that reports a location to a human. */
export interface BoundaryCheck extends Node {
  readonly kind: 'boundary-check';
  readonly value: Expression;
  readonly where: string;
}

/** `&&`, `||`, `??` — separate from BinaryOp because they differ in both ways that matter to a
 * compiler: the right operand is evaluated CONDITIONALLY, and the result is one of the operands
 * rather than a fresh value. `a && b` is not `and(a, b)`; it is `let t = a; t ? b : t`. Modelling
 * them as BinaryOp would license every pass that assumes "both children are evaluated" to hoist
 * work out of a branch that may never run. */
export interface LogicalOp extends Node {
  readonly kind: 'logical-op';
  readonly operator: '&&' | '||' | '??';
  readonly left: Expression;
  readonly right: Expression;
}

/** A template literal: `` `a${x}b` ``.
 *
 * Modelled in its own node rather than desugared to `+`, even though the two agree on every
 * primitive. They stop agreeing at objects: `` `${o}` `` calls ToString directly, while `"" + o`
 * runs ToPrimitive with hint *default*, which tries `valueOf` FIRST. An object with both methods
 * takes different branches. Desugaring now would bake that difference in as a bug that only
 * surfaces once objects land, in code no longer being looked at.
 *
 * INVARIANT: `quasis.length === expressions.length + 1`. The literal chunks bracket the holes, so
 * a template always begins and ends with a chunk — an empty one where the source has nothing. */
export interface TemplateLiteral extends Node {
  readonly kind: 'template-literal';
  readonly quasis: readonly string[];
  readonly expressions: readonly Expression[];
}

/** `s.length` on a string.
 *
 * A dedicated node, not general property access, for the same reason ConsoleLogCall is: the
 * subset admits exactly one property today, and giving it its own node keeps the gate's accept
 * set equal to this vocabulary. General property access arrives with the object model.
 *
 * The value is a count of UTF-16 CODE UNITS, matching JavaScript — an astral character counts
 * twice (docs/VALUE.md §2). */
export interface StringLength extends Node {
  readonly kind: 'string-length';
  readonly operand: Expression;
}

/** `a.length` on an array.
 *
 * Separate from StringLength rather than one node that inspects its operand, because the two
 * dispatch to different runtime functions and the choice is made here, where the operand's type is
 * known, rather than in the emitter where an `Unknown` operand would leave it with no answer. */
export interface ArrayLength extends Node {
  readonly kind: 'array-length';
  readonly operand: Expression;
}

/** `[a, b, c]`. Elements are evaluated left to right, before the array exists. */
export interface ArrayLiteral extends Node {
  readonly kind: 'array-literal';
  readonly elements: readonly Expression[];
}

/** `a[i]` as a READ.
 *
 * `index` is an arbitrary expression, not a number: `a[f()]` is legal, and the side effect happens
 * whether or not the index turns out to be in range.
 *
 * This node's `type` is what the checker says the read produces, which under
 * `noUncheckedIndexedAccess` is `T | undefined` and therefore Unknown — NOT the array's element
 * type. An out-of-range read really does yield `undefined`, so narrowing it here would be the
 * compiler asserting something the runtime cannot honour. */
export interface IndexAccess extends Node {
  readonly kind: 'index-access';
  readonly target: Expression;
  readonly index: Expression;
}

/** `new C(a, b)`.
 *
 * `className` names the class, not an expression: the emitter has to reach a specific `JSRTClass`
 * descriptor and a specific constructor, and `new (cond ? A : B)()` cannot resolve to either. The
 * node's `type` is the resulting HObject.
 *
 * `args` are the CONSTRUCTOR's arguments and do not include the receiver. The object is allocated
 * before the constructor runs -- it has to be, because the constructor's whole job is to assign
 * into it -- and the emitter is what puts it in front of `args`. */
export interface NewExpr extends Node {
  readonly kind: 'new';
  readonly className: string;
  readonly args: readonly Expression[];
}

/** `x instanceof C`.
 *
 * `className` names the class for the same reason `new` does: the emitter reaches a specific
 * `JSRTClass` descriptor, and there is one per class in the whole program, so the test is a pointer
 * comparison against it. A class as a VALUE would be needed for `x instanceof f()`, which is why
 * that spelling is a `not-yet` at the gate rather than an expression here.
 *
 * `target` is any expression at all, including a primitive: `1 instanceof C` is `false`, not an
 * error, so nothing about this node requires the target to be an object. The node's `type` is
 * always `boolean`.
 *
 * There is no prototype CHAIN to walk while `extends` is deferred, so identity is the whole test.
 * When inheritance lands this node does not change shape -- the runtime helper it lowers to grows
 * a parent link to follow, which is exactly why the emitter names the class and never the offset. */
export interface InstanceOf extends Node {
  readonly kind: 'instanceof';
  readonly target: Expression;
  readonly className: string;
}

/** `o.x` as a READ.
 *
 * `slot` is the field's index in its class's field list, resolved once during lowering. It is
 * stored rather than recomputed because it is then CHECKABLE: the verifier confirms that the slot
 * still names `field` in the target's type, which an emitter that recomputed it silently could not
 * be caught doing wrong.
 *
 * Unlike an array read, this node's `type` really is the field's type. A field always exists -- the
 * checker proved the name is declared, and the slot is allocated whether or not the constructor
 * assigned it -- so there is no `| undefined` and no boundary to check. An unassigned field reads
 * as `undefined` because that is what the slot HOLDS, which is a value, not a missing one. */
export interface FieldAccess extends Node {
  readonly kind: 'field-access';
  readonly target: Expression;
  readonly field: string;
  readonly slot: number;
}

/** `o.m(a)`.
 *
 * A method is not a field: no instance holds a closure for it, and one function is shared by every
 * instance of the class that declares it. `className` records which class -- for a `direct` call
 * that is the function the emitter names, and for a `virtual` one it is the class the SLOT was
 * resolved against.
 *
 * `dispatch` is the whole of overriding. A method nothing overrides has exactly one implementation
 * for every receiver in the chain, so the call is `direct` and costs nothing; a method some
 * descendant overrides is `virtual` and loads its entry from the receiver's own class at `slot`.
 * The distinction is a fact about the whole program, not about the call site, which is why the
 * lowering decides it once per method rather than the emitter guessing per call. `super.m()` is
 * `direct` even when `m` is overridden -- skipping the override is what `super` MEANS.
 *
 * `target` is the receiver and is NOT in `args`; it becomes argument zero, which is where a method
 * body's `this` parameter reads it from. */
export interface MethodCall extends Node {
  readonly kind: 'method-call';
  readonly target: Expression;
  readonly className: string;
  readonly method: string;
  /** Index into the class's method table. Meaningful only for a `virtual` call, and correct for
   * every descendant because a subclass's table begins with its base's, in the base's order. */
  readonly slot: number;
  readonly dispatch: 'direct' | 'virtual';
  readonly args: readonly Expression[];
}

/** `{ x: 1, y: f() }`.
 *
 * The same allocation a class instance is -- a descriptor pointer followed by slots -- with the
 * descriptor derived from the TYPE rather than from a declaration. `type` is the shape, whose name
 * is the shape itself, so two literals written with the same keys and types share one descriptor.
 *
 * `entries` is in slot order and is the same order the source wrote, which is what makes
 * `console.log` print the keys in the order JavaScript prints them. Each value is evaluated in
 * that order, left to right, exactly once. */
export interface ObjectLiteral extends Node {
  readonly kind: 'object-literal';
  readonly entries: readonly ObjectEntry[];
}

export interface ObjectEntry {
  readonly name: string;
  readonly value: Expression;
}

/** `new Map()` and `new Set()`.
 *
 * Not a `NewExpr`: that names a class the emitter emitted a descriptor for, and these two are
 * runtime structures with no declaration in the program. The `collection` field is the whole
 * difference between them below this point -- one allocator call each. */
export interface CollectionNew extends Node {
  readonly kind: 'collection-new';
  readonly collection: 'map' | 'set';
}

/** Every operation the subset performs on a Map or a Set.
 *
 * `size` is here despite being a property rather than a call, because it is the same question asked
 * of the same structure and giving it a node of its own would buy nothing -- exactly the reasoning
 * that keeps `ArrayLength` separate from a general property access, seen from the other side. */
export type CollectionOperation = 'get' | 'set' | 'has' | 'delete' | 'clear' | 'add' | 'size';

/** `m.get(k)`, `s.add(v)`, `m.size` — one node for the whole method surface of both collections.
 *
 * A `MethodCall` would be wrong twice over: there is no `JSRTClass` method table to index and no
 * user function to name, and the operations are not virtual in any sense -- `get` on a Map is one
 * runtime function for every Map in the program. The verifier is what pins each operation to the
 * collection it belongs to, so `s.get(k)` cannot survive lowering by accident. */
export interface CollectionOp extends Node {
  readonly kind: 'collection-op';
  readonly collection: 'map' | 'set';
  readonly op: CollectionOperation;
  readonly target: Expression;
  readonly args: readonly Expression[];
}

/** A function VALUE: a declaration, a function expression and an arrow all lower to this.
 *
 * The three spellings differ in JavaScript over `this`, `arguments` and hoisting. None of those
 * exists in the subset — `this` and `arguments` are gated out, and hoisting is a property of the
 * *binding*, which FunctionDeclaration carries — so below the gate they are one node. When `this`
 * arrives, an arrow's captured receiver becomes a field here, and the node splits or grows a flag
 * at that point rather than in anticipation of it.
 *
 * `name` is present for a declaration and for a named function expression, absent for an arrow. It
 * exists for diagnostics and for the emitter's C symbol; it is NOT the binding — a declaration's
 * binding is FunctionDeclaration.name, and the two are the same string only by convention. */
export interface FunctionExpr extends Node {
  readonly kind: 'function';
  readonly name?: string;
  readonly params: readonly Parameter[];
  readonly body: Block;
  /** Own bindings that something nested reads, so they live in this function's heap environment
   * rather than its frame. The array position IS the environment slot index (docs/VALUE.md §4.3).
   * A name here must NOT also get a frame slot: one variable, one home. */
  readonly envVars: readonly string[];
  /** Free variables, each resolved against the environment chain this function is handed. */
  readonly captures: readonly EnvCapture[];
  /** This function, or something nested in it, reads an enclosing environment — so it must carry
   * the incoming one and its closure is heap-allocated. False leaves rung 4a's file-static
   * constant with `env = NULL`, which is why a non-capturing function still costs no allocation. */
  readonly needsEnv: boolean;
}

/** One captured variable. `levels` counts from the environment the referencing function receives:
 * 0 is the nearest enclosing env-bearing scope. Both numbers are compile-time constants, so a
 * capture is an indexed load, never a search. */
export interface EnvCapture {
  readonly name: string;
  readonly levels: number;
  readonly index: number;
}

/** One declared parameter. Not a Node: a parameter is a binding site, not a value, and giving it
 * a `kind` would put it in the expression union where nothing may evaluate it. */
export interface Parameter {
  readonly name: string;
  readonly type: HType;
  readonly span: Span;
}

/** A call: `f(x)`.
 *
 * `callee` is an arbitrary expression, not a name, because `(cond ? f : g)(x)` is a call too. The
 * arity of `args` is INDEPENDENT of the callee's declared parameter count — JavaScript pads
 * missing arguments with `undefined` and drops extra ones, in both modes, so nothing downstream
 * may assume the two agree. In `ts` mode the type checker has already rejected the mismatch; the
 * emitter still must not depend on that, because `js` mode reaches the same emitter.
 *
 * Evaluation order is callee first, then arguments left to right. */
export interface CallExpr extends Node {
  readonly kind: 'call';
  readonly callee: Expression;
  readonly args: readonly Expression[];
}

/** console.log call — restricted to this single builtin for Phase 2. */
export interface ConsoleLogCall extends Node {
  readonly kind: 'console-log';
  readonly args: readonly Expression[];
}

export type Expression =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | UndefinedLiteral
  | Identifier
  | BinaryOp
  | UnaryOp
  | TypeOf
  | BoundaryCheck
  | LogicalOp
  | TemplateLiteral
  | StringLength
  | ArrayLength
  | ArrayLiteral
  | IndexAccess
  | NewExpr
  | InstanceOf
  | FieldAccess
  | MethodCall
  | ObjectLiteral
  | CollectionNew
  | CollectionOp
  | FunctionExpr
  | CallExpr
  | ConsoleLogCall;

// ─────────────────────────────────────────────────────────────────────────────
// Statements

/** `super(a, b)` — the base constructor, run against THIS constructor's receiver.
 *
 * A statement, not an expression, because that is all it can ever be: the gate admits it only as
 * the first statement of a derived constructor, and JavaScript gives it no value. Making it a
 * statement is also what lets the lowering place the class's own field initializers, which run
 * after the base constructor and before the rest of the body — a fixed position only because the
 * call is in a fixed position.
 *
 * `receiver` is named rather than implied: one object is being constructed, the base constructor
 * fills its lower slots and this one fills the rest, and an implicit receiver would be the one part
 * of that story the HIR did not say out loud. `className` is the BASE, for the same reason
 * `MethodCall` names a class — the emitter reaches a specific constructor.
 *
 * A base with no constructor to run emits nothing. It can have no parameters either (the checker
 * would reject the arguments), so there is nothing whose side effects could be skipped. */
export interface SuperCall extends Node {
  readonly kind: 'super-call';
  readonly className: string;
  readonly receiver: Expression;
  readonly args: readonly Expression[];
}

/** let or const binding. The initializer is required: an uninitialized `let` would need
 * definite-assignment tracking to know whether a read yields `undefined`, which is Phase 3 work.
 * The gate rejects `let x;` rather than lowering it. */
export interface Declaration extends Node {
  readonly kind: 'declaration';
  readonly name: string;
  readonly declKind: 'let' | 'const';
  readonly value: Expression;
}

/** Assignment to an existing binding (no destructuring). */
export interface Assignment extends Node {
  readonly kind: 'assignment';
  readonly target: string; // identifier name
  readonly value: Expression;
}

/** `a[i] = v`.
 *
 * A statement, like Assignment, and separate from it because the destination is not a name: it is
 * two expressions that must both be evaluated, in source order and before the value, and either
 * can have side effects. Compound forms (`a[i] += 1`, `a[i]++`) lower to this with the read folded
 * into `value`, which is why `index` must be evaluated exactly once — see plan-notes 43. */
export interface IndexAssignment extends Node {
  readonly kind: 'index-assignment';
  readonly target: Expression;
  readonly index: Expression;
  readonly value: Expression;
}

/** `o.x = v`, including `this.x = v` in a constructor.
 *
 * Same `slot` contract as FieldAccess, and the same evaluation order as IndexAssignment: target,
 * then value. */
export interface FieldAssignment extends Node {
  readonly kind: 'field-assignment';
  readonly target: Expression;
  readonly field: string;
  readonly slot: number;
  readonly value: Expression;
}

/** One method or constructor. `fn`'s parameter list begins with the RECEIVER, under a name no
 * source can spell, and `this` in the body lowers to a read of it.
 *
 * That reduction is the reason methods needed no new machinery: a method is an ordinary function
 * with one extra parameter, so it inherits the closure ABI, arity padding, capture analysis and the
 * static-closure fast path unchanged — and an arrow inside a method that closes over `this` is just
 * an arrow that captures a parameter, which rung 4b already knows how to do. */
export interface ClassMethod {
  readonly name: string;
  readonly fn: FunctionExpr;
}

/** `class C { … }`.
 *
 * Not hoisted: a class is in its temporal dead zone until its declaration is reached, so this is an
 * ordinary statement in source order and the binding is not visible before it. What the emitter
 * lifts to file scope is only the STATIC part — the `JSRTClass` descriptor and the method closures
 * — which no program can observe the timing of.
 *
 * `fields` is in slot order and is the single source of that order: `HObject.fields`, the emitted
 * descriptor, and every `slot` in a FieldAccess all have to agree with it. */
export interface ClassDeclaration extends Node {
  readonly kind: 'class-declaration';
  readonly name: string;
  /** The immediate base class's name, absent at the root of a chain. `fields` already includes the
   * inherited ones (base-first, which is what makes a derived instance readable as a base one), so
   * this is not needed for layout -- it is needed for `instanceof`, which asks about the chain. */
  readonly base?: string;
  readonly fields: readonly Parameter[];
  readonly ctor?: ClassMethod;
  readonly methods: readonly ClassMethod[];
  /** Static members, as ordinary bindings under a name no source can spell (`C.count`).
   *
   * A static belongs to the class OBJECT, not to any instance: it is not a slot in the layout, it
   * is ONE binding for the whole program, and `C.count` reads it by name. A static method is the
   * same thing with a function for a value and no receiver. Modelling them this way is why they
   * needed no node, no verifier case and no emitter case of their own -- a static read is an
   * `Identifier`, a static write is an `Assignment`, and a static call is a `CallExpr`.
   *
   * They ride on the class rather than being spliced into the enclosing statement list so that a
   * class stays one statement in source order; the enclosing scope reaches them by walking here,
   * which is also what fixes WHEN they are initialized -- where the class declaration sits. */
  readonly statics: readonly Declaration[];
  /** The method table, in slot order: one entry per method this class responds to, inherited ones
   * first and in the base's own order. Each entry names the class whose body IMPLEMENTS the method
   * for THIS class, which is where an override differs from its base -- same name, same slot,
   * different implementor.
   *
   * Empty for a class that participates in no overriding: such a class needs no table, because
   * every call to its methods is direct. That is not only an optimization -- a table is a
   * file-scope constant, and a class declared inside a function may have methods that capture,
   * which have no one constant form. Overriding is refused there for exactly that reason. */
  readonly vtable: readonly VtableEntry[];
}

/** One method-table entry: the name at this slot, and the class whose body implements it. */
export interface VtableEntry {
  readonly name: string;
  readonly className: string;
}

/** Expression statement (wraps an expression). */
export interface ExpressionStatement extends Node {
  readonly kind: 'expression-statement';
  readonly expression: Expression;
}

/** if statement (else branch is optional). */
export interface IfStatement extends Node {
  readonly kind: 'if-statement';
  readonly condition: Expression;
  readonly consequent: Block;
  readonly alternate?: Block;
}

/** A loop's optional source label.
 *
 * The label is carried ON the loop rather than in a wrapping LabeledStatement node. A label in
 * JavaScript exists only to be named by `break`/`continue`, and `continue` can only name a loop —
 * so the label is a property of the loop, and a wrapper node would sit between `break outer` and
 * the loop it has to leave for no gain. Labels on non-loop statements (`foo: { … break foo; }`)
 * are legal and vanishingly rare; the gate defers them.
 *
 * INVARIANT: every label named by a BreakStatement or ContinueStatement is the label of an
 * enclosing loop (or, for `break`, an enclosing switch). The verifier checks it, because a label
 * that resolves to nothing becomes a `goto` to a C label that was never emitted — a failure that
 * would surface as a clang error against generated code rather than as a diagnostic. */
type Labelled = { readonly label?: string };

/** while statement. */
export interface WhileStatement extends Node, Labelled {
  readonly kind: 'while-statement';
  readonly condition: Expression;
  readonly body: Block;
}

/** do/while: the body runs before the first test, which is the whole difference. */
export interface DoWhileStatement extends Node, Labelled {
  readonly kind: 'do-while-statement';
  readonly condition: Expression;
  readonly body: Block;
}

/** C-style `for`. All three header slots are optional — `for (;;)` is a legal infinite loop.
 *
 * `init` and `update` are Statements rather than Expressions because `for (let i = 0; …)` declares
 * a binding, which is not an expression. An absent `condition` means `true`, not `undefined`: the
 * emitter must not confuse "no test" with "a test that yields undefined". */
export interface ForStatement extends Node, Labelled {
  readonly kind: 'for-statement';
  readonly init?: Statement;
  readonly condition?: Expression;
  readonly update?: Statement;
  readonly body: Block;
}

/** `for (const x of a)` over an array.
 *
 * Not sugar for a counting `for`, even though it lowers to one: the binding is fresh per iteration,
 * and — unlike `a[i]` — its type is the element type with no `| undefined`, because the loop only
 * ever visits indices that exist. That is what keeps a typed iteration on the static path.
 *
 * `iterable` is an array. The general iterator protocol (`Symbol.iterator`) arrives with the object
 * model; until then the gate admits only an operand the checker types as an array. */
export interface ForOfStatement extends Node, Labelled {
  readonly kind: 'for-of-statement';
  readonly binding: string;
  readonly declKind: 'let' | 'const';
  readonly iterable: Expression;
  readonly body: Block;
}

/** One `case` or `default` arm. An absent `test` is `default`.
 *
 * `statements` is NOT a Block: a switch clause does not open a scope of its own, and its
 * statements fall through into the next clause unless something jumps. Modelling it as a Block
 * would suggest both of those are false. */
export interface SwitchClause {
  readonly test?: Expression;
  readonly statements: readonly Statement[];
}

/** `switch`.
 *
 * Two facts the lowering and emitter must both honour, neither of which C's `switch` provides:
 * clause tests use **strict equality** (so `case '1'` does not match `1`, and cases need not be
 * constants), and `default` is tried **last regardless of where it is written**. That is why this
 * lowers to a test chain plus gotos rather than to a C switch — see the emitter. */
export interface SwitchStatement extends Node, Labelled {
  readonly kind: 'switch-statement';
  readonly discriminant: Expression;
  readonly clauses: readonly SwitchClause[];
}

/** `break` / `break label`. An absent label means the innermost enclosing loop *or switch*. */
export interface BreakStatement extends Node, Labelled {
  readonly kind: 'break-statement';
}

/** `continue` / `continue label`. Unlike `break`, this never targets a switch — an absent label
 * means the innermost enclosing LOOP, skipping any switch in between. */
export interface ContinueStatement extends Node, Labelled {
  readonly kind: 'continue-statement';
}

/** `throw e;`.
 *
 * The value is ANY value — JavaScript throws strings and numbers as happily as Error objects, and
 * this subset has no Error yet (Task 4.2), so a fixture that throws throws a primitive. The
 * statement never completes: control transfers to the nearest enclosing catch, running every
 * `finally` on the way, or unwinds out of `main` as an uncaught exception (exit code 1, message on
 * stderr — matching Node's observable behaviour, which is what the golden runner compares). */
export interface ThrowStatement extends Node {
  readonly kind: 'throw-statement';
  readonly value: Expression;
}

/** `try { … } catch (e) { … } finally { … }`.
 *
 * INVARIANT: at least one of `catchBlock`/`finallyBlock` is present — `try {}` alone is a syntax
 * error in JavaScript, and the verifier re-checks it because an emitter handed neither would emit
 * a block that catches nothing and cleans up nothing while claiming to.
 *
 * `catchBinding` is the caught name, absent both for `catch {` (the binding-less form) and when
 * there is no catch at all — `catchBlock` is what distinguishes those two. The binding is typed
 * `Unknown` always: anything can be thrown, so `useUnknownInCatchVariables` is not a strictness
 * flag here but the only sound answer, and a narrowing of the caught value goes through the same
 * BoundaryCheck machinery as any other `unknown` (§3.2.1).
 *
 * `finally` runs on EVERY exit from the try/catch — normal completion, a thrown value, a `return`,
 * a `break`/`continue` crossing the statement — and its own completion wins over the one it
 * interrupted. The emitter implements that with a per-try completion code and a dispatch after the
 * finally body; see the emitter, and docs/HIR.md §1.3. */
export interface TryStatement extends Node {
  readonly kind: 'try-statement';
  readonly tryBlock: Block;
  readonly catchBinding?: string;
  readonly catchBlock?: Block;
  readonly finallyBlock?: Block;
}

/** `function f(...) {...}` as a statement.
 *
 * Separate from Declaration, and not sugar for `const f = function f(){}`, because the binding is
 * HOISTED: it holds the function from the moment its scope is entered, so `f(); function f(){}`
 * runs. A `const` would be in its temporal dead zone at that point. The emitter honours this by
 * initializing every function-declaration binding in the enclosing body's prologue, ahead of the
 * statements in source order — which is only sound because a FunctionExpr's value depends on
 * nothing that has run yet.
 *
 * INVARIANT: `type` is the function's type and equals `fn.type`; the binding and the value it
 * holds cannot disagree. */
export interface FunctionDeclaration extends Node {
  readonly kind: 'function-declaration';
  readonly name: string;
  readonly fn: FunctionExpr;
}

/** `return e;` or bare `return;`.
 *
 * An absent `value` means `undefined`, and is NOT the same as `value: UndefinedLiteral`: the two
 * agree on the value returned but not on the source, and a diagnostic that points at a `return`
 * the user did not write is a bad diagnostic. The emitter treats them identically. */
export interface ReturnStatement extends Node {
  readonly kind: 'return-statement';
  readonly value?: Expression;
}

/** Block: a sequence of statements. */
export interface Block extends Node {
  readonly kind: 'block';
  readonly statements: readonly Statement[];
}

export type Statement =
  | Declaration
  | Assignment
  | IndexAssignment
  | FieldAssignment
  | SuperCall
  | ClassDeclaration
  | ExpressionStatement
  | IfStatement
  | WhileStatement
  | DoWhileStatement
  | ForStatement
  | ForOfStatement
  | SwitchStatement
  | BreakStatement
  | ContinueStatement
  | ThrowStatement
  | TryStatement
  | FunctionDeclaration
  | ReturnStatement
  | Block;

// ─────────────────────────────────────────────────────────────────────────────
// Module root

/** Module: the top-level container holding all statements.
 *
 * `fileName` is the absolute path of the source, kept here so the C emitter can write
 * `#line N "path"` without reaching back to a `ts.SourceFile`. */
export interface Module extends Node {
  readonly kind: 'module';
  readonly fileName: string;
  readonly statements: readonly Statement[];
}

/* jscpd:ignore-end */

/* C emitter: #line source maps, JSRT_FRAME/JSRT_LOCAL rooting discipline from the first
 * emitted line, landing-pad error propagation. Generated C is never hand-edited. */

import type {
  ArrayLiteral,
  BinaryOp,
  CallExpr,
  ClassDeclaration,
  EnvCapture,
  Expression,
  FieldAssignment,
  ForOfStatement,
  FunctionExpr,
  IndexAccess,
  IndexAssignment,
  LogicalOp,
  MethodCall,
  Module,
  NewExpr,
  Span,
  Statement,
  SwitchStatement,
  TemplateLiteral,
  UnaryOp,
} from '../hir/nodes.ts';

/** C fragment for each binary operator, given already-emitted operand expressions.
 *
 * Note what is NOT here: `jsrt_to_double`, which is a bit reinterpretation and not a conversion.
 * Applying it to a boxed boolean or string reads the payload as an IEEE double and produces
 * garbage. Every numeric context goes through `jsrt_to_number` (ToNumber, docs/NUMERIC.md §6.3). */
const BINARY_EMITTERS: Readonly<Record<BinaryOp['operator'], (l: string, r: string) => string>> = {
  // `+` is the one arithmetic operator that is not arithmetic. If EITHER operand is a string it
  // concatenates instead of adding, so the dispatch is a runtime decision and lives in the
  // runtime: `1 + "2"` is `"12"`, not `3`.
  '+': (l, r) => `jsrt_op_add(${l}, ${r})`,
  '-': (l, r) => `jsrt_number(jsrt_to_number(${l}) - jsrt_to_number(${r}))`,
  '*': (l, r) => `jsrt_number(jsrt_to_number(${l}) * jsrt_to_number(${r}))`,
  // Always f64 division: there is no integer `/` in JavaScript, so 1/2 is 0.5 and 1/0 is
  // Infinity rather than a trap (docs/NUMERIC.md §3.1).
  '/': (l, r) => `jsrt_number(jsrt_to_number(${l}) / jsrt_to_number(${r}))`,
  // `fmod`, not C's `%`: the operands are doubles, and C's `%` is integer-only.
  '%': (l, r) => `jsrt_number(fmod(jsrt_to_number(${l}), jsrt_to_number(${r})))`,
  // Relational comparison is string-vs-numeric at RUNTIME, and the two disagree: `"10" < "9"` is
  // true (code-unit order) while `"10" < 9` is false (numeric). Only when BOTH operands are
  // strings does it compare as text -- which is why this cannot be decided by the emitter.
  //
  // Note also that these are four independent operators, not two plus negation: all four are
  // false when an operand is NaN, so `!(a < b)` is not `a >= b` (docs/NUMERIC.md §9).
  '<': (l, r) => `jsrt_bool(jsrt_op_lt(${l}, ${r}))`,
  '>': (l, r) => `jsrt_bool(jsrt_op_gt(${l}, ${r}))`,
  '<=': (l, r) => `jsrt_bool(jsrt_op_le(${l}, ${r}))`,
  '>=': (l, r) => `jsrt_bool(jsrt_op_ge(${l}, ${r}))`,
  '===': (l, r) => `jsrt_bool(jsrt_strict_equals(${l}, ${r}))`,
  '!==': (l, r) => `jsrt_bool(!jsrt_strict_equals(${l}, ${r}))`,
  '==': (l, r) => `jsrt_bool(jsrt_loose_equals(${l}, ${r}))`,
  '!=': (l, r) => `jsrt_bool(!jsrt_loose_equals(${l}, ${r}))`,
  '&': (l, r) => `jsrt_op_bitand(${l}, ${r})`,
  '|': (l, r) => `jsrt_op_bitor(${l}, ${r})`,
  '^': (l, r) => `jsrt_op_bitxor(${l}, ${r})`,
  '<<': (l, r) => `jsrt_op_shl(${l}, ${r})`,
  '>>': (l, r) => `jsrt_op_shr(${l}, ${r})`,
  '>>>': (l, r) => `jsrt_op_ushr(${l}, ${r})`,
};

/** C fragment for each unary operator.
 *
 * `-` is a real negation, not a constant fold: `-x` where x is `+0` must yield `-0`, which is why
 * the emitter negates the double rather than subtracting from zero. */
const UNARY_EMITTERS: Readonly<Record<UnaryOp['operator'], (operand: string) => string>> = {
  '-': (x) => `jsrt_number(-jsrt_to_number(${x}))`,
  '+': (x) => `jsrt_number(jsrt_to_number(${x}))`,
  '!': (x) => `jsrt_bool(!jsrt_truthy(${x}))`,
  '~': (x) => `jsrt_op_bitnot(${x})`,
};

/** Render a JS number as a C literal that parses back to the SAME double.
 *
 * `String(n)` is not enough on its own. Three ways it produces C that is wrong or will not
 * compile at all:
 *   1e20   -> "100000000000000000000", which C reads as an INTEGER literal too large for any
 *             integer type. clang rejects the file outright.
 *   7      -> "7", an int literal. It converts to 7.0 here, but the emitted C then documents a
 *             type the compiler does not actually use, and the habit breaks at the int64 range.
 *   -0     -> "0". The sign is lost, and with it Object.is(-0, 0) === false and 1/-0 === -Infinity
 *             (docs/VALUE.md §1.3).
 * What DOES carry over is that `String(n)` is already the shortest round-tripping decimal, so
 * appending a decimal point is enough to make it exact and legal at once. */
function cDoubleLiteral(value: number): string {
  if (Number.isNaN(value)) {
    return '(0.0 / 0.0)'; // canonicalized by jsrt_number; see docs/VALUE.md §1.2
  }
  if (value === Number.POSITIVE_INFINITY) {
    return '(1.0 / 0.0)';
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return '(-1.0 / 0.0)';
  }
  if (Object.is(value, -0)) {
    return '-0.0';
  }
  const text = String(value);
  // "1e+21" and "0.5" are already floating literals to C; bare digits are not.
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

/** A C string literal, used for the function name `jsrt_print` reports as `[Function: name]`. */
function cNameLiteral(name: string): string {
  return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/* One emitted C function. Each HIR function becomes a `_jsrt_fn_N` with a frame of its own, plus a
 * file-static `_jsrt_closure_N` describing it -- constant because rung 4a has no captures; 4b makes
 * the closure heap-allocated and gives it an environment pointer. */
interface FunctionUnit {
  readonly id: number;
  readonly fn: FunctionExpr;
  readonly name: string;
}

class Emitter {
  private lines: string[] = [];
  private indent: number = 0;
  private slotMap: Map<string, number> = new Map();
  /** Frame slot holding each short-circuit operator's left operand. Keyed by node identity, since
   * two `&&`s in one expression must not share a slot: the outer one's value stays live while the
   * inner one is being evaluated. */
  private tempSlots: Map<LogicalOp, number> = new Map();
  /* C does not specify which operand of an operator or function call it evaluates first. Every
   * BinaryOp therefore gets two rooted slots: emitting `left` into the first before `right` into
   * the second makes the JavaScript left-to-right rule explicit, and preserves the left value if
   * evaluating the right allocates. */
  private binarySlots: Map<BinaryOp, number> = new Map();
  /* A template evaluates and stringifies substitutions from left to right too. Its parts occupy a
   * contiguous run; slot zero is reused for each concatenation result so that intermediate strings
   * remain rooted across the next allocation. */
  private templateSlots: Map<TemplateLiteral, { readonly base: number; readonly count: number }> =
    new Map();
  /* The switch discriminant's slot: evaluated once, then compared against every clause. */
  private switchSlots: Map<SwitchStatement, number> = new Map();
  /* Frame slot holding a call's callee and its arguments: 1 + argc CONTIGUOUS slots, so `argv` can
   * point at the first argument and every already-evaluated operand stays rooted while the rest are
   * evaluated. Keyed by node identity, like the other temporaries. */
  private callSlots: Map<CallExpr | MethodCall | NewExpr, number> = new Map();

  /* Every class declared anywhere in the file, in the order counting reached them. The index is
   * the descriptor's C identity (`_jsrt_class_N`), and the name is how NewExpr and MethodCall --
   * which carry a class NAME, not a pointer -- find their way back to it. */
  private classes: ClassDeclaration[] = [];
  private classIds: Map<string, number> = new Map();
  /* An array literal's elements occupy a contiguous run, for the same reason a call's arguments do:
   * `jsrt_array_new` takes a pointer to the first, and every element already evaluated must stay
   * rooted while the rest are evaluated -- the allocation inside `jsrt_array_new` itself can
   * collect. */
  private arraySlots: Map<ArrayLiteral, number> = new Map();
  /* Two slots for a read (`target`, `index`), three for a write (`target`, `index`, `value`).
   * Same unspecified-order argument as binarySlots: `jsrt_array_get(a(), i())` would let C run
   * `i()` first, and a collection during `i()` could free the array `a()` just produced. */
  private indexSlots: Map<IndexAccess | IndexAssignment | FieldAssignment, number> = new Map();
  /* The for-of iterable's slot. Evaluated ONCE -- `for (const x of f())` calls `f` once -- and the
   * array has to stay rooted for the whole loop, since the body can allocate on every iteration. */
  private forOfSlots: Map<ForOfStatement, number> = new Map();
  private slotCount: number = 0;

  /* Module-level bindings, which are NOT in any function's frame: a function body may read one, and
   * main's stack frame does not outlive the call. They live in the file-static globals array, so
   * `slotMap`/`slotCount` above always describe the unit being emitted and these describe the
   * module. While the module itself is being emitted the two are the same map. */
  private globalMap: Map<string, number> = new Map();
  private globalCount: number = 0;
  private inFunction: boolean = false;

  /* Captured-variable state for the unit being emitted (docs/VALUE.md §4.3). `envMap` holds this
   * function's OWN captured bindings, which live in its heap environment instead of its frame --
   * so a name in here must never also get a frame slot. `captureMap` holds the ones it reads from
   * enclosing environments, already resolved to (levels, index) by capture analysis. */
  private envMap: Map<string, number> = new Map();
  private captureMap: Map<string, EnvCapture> = new Map();
  /* Where `return e;` parks its value: the expression is evaluated into a rooted slot while the
   * frame is still live, and only then is the frame popped. One slot per function is enough --
   * returns do not nest. */
  private returnSlot: number = 0;
  /* Every function reachable from the module, in emission order. It GROWS while it is walked: a
   * nested function is only discovered when its parent's body is counted. */
  private functions: FunctionUnit[] = [];
  private functionIds: Map<FunctionExpr, number> = new Map();

  private fileName: string = '';

  /* Loops and switches currently open, innermost last -- the emitter's mirror of the verifier's
   * Enclosing stack, carrying the id that names this construct's C labels. */
  private enclosing: { id: number; label?: string; isLoop: boolean }[] = [];
  private loopCount: number = 0;
  /* Labels a `goto` actually targets. C warns on a label nothing jumps to, and the runtime builds
   * with -Wall -Wextra -Werror, so an unconditional `brk_N:` after every loop would turn a plain
   * `while` into a build failure. Every jump is emitted before its target line, so consulting this
   * at emission time is enough -- no second pass over the output. */
  private usedLabels: Set<string> = new Set();

  emit(module: Module): string {
    this.fileName = module.fileName;
    this.slotMap = new Map();
    this.tempSlots.clear();
    this.binarySlots.clear();
    this.templateSlots.clear();
    this.switchSlots.clear();
    this.callSlots.clear();
    this.classes = [];
    this.classIds.clear();
    this.slotCount = 0;
    this.globalMap = new Map();
    this.globalCount = 0;
    this.inFunction = false;
    this.envMap = new Map();
    this.captureMap = new Map();
    this.returnSlot = 0;
    this.functions = [];
    this.functionIds.clear();
    this.enclosing = [];
    this.loopCount = 0;
    this.usedLabels.clear();
    this.lines = [];
    this.indent = 0;

    // The module's own bindings are counted first and become the globals; counting also assigns
    // every function its id, which the closure references below depend on.
    this.countBindings(module.statements);
    this.globalMap = this.slotMap;
    this.globalCount = this.slotCount;
    // A zero-length array is not valid C11, and a program with no module-level binding is.
    const globalSlots = Math.max(this.globalCount, 1);

    const functionLines = this.emitFunctionUnits();
    const mainLines = this.emitMain(module, globalSlots);

    const out: string[] = ['#include "jsrt_value.h"', '', `JSRT_GLOBALS(${globalSlots});`, ''];
    // One descriptor per class, shared by every instance: the name printed by console.log, the
    // slot count, and the field names in slot order. `const` and file-scope, so it costs nothing
    // per object and `instanceof` will be a pointer comparison when rung 6b needs one.
    for (const [id, cls] of this.classes.entries()) {
      // A zero-length array is not valid C11, and a class with no fields is valid TypeScript. The
      // count is what readers use, so the unread placeholder is harmless.
      const names =
        cls.fields.length === 0 ? '""' : cls.fields.map((f) => cNameLiteral(f.name)).join(', ');
      out.push(`static const char *const _jsrt_fields_${id}[] = {${names}};`);
      out.push(
        `static const JSRTClass _jsrt_class_${id} = {${cNameLiteral(cls.name)}, ` +
          `${cls.fields.length}, _jsrt_fields_${id}};`,
      );
    }
    if (this.classes.length > 0) {
      out.push('');
    }
    // Forward declarations ahead of every definition, so a function can call itself, or one
    // declared further down the file.
    for (const unit of this.functions) {
      out.push(
        `static jsrt_value _jsrt_fn_${unit.id}(uint32_t argc, const jsrt_value *argv, JSRTEnv *env);`,
      );
      out.push(
        `static const JSRTClosure _jsrt_closure_${unit.id} = {_jsrt_fn_${unit.id}, ` +
          `${unit.fn.params.length}, ${cNameLiteral(unit.name)}, NULL};`,
      );
    }
    if (this.functions.length > 0) {
      out.push('');
    }
    out.push(...functionLines, ...mainLines);

    return `${out.join('\n')}\n`;
  }

  private emitMain(module: Module, globalSlots: number): string[] {
    const produced: string[] = [];
    this.lines = produced;
    this.indent = 0;
    this.inFunction = false;
    this.slotMap = this.globalMap;
    this.slotCount = this.globalCount;

    this.appendLine('int main(void) {');
    this.indent++;
    this.appendLine('jsrt_init();', module.span);
    this.appendLine(`JSRT_GLOBALS_ENTER(${globalSlots});`, module.span);
    this.emitHoistedFunctions(module.statements);
    for (const stmt of module.statements) {
      this.emitStatement(stmt);
    }
    // No pop: the globals frame is pushed once and lives as long as the program does.
    this.appendLine('return 0;', module.span);
    this.indent--;
    this.appendLine('}');

    return produced;
  }

  /* Emits every function unit, counting each body immediately before emitting it. The list grows
   * while it is walked, so this is an index loop rather than a `for..of` over a snapshot. */
  private emitFunctionUnits(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.functions.length; i++) {
      const unit = this.functions[i];
      if (unit === undefined) {
        continue;
      }
      out.push(...this.emitFunctionUnit(unit));
    }
    return out;
  }

  private emitFunctionUnit(unit: FunctionUnit): string[] {
    const savedLines = this.lines;
    const savedIndent = this.indent;
    const savedSlotMap = this.slotMap;
    const savedSlotCount = this.slotCount;
    const savedInFunction = this.inFunction;
    const savedEnclosing = this.enclosing;
    const savedLabels = this.usedLabels;
    const savedReturnSlot = this.returnSlot;
    const savedEnvMap = this.envMap;
    const savedCaptureMap = this.captureMap;

    const produced: string[] = [];
    this.lines = produced;
    this.indent = 0;
    this.slotMap = new Map();
    this.slotCount = 0;
    this.inFunction = true;
    this.enclosing = [];
    this.usedLabels = new Set();

    const { fn } = unit;
    this.envMap = new Map(fn.envVars.map((name, index) => [name, index]));
    this.captureMap = new Map(fn.captures.map((c) => [c.name, c]));

    for (const param of fn.params) {
      // A captured parameter lives in the environment, not the frame: one variable, one home.
      if (this.envMap.has(param.name)) {
        continue;
      }
      // `function f(a, a)` is legal in sloppy JavaScript and the later parameter wins; reusing the
      // slot rather than allocating a second one is exactly that rule.
      if (!this.slotMap.has(param.name)) {
        this.slotMap.set(param.name, this.slotCount);
        this.slotCount++;
      }
    }
    this.returnSlot = this.slotCount;
    this.slotCount++;
    this.countBindings(fn.body.statements);

    this.appendLine(
      `static jsrt_value _jsrt_fn_${unit.id}(uint32_t argc, const jsrt_value *argv, JSRTEnv *env) {`,
    );
    this.indent++;
    this.appendLine(`JSRT_FRAME(${this.slotCount});`, fn.span);
    if (fn.envVars.length > 0) {
      // Rooted through the frame, not through a closure: nothing points at this environment until
      // a closure is built from it, and the function reads its own captured locals before then
      // and after every such closure has died (docs/VALUE.md §4.3).
      this.appendLine(`JSRTEnv *_jsrt_env = jsrt_env_new(env, ${fn.envVars.length});`, fn.span);
      this.appendLine('JSRT_FRAME_ENV(_jsrt_env);', fn.span);
    } else if (fn.captures.length === 0) {
      // Nothing reads the incoming environment here. The ABI passes one regardless so `jsrt_call`
      // need not know which kind of closure it holds, so silence it for -Werror.
      this.appendLine('(void)env;', fn.span);
    }
    if (fn.params.length === 0) {
      this.appendLine('(void)argc;');
      this.appendLine('(void)argv;');
    }
    fn.params.forEach((param, index) => {
      // A call site may pass fewer or more arguments than the function declares. `jsrt_arg` makes
      // both a value -- `undefined` and "dropped" -- rather than a read past the end of `argv`.
      this.appendLine(`${this.slotRef(param.name)} = jsrt_arg(argc, argv, ${index});`, param.span);
    });
    this.emitHoistedFunctions(fn.body.statements);
    for (const stmt of fn.body.statements) {
      this.emitStatement(stmt);
    }
    // Falling off the end of a JavaScript function returns `undefined` -- and still has to pop.
    this.appendLine('JSRT_FRAME_POP();', fn.span);
    this.appendLine('return JSRT_UNDEFINED;', fn.span);
    this.indent--;
    this.appendLine('}');
    this.appendLine('');

    this.lines = savedLines;
    this.indent = savedIndent;
    this.slotMap = savedSlotMap;
    this.slotCount = savedSlotCount;
    this.inFunction = savedInFunction;
    this.enclosing = savedEnclosing;
    this.usedLabels = savedLabels;
    this.returnSlot = savedReturnSlot;
    this.envMap = savedEnvMap;
    this.captureMap = savedCaptureMap;

    return produced;
  }

  /* Function declarations bind at the top of their unit, not where they are written, so `f();
   * function f() {}` works. The binding is what hoists; the body is emitted once, elsewhere. */
  private emitHoistedFunctions(statements: readonly Statement[]): void {
    for (const stmt of statements) {
      if (stmt.kind !== 'function-declaration') {
        continue;
      }
      this.appendLine(`${this.slotRef(stmt.name)} = ${this.closureValue(stmt.fn)};`, stmt.span);
    }
  }

  /* Gives a function its id the first time it is counted, and hands back the same id afterwards.
   * The id is what ties `jsrt_closure(&_jsrt_closure_N)` to the definition of `_jsrt_fn_N`. */
  private registerFunction(fn: FunctionExpr, name: string): number {
    const existing = this.functionIds.get(fn);
    if (existing !== undefined) {
      return existing;
    }
    const id = this.functions.length;
    this.functionIds.set(fn, id);
    this.functions.push({ id, fn, name });
    return id;
  }

  private functionId(fn: FunctionExpr): number {
    const id = this.functionIds.get(fn);
    if (id === undefined) {
      throw new Error('function was not registered during counting');
    }
    return id;
  }

  /* Assigns every frame slot before a single line of body is emitted, because JSRT_FRAME(n) is
   * written once at the top and n has to be final by then. Named bindings and short-circuit
   * temporaries share one counter and one frame: both hold jsrt_values the GC must see. */
  private countBindings(statements: readonly Statement[]): void {
    for (const stmt of statements) {
      switch (stmt.kind) {
        case 'declaration':
          if (!this.slotMap.has(stmt.name)) {
            this.slotMap.set(stmt.name, this.slotCount);
            this.slotCount++;
          }
          if (stmt.value.kind === 'function') {
            // Node names a function after the binding it is assigned to: `const mul = () => {}`
            // prints as `[Function: mul]`, not `[Function (anonymous)]`.
            this.registerFunction(stmt.value, stmt.name);
          } else {
            this.countExpression(stmt.value);
          }
          break;
        case 'assignment':
          this.countExpression(stmt.value);
          break;
        case 'expression-statement':
          this.countExpression(stmt.expression);
          break;
        case 'block':
          this.countBindings(stmt.statements);
          break;
        case 'if-statement':
          this.countExpression(stmt.condition);
          this.countBindings(stmt.consequent.statements);
          if (stmt.alternate) {
            this.countBindings(stmt.alternate.statements);
          }
          break;
        case 'while-statement':
        case 'do-while-statement':
          this.countExpression(stmt.condition);
          this.countBindings(stmt.body.statements);
          break;
        case 'for-statement':
          if (stmt.init) {
            this.countBindings([stmt.init]);
          }
          if (stmt.condition) {
            this.countExpression(stmt.condition);
          }
          if (stmt.update) {
            this.countBindings([stmt.update]);
          }
          this.countBindings(stmt.body.statements);
          break;
        case 'switch-statement': {
          // The discriminant needs a slot of its own: it is evaluated ONCE and then compared
          // against every clause, so it has to survive as a rooted value across those tests.
          this.switchSlots.set(stmt, this.slotCount);
          this.slotCount++;
          this.countExpression(stmt.discriminant);
          for (const clause of stmt.clauses) {
            if (clause.test) {
              this.countExpression(clause.test);
            }
            this.countBindings(clause.statements);
          }
          break;
        }
        case 'function-declaration':
          if (!this.slotMap.has(stmt.name)) {
            this.slotMap.set(stmt.name, this.slotCount);
            this.slotCount++;
          }
          this.registerFunction(stmt.fn, stmt.name);
          break;
        case 'return-statement':
          if (stmt.value) {
            this.countExpression(stmt.value);
          }
          break;
        case 'index-assignment':
          this.indexSlots.set(stmt, this.slotCount);
          this.slotCount += 3;
          this.countExpression(stmt.target);
          this.countExpression(stmt.index);
          this.countExpression(stmt.value);
          break;
        case 'for-of-statement':
          this.forOfSlots.set(stmt, this.slotCount);
          this.slotCount++;
          this.countExpression(stmt.iterable);
          // The loop binding is an ordinary frame slot: the body may capture it, and countBindings
          // is what gives a name storage.
          if (!this.slotMap.has(stmt.binding)) {
            this.slotMap.set(stmt.binding, this.slotCount);
            this.slotCount++;
          }
          this.countBindings(stmt.body.statements);
          break;
        case 'field-assignment':
          // Target and value each get a rooted slot: C does not fix the order in which it
          // evaluates the arguments to jsrt_object_set, and the target has to stay reachable
          // while the value -- which may allocate -- is computed.
          this.indexSlots.set(stmt, this.slotCount);
          this.slotCount += 2;
          this.countExpression(stmt.target);
          this.countExpression(stmt.value);
          break;
        case 'class-declaration':
          // A class occupies no frame slot: it is not a value in this subset. What counting does
          // here is claim the descriptor's identity and register the member functions, which are
          // emitted as ordinary units with the receiver as parameter zero.
          if (!this.classIds.has(stmt.name)) {
            this.classIds.set(stmt.name, this.classes.length);
            this.classes.push(stmt);
          }
          if (stmt.ctor !== undefined) {
            this.registerFunction(stmt.ctor.fn, stmt.name);
          }
          for (const method of stmt.methods) {
            this.registerFunction(method.fn, method.name);
          }
          break;
        case 'break-statement':
        case 'continue-statement':
          break;
        default: {
          const _exhaustive: never = stmt;
          throw new Error(
            `Unknown statement kind: ${(_exhaustive as unknown as { kind?: string }).kind}`,
          );
        }
      }
    }
  }

  private countExpression(expr: Expression): void {
    switch (expr.kind) {
      case 'logical-op':
        this.tempSlots.set(expr, this.slotCount);
        this.slotCount++;
        this.countExpression(expr.left);
        this.countExpression(expr.right);
        break;
      case 'binary-op':
        this.binarySlots.set(expr, this.slotCount);
        this.slotCount += 2;
        this.countExpression(expr.left);
        this.countExpression(expr.right);
        break;
      case 'unary-op':
      case 'string-length':
      case 'array-length':
        this.countExpression(expr.operand);
        break;
      case 'array-literal':
        this.arraySlots.set(expr, this.slotCount);
        this.slotCount += expr.elements.length;
        for (const element of expr.elements) {
          this.countExpression(element);
        }
        break;
      case 'index-access':
        this.indexSlots.set(expr, this.slotCount);
        this.slotCount += 2;
        this.countExpression(expr.target);
        this.countExpression(expr.index);
        break;
      case 'template-literal':
        {
          const count =
            expr.expressions.length + expr.quasis.filter((quasi) => quasi !== '').length;
          // TemplateExpression always has a substitution, so count cannot be zero; keep the
          // guard to make a hand-built invalid HIR fail in the emitter rather than emit slot -1.
          if (count === 0) {
            throw new Error('template literal has no parts; verifier should have caught it');
          }
          this.templateSlots.set(expr, { base: this.slotCount, count });
          this.slotCount += count;
        }
        for (const part of expr.expressions) {
          this.countExpression(part);
        }
        break;
      case 'console-log':
        for (const arg of expr.args) {
          this.countExpression(arg);
        }
        break;
      case 'function':
        // Registered, not descended into: the body's slots belong to its own frame and are counted
        // when its unit is emitted.
        this.registerFunction(expr, expr.name ?? '');
        break;
      case 'call':
        // 1 + argc CONTIGUOUS slots -- the callee, then each argument -- so `argv` can point at the
        // first argument slot and every operand already evaluated stays rooted while the rest run.
        this.callSlots.set(expr, this.slotCount);
        this.slotCount += 1 + expr.args.length;
        this.countExpression(expr.callee);
        for (const arg of expr.args) {
          this.countExpression(arg);
        }
        break;
      // `new` and a method call share the call layout: the RECEIVER occupies the slot a plain
      // call gives the callee, so `argv` still points at one contiguous run and the callee's
      // parameter zero is the object. For `new` that slot is also the result.
      case 'new':
      case 'method-call':
        this.callSlots.set(expr, this.slotCount);
        this.slotCount += 1 + expr.args.length;
        if (expr.kind === 'method-call') {
          this.countExpression(expr.target);
        }
        for (const arg of expr.args) {
          this.countExpression(arg);
        }
        break;
      // No slot: the read is a dereference with nothing allocated between evaluating the target
      // and using it, so there is no window in which the object could go unrooted.
      case 'field-access':
        this.countExpression(expr.target);
        break;
      case 'number-literal':
      case 'string-literal':
      case 'boolean-literal':
      case 'null-literal':
      case 'undefined-literal':
      case 'identifier':
        break;
      default: {
        const _exhaustive: never = expr;
        throw new Error(
          `Unknown expression kind: ${(_exhaustive as unknown as { kind?: string }).kind}`,
        );
      }
    }
  }

  private emitStatement(stmt: Statement): void {
    switch (stmt.kind) {
      case 'declaration': {
        const value = this.emitExpression(stmt.value);
        this.appendLine(`${this.slotRef(stmt.name)} = ${value};`, stmt.span);
        break;
      }

      case 'assignment': {
        const value = this.emitExpression(stmt.value);
        this.appendLine(`${this.slotRef(stmt.target)} = ${value};`, stmt.span);
        break;
      }

      case 'expression-statement': {
        const expr = this.emitExpression(stmt.expression);
        this.appendLine(`${expr};`, stmt.span);
        break;
      }

      case 'if-statement': {
        const cond = this.emitExpression(stmt.condition);
        // ToBoolean, not the bool payload: `jsrt_as_bool` reads bit 0, which for a boxed double
        // is a mantissa bit. `if (1)` took the else branch until this was `jsrt_truthy`.
        this.appendLine(`if (jsrt_truthy(${cond})) {`, stmt.span);
        this.indent++;
        for (const s of stmt.consequent.statements) {
          this.emitStatement(s);
        }
        this.indent--;
        if (stmt.alternate) {
          this.appendLine('} else {', stmt.span);
          this.indent++;
          for (const s of stmt.alternate.statements) {
            this.emitStatement(s);
          }
          this.indent--;
        }
        this.appendLine('}', stmt.span);
        break;
      }

      case 'while-statement': {
        const id = this.enterLoop(stmt.label);
        const cond = this.emitExpression(stmt.condition);
        this.appendLine(`while (jsrt_truthy(${cond})) {`, stmt.span);
        this.indent++;
        for (const s of stmt.body.statements) {
          this.emitStatement(s);
        }
        this.emitJumpTarget(`cont_${id}`, stmt.span);
        this.indent--;
        this.appendLine('}', stmt.span);
        this.emitJumpTarget(`brk_${id}`, stmt.span);
        this.enclosing.pop();
        break;
      }

      case 'do-while-statement': {
        const id = this.enterLoop(stmt.label);
        this.appendLine('do {', stmt.span);
        this.indent++;
        for (const s of stmt.body.statements) {
          this.emitStatement(s);
        }
        // `continue` in a do/while jumps to the TEST, not past it -- the loop still gets to decide
        // whether to run again. Placing the target at the end of the body is what achieves that.
        this.emitJumpTarget(`cont_${id}`, stmt.span);
        this.indent--;
        const cond = this.emitExpression(stmt.condition);
        this.appendLine(`} while (jsrt_truthy(${cond}));`, stmt.span);
        this.emitJumpTarget(`brk_${id}`, stmt.span);
        this.enclosing.pop();
        break;
      }

      case 'for-statement': {
        const id = this.enterLoop(stmt.label);
        if (stmt.init) {
          this.emitStatement(stmt.init);
        }
        // An absent condition is an infinite loop, not a false one. `while (1)` rather than
        // synthesising a `true` literal, so nothing downstream has to evaluate a fake node.
        const cond =
          stmt.condition === undefined
            ? '1'
            : `jsrt_truthy(${this.emitExpression(stmt.condition)})`;
        this.appendLine(`while (${cond}) {`, stmt.span);
        this.indent++;
        for (const s of stmt.body.statements) {
          this.emitStatement(s);
        }
        // The continue target sits BEFORE the update, which is the one thing a `for` gets wrong if
        // it is lowered naively: `continue` skips the rest of the body but must still run `i++`,
        // or the loop never terminates.
        this.emitJumpTarget(`cont_${id}`, stmt.span);
        if (stmt.update) {
          this.emitStatement(stmt.update);
        }
        this.indent--;
        this.appendLine('}', stmt.span);
        this.emitJumpTarget(`brk_${id}`, stmt.span);
        this.enclosing.pop();
        break;
      }

      case 'switch-statement': {
        this.emitSwitch(stmt);
        break;
      }

      case 'break-statement':
      case 'continue-statement': {
        const wantsLoop = stmt.kind === 'continue-statement';
        const target = [...this.enclosing]
          .reverse()
          .find(
            (e) =>
              (wantsLoop ? e.isLoop : true) && (stmt.label === undefined || e.label === stmt.label),
          );
        if (target === undefined) {
          // The verifier rejects this as STA4029, so reaching it means the verifier was skipped.
          // Emitting a goto to a label that does not exist would fail in clang instead, against
          // generated C the user never wrote.
          throw new Error(`${stmt.kind} has no enclosing target; verifier should have caught it`);
        }
        const name = `${wantsLoop ? 'cont' : 'brk'}_${target.id}`;
        this.usedLabels.add(name);
        this.appendLine(`goto ${name};`, stmt.span);
        break;
      }

      case 'block': {
        for (const s of stmt.statements) {
          this.emitStatement(s);
        }
        break;
      }

      case 'function-declaration':
        // Nothing here: the binding was emitted at the top of the unit (see emitHoistedFunctions)
        // and the body is a separate C function.
        break;

      case 'index-assignment': {
        const base = this.indexSlots.get(stmt);
        if (base === undefined) {
          throw new Error('index assignment was not registered during counting');
        }
        const target = this.slotAt(base);
        const index = this.slotAt(base + 1);
        const value = this.slotAt(base + 2);
        // Target, index, value -- the order the language evaluates them, spelled out so C cannot
        // choose another, and each landing in a rooted slot before the next one runs.
        this.appendLine(`${target} = ${this.emitExpression(stmt.target)};`, stmt.span);
        this.appendLine(`${index} = ${this.emitExpression(stmt.index)};`, stmt.span);
        this.appendLine(`${value} = ${this.emitExpression(stmt.value)};`, stmt.span);
        this.appendLine(`jsrt_array_set(${target}, ${index}, ${value});`, stmt.span);
        break;
      }

      case 'for-of-statement': {
        const slot = this.forOfSlots.get(stmt);
        if (slot === undefined) {
          throw new Error('for-of has no iterable slot; countBindings missed a node');
        }
        const array = this.slotAt(slot);
        this.appendLine(`${array} = ${this.emitExpression(stmt.iterable)};`, stmt.span);
        const id = this.enterLoop(stmt.label);
        // The length is re-read every iteration, not hoisted: the array iterator compares the
        // cursor against the CURRENT length on each step, so a body that shortens the array must
        // stop early. Hoisting it would walk off the end of a shrunk array.
        const cursor = `jsrt_iter_${id}`;
        this.appendLine(
          `for (uint32_t ${cursor} = 0; ${cursor} < jsrt_as_array(${array})->length; ${cursor}++) {`,
          stmt.span,
        );
        this.indent++;
        this.appendLine(
          `${this.slotRef(stmt.binding)} = jsrt_as_array(${array})->elements[${cursor}];`,
          stmt.span,
        );
        for (const s of stmt.body.statements) {
          this.emitStatement(s);
        }
        this.emitJumpTarget(`cont_${id}`, stmt.span);
        this.indent--;
        this.appendLine('}', stmt.span);
        this.emitJumpTarget(`brk_${id}`, stmt.span);
        this.enclosing.pop();
        break;
      }

      case 'return-statement': {
        if (!this.inFunction) {
          throw new Error('return outside a function; verifier should have caught it');
        }
        if (stmt.value === undefined) {
          this.appendLine('JSRT_FRAME_POP();', stmt.span);
          this.appendLine('return JSRT_UNDEFINED;', stmt.span);
          break;
        }
        const value = this.emitExpression(stmt.value);
        const slot = `JSRT_LOCAL(${this.returnSlot})`;
        // Evaluate into a rooted slot FIRST, pop SECOND, read THIRD. Popping before evaluating
        // would run the expression -- and any allocation in it -- with this frame's locals
        // invisible to the collector.
        this.appendLine(`return (${slot} = ${value}, JSRT_FRAME_POP(), ${slot});`, stmt.span);
        break;
      }

      case 'field-assignment': {
        const base = this.indexSlots.get(stmt);
        if (base === undefined) {
          throw new Error('field assignment was not registered during counting');
        }
        const target = this.slotAt(base);
        const value = this.slotAt(base + 1);
        this.appendLine(
          `${target} = ${this.emitExpression(stmt.target)}, ` +
            `${value} = ${this.emitExpression(stmt.value)}, ` +
            `jsrt_object_set(${target}, ${stmt.slot}, ${value});`,
          stmt.span,
        );
        break;
      }

      // Nothing runs here. A class's descriptor and its member functions are file-scope, and the
      // name is not a binding -- so the declaration's whole effect happened at compile time.
      case 'class-declaration':
        break;

      default: {
        const _exhaustive: never = stmt;
        throw new Error(
          `Unknown statement kind: ${(_exhaustive as unknown as { kind?: string }).kind}`,
        );
      }
    }
  }

  private enterLoop(label?: string): number {
    const id = this.loopCount++;
    this.enclosing.push({ id, isLoop: true, ...(label !== undefined && { label }) });
    return id;
  }

  /* A `label: ;` line, written only if something jumps to it. The trailing `;` is not cosmetic:
   * before C23 a label must be followed by a statement, and a label at the end of a block is not. */
  private emitJumpTarget(name: string, span: Span): void {
    if (this.usedLabels.has(name)) {
      this.appendLine(`${name}: ;`, span);
    }
  }

  /* A JavaScript switch is not a C switch and cannot be emitted as one. C requires integer
   * constant cases; JS compares with STRICT EQUALITY against arbitrary expressions, so
   * `case 'x'` and `case n + 1` are both legal. JS also tries `default` LAST no matter where it
   * appears, while still falling through from whatever clause precedes it textually.
   *
   * All three fall out of one shape: run every case test in source order, jump to the matching
   * clause, and lay the clause bodies out in source order so fall-through is simply not jumping. */
  private emitSwitch(stmt: SwitchStatement): void {
    const id = this.loopCount++;
    // A switch is breakable but not continuable: `continue` inside one belongs to the enclosing
    // loop, which is why this pushes isLoop: false rather than reusing enterLoop.
    this.enclosing.push({
      id,
      isLoop: false,
      ...(stmt.label !== undefined && { label: stmt.label }),
    });

    const slot = this.switchSlots.get(stmt);
    if (slot === undefined) {
      throw new Error('switch has no discriminant slot; countBindings missed a node');
    }
    const disc = this.slotAt(slot);
    this.appendLine(`${disc} = ${this.emitExpression(stmt.discriminant)};`, stmt.span);

    let defaultIndex: number | undefined;
    stmt.clauses.forEach((clause, i) => {
      if (clause.test === undefined) {
        defaultIndex = i;
        return;
      }
      const test = this.emitExpression(clause.test);
      this.appendLine(`if (jsrt_strict_equals(${disc}, ${test})) goto case_${id}_${i};`, stmt.span);
    });

    // Every test failed. `default` is the fallback wherever it was written; with no default at
    // all, the whole statement is skipped.
    if (defaultIndex === undefined) {
      this.usedLabels.add(`brk_${id}`);
      this.appendLine(`goto brk_${id};`, stmt.span);
    } else {
      this.appendLine(`goto case_${id}_${defaultIndex};`, stmt.span);
    }

    stmt.clauses.forEach((clause, i) => {
      // Unconditional: every clause label is the target of either its own test or the default
      // jump above, so none of them can be unused.
      this.appendLine(`case_${id}_${i}: ;`, stmt.span);
      this.indent++;
      for (const s of clause.statements) {
        this.emitStatement(s);
      }
      this.indent--;
    });

    this.emitJumpTarget(`brk_${id}`, stmt.span);
    this.enclosing.pop();
  }

  private emitExpression(expr: Expression): string {
    switch (expr.kind) {
      case 'number-literal': {
        return `jsrt_number(${cDoubleLiteral(expr.value)})`;
      }

      case 'string-literal': {
        return this.emitStringLiteral(expr.value);
      }

      case 'boolean-literal': {
        return `jsrt_bool(${expr.value ? 'true' : 'false'})`;
      }

      case 'null-literal': {
        return 'JSRT_NULL';
      }

      case 'undefined-literal': {
        return 'JSRT_UNDEFINED';
      }

      case 'identifier': {
        return this.slotRef(expr.name);
      }

      case 'binary-op': {
        return this.emitBinaryOp(expr);
      }

      case 'unary-op': {
        return UNARY_EMITTERS[expr.operator](this.emitExpression(expr.operand));
      }

      case 'logical-op': {
        return this.emitLogicalOp(expr);
      }

      case 'template-literal': {
        return this.emitTemplateLiteral(expr);
      }

      case 'string-length': {
        return `jsrt_number((double)jsrt_string_length(${this.emitExpression(expr.operand)}))`;
      }

      case 'console-log': {
        const consoleLog = expr as Extract<Expression, { kind: 'console-log' }>;
        const [arg] = consoleLog.args;
        if (consoleLog.args.length !== 1 || arg === undefined) {
          throw new Error(`console.log requires exactly 1 argument, got ${consoleLog.args.length}`);
        }
        const argC = this.emitExpression(arg);
        return `jsrt_print(${argC})`;
      }

      case 'function': {
        return this.closureValue(expr);
      }

      case 'array-length':
        return `jsrt_array_length(${this.emitExpression(expr.operand)})`;

      case 'array-literal': {
        const base = this.arraySlots.get(expr);
        if (base === undefined) {
          throw new Error('array literal was not registered during counting');
        }
        if (expr.elements.length === 0) {
          return 'jsrt_array_new(0, NULL)';
        }
        const parts = expr.elements.map(
          (element, i) => `${this.slotAt(base + i)} = ${this.emitExpression(element)}`,
        );
        parts.push(`jsrt_array_new(${expr.elements.length}, &${this.slotAt(base)})`);
        return `(${parts.join(', ')})`;
      }

      case 'index-access': {
        const base = this.indexSlots.get(expr);
        if (base === undefined) {
          throw new Error('index access was not registered during counting');
        }
        const target = this.slotAt(base);
        const index = this.slotAt(base + 1);
        return `(${target} = ${this.emitExpression(expr.target)}, ${index} = ${this.emitExpression(expr.index)}, jsrt_array_get(${target}, ${index}))`;
      }

      case 'call': {
        const base = this.callSlots.get(expr);
        if (base === undefined) {
          throw new Error('call was not registered during counting');
        }
        // Callee first, then arguments left to right -- the evaluation order the language
        // specifies, made explicit by a comma expression so C cannot choose another.
        const parts = [`${this.slotAt(base)} = ${this.emitExpression(expr.callee)}`];
        expr.args.forEach((arg, index) => {
          parts.push(`${this.slotAt(base + 1 + index)} = ${this.emitExpression(arg)}`);
        });
        const argv = expr.args.length === 0 ? 'NULL' : `&${this.slotAt(base + 1)}`;
        parts.push(`jsrt_call(${this.slotAt(base)}, ${expr.args.length}, ${argv})`);
        return `(${parts.join(', ')})`;
      }

      case 'field-access': {
        return `jsrt_object_get(${this.emitExpression(expr.target)}, ${expr.slot})`;
      }

      case 'new': {
        const base = this.callSlots.get(expr);
        if (base === undefined) {
          throw new Error('new was not registered during counting');
        }
        const cls = this.classAt(expr.className);
        const object = this.slotAt(base);
        // The object is created first and lands in the slot the constructor will receive as
        // argument zero, so it is rooted before any argument -- which may allocate -- is
        // evaluated. The whole expression yields that slot, not the constructor's return value:
        // `new` in JavaScript ignores what a constructor returns unless it returns an object,
        // and this subset's constructors cannot return one.
        const parts = [
          `${object} = jsrt_object_new(&_jsrt_class_${String(this.classIds.get(expr.className))})`,
        ];
        expr.args.forEach((arg, index) => {
          parts.push(`${this.slotAt(base + 1 + index)} = ${this.emitExpression(arg)}`);
        });
        if (cls.ctor !== undefined) {
          parts.push(
            `jsrt_call(${this.closureValue(cls.ctor.fn)}, ${1 + expr.args.length}, &${object})`,
          );
        }
        parts.push(object);
        return `(${parts.join(', ')})`;
      }

      case 'method-call': {
        const base = this.callSlots.get(expr);
        if (base === undefined) {
          throw new Error('method call was not registered during counting');
        }
        const method = this.classAt(expr.className).methods.find((m) => m.name === expr.method);
        if (method === undefined) {
          throw new Error(`class ${expr.className} has no method ${expr.method}`);
        }
        // Receiver first, then arguments left to right -- the same order and the same contiguous
        // argv as a plain call, with the receiver where the callee slot would be.
        const parts = [`${this.slotAt(base)} = ${this.emitExpression(expr.target)}`];
        expr.args.forEach((arg, index) => {
          parts.push(`${this.slotAt(base + 1 + index)} = ${this.emitExpression(arg)}`);
        });
        parts.push(
          `jsrt_call(${this.closureValue(method.fn)}, ${1 + expr.args.length}, &${this.slotAt(base)})`,
        );
        return `(${parts.join(', ')})`;
      }

      default: {
        const _exhaustive: never = expr;
        throw new Error(
          `Unknown expression kind: ${(_exhaustive as unknown as { kind?: string }).kind}`,
        );
      }
    }
  }

  /* The declaration a class name refers to. A miss means counting and emission disagree about
   * which classes exist, which is an emitter bug rather than anything the program did. */
  private classAt(name: string): ClassDeclaration {
    const id = this.classIds.get(name);
    const cls = id === undefined ? undefined : this.classes[id];
    if (cls === undefined) {
      throw new Error(`class ${name} was not registered during counting`);
    }
    return cls;
  }

  /* `a && b` is `let t = a; t ? b : t` -- the result is an OPERAND, not a boolean, and the right
   * side runs only sometimes. Both facts force a temporary: the left operand is tested and then
   * possibly returned, and evaluating it twice would duplicate its side effects.
   *
   * The temporary is a frame slot rather than a C local because C has no expression-level
   * declaration, and because a value the GC cannot see is a value it can collect. The comma
   * operator sequences the store before the test, so evaluation order is left-then-branch. */
  /* Folds to a left-nested chain of `jsrt_string_concat`. Each hole goes through `jsrt_to_string`
   * explicitly rather than through `+`: template substitution is defined as ToString, whereas `+`
   * would run ToPrimitive with hint default and consult `valueOf` first once objects exist.
   *
   * Empty literal chunks are dropped -- `` `${a}${b}` `` has three of them and concatenating with
   * "" is a no-op -- except when that would leave nothing at all, since `` `` `` is the empty
   * string and still has to produce a value. */
  private emitTemplateLiteral(expr: TemplateLiteral): string {
    const slots = this.templateSlots.get(expr);
    if (slots === undefined) {
      throw new Error('template literal has no frame slots; countExpression missed a node');
    }

    const parts: string[] = [];
    expr.quasis.forEach((quasi, i) => {
      if (quasi !== '') {
        parts.push(this.emitStringLiteral(quasi));
      }
      const hole = expr.expressions[i];
      if (hole !== undefined) {
        parts.push(`jsrt_to_string(${this.emitExpression(hole)})`);
      }
    });

    if (parts.length !== slots.count) {
      throw new Error('template literal part count disagrees with its frame-slot count');
    }
    const first = this.slotAt(slots.base);
    const sequence: string[] = parts.map(
      (part, index) => `${this.slotAt(slots.base + index)} = ${part}`,
    );
    for (let index = 1; index < parts.length; index++) {
      sequence.push(`${first} = jsrt_string_concat(${first}, ${this.slotAt(slots.base + index)})`);
    }
    sequence.push(first);
    return `(${sequence.join(', ')})`;
  }

  private emitBinaryOp(expr: BinaryOp): string {
    const base = this.binarySlots.get(expr);
    if (base === undefined) {
      throw new Error('binary operator has no frame slots; countExpression missed a node');
    }
    const left = this.slotAt(base);
    const right = this.slotAt(base + 1);
    const result = BINARY_EMITTERS[expr.operator](left, right);
    // The comma operator sequences the assignments. Calling jsrt_op_* directly with the emitted
    // child expressions would revive C's unspecified argument order and could collect a temporary
    // from the left while evaluating the right.
    return `(${left} = ${this.emitExpression(expr.left)}, ${right} = ${this.emitExpression(expr.right)}, ${result})`;
  }

  private emitStringLiteral(value: string): string {
    return `jsrt_string_from_utf8("${this.escapeString(value)}", ${Buffer.byteLength(value, 'utf8')})`;
  }

  private emitLogicalOp(expr: LogicalOp): string {
    const slot = this.tempSlots.get(expr);
    if (slot === undefined) {
      throw new Error('short-circuit operator has no frame slot; countExpression missed a node');
    }
    const temp = this.slotAt(slot);
    const left = this.emitExpression(expr.left);
    const right = this.emitExpression(expr.right);

    // `??` tests nullish, NOT falsy: `0 ?? 1` is 0 while `0 || 1` is 1.
    // `||` is the odd one out: it is the only operator here whose test passing means "keep the
    // left operand". `&&` and `??` both mean "the left operand was unsatisfying, take the right".
    const test = expr.operator === '??' ? `jsrt_is_nullish(${temp})` : `jsrt_truthy(${temp})`;
    const whenTrue = expr.operator === '||' ? temp : right;
    const whenFalse = expr.operator === '||' ? right : temp;

    return `(${temp} = ${left}, ${test} ? (${whenTrue}) : (${whenFalse}))`;
  }

  private escapeString(s: string): string {
    let result = '';
    for (const char of s) {
      const code = char.charCodeAt(0);
      if (char === '\\') {
        result += '\\\\';
      } else if (char === '"') {
        result += '\\"';
      } else if (char === '\n') {
        result += '\\n';
      } else if (char === '\t') {
        result += '\\t';
      } else if (char === '\r') {
        result += '\\r';
      } else if (code < 0x20 || code >= 0x7f) {
        // For bytes >= 0x80 (UTF-8 multi-byte), emit raw UTF-8
        // For control chars < 0x20, use octal escapes
        if (code < 0x20) {
          result += `\\${code.toString(8).padStart(3, '0')}`;
        } else {
          result += char;
        }
      } else {
        result += char;
      }
    }
    return result;
  }

  /* The C lvalue for a slot of the unit being emitted. Same slot number, different array: a
   * function's slots are its stack frame, the module's are the file-static globals. */
  private slotAt(slot: number): string {
    return this.inFunction ? `JSRT_LOCAL(${slot})` : `JSRT_GLOBAL(${slot})`;
  }

  /* Where a name lives, in the order storage is assigned to it: this function's own environment,
   * an enclosing environment, this function's frame, or the module's globals. The environment
   * cases come FIRST -- a captured binding was deliberately kept out of the frame, so a frame slot
   * of the same name would be a second, silently divergent copy of one variable. */
  private slotRef(name: string): string {
    const owned = this.envMap.get(name);
    if (owned !== undefined) {
      return `_jsrt_env->slots[${owned}]`;
    }
    const captured = this.captureMap.get(name);
    if (captured !== undefined) {
      return `JSRT_ENV_AT(env, ${captured.levels}, ${captured.index})`;
    }
    const own = this.slotMap.get(name);
    if (own !== undefined) {
      return this.slotAt(own);
    }
    const global = this.globalMap.get(name);
    if (global === undefined) {
      throw new Error(`Undefined identifier: ${name}`);
    }
    return `JSRT_GLOBAL(${global})`;
  }

  /* The environment a closure created HERE should capture: this function's own if it has one,
   * otherwise the one it was handed. NULL at module level, where bindings are globals already. */
  private currentEnv(): string {
    if (this.envMap.size > 0) {
      return '_jsrt_env';
    }
    return this.inFunction ? 'env' : 'NULL';
  }

  /* A function that captures nothing stays rung 4a's file-static constant -- no allocation. One
   * that does is built per evaluation, which is what makes two evaluations of the same function
   * expression close over different variables. */
  private closureValue(fn: FunctionExpr): string {
    const id = this.functionId(fn);
    if (!fn.needsEnv) {
      return `jsrt_closure(&_jsrt_closure_${id})`;
    }
    const name = cNameLiteral(fn.name ?? '');
    return `jsrt_closure_new(_jsrt_fn_${id}, ${fn.params.length}, ${name}, ${this.currentEnv()})`;
  }

  private appendLine(line: string, span?: Span): void {
    const indentStr = '  '.repeat(this.indent);
    let fullLine = indentStr + line;

    // Add #line directive before statements (but not for braces/empty lines)
    if (span && line && !line.startsWith('}')) {
      const escapedFile = this.escapeFilePath(this.fileName);
      fullLine = `#line ${span.line} "${escapedFile}"\n${fullLine}`;
    }

    this.lines.push(fullLine);
  }

  private escapeFilePath(path: string): string {
    return path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}

export function emitC(module: Module): string {
  const emitter = new Emitter();
  return emitter.emit(module);
}

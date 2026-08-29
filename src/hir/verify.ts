/** HIR verifier (plan.md §5 Task 2.3).
 *
 * Checks at minimum:
 * - every node carries an HType (no missing/undefined types)
 * - operand agreement: arithmetic operands are `number`; comparison operands agree
 * - if/while conditions are `boolean`
 * - result type of each expression matches its operator
 * - assignment target type matches the assigned value's type
 * - every identifier reference resolves to a binding declared before use
 *
 * Returns a list of problems (does not throw). Each problem is actionable:
 * includes the offending node's kind and span.
 */

import type {
  Assignment,
  BinaryOp,
  Block,
  ConsoleLogCall,
  Declaration,
  Expression,
  ExpressionStatement,
  FunctionExpr,
  Identifier,
  IfStatement,
  Module,
  Span,
  Statement,
} from './nodes.ts';
import type { HType } from './types.ts';
import {
  fieldSlot,
  H_BOOLEAN,
  H_NUMBER,
  H_STRING,
  hTypeEquals,
  hTypeName,
  hUnknown,
  methodOf,
} from './types.ts';

/** A verifier problem is always a compiler bug, never a user error: the gate accepted the source
 * and the lowering produced this HIR, so a failure here means one of them is wrong. Hence the
 * STA4xxx codes. The code is a field, not text inside the message, because tests reference codes
 * and message wording is free to change (docs/DIAGNOSTICS.md). */
export interface VerifyProblem {
  readonly kind: string; // node.kind for context
  readonly code: string;
  readonly span: Span;
  readonly message: string;
}

/** One enclosing loop or switch, innermost last.
 *
 * `isLoop` is what separates the two jumps: `break` may leave either, `continue` may only leave a
 * loop — so `continue` inside a `switch` inside a `for` targets the `for`, skipping the switch.
 * Getting this wrong does not produce a wrong answer, it produces a `goto` to a label the emitter
 * never wrote, which surfaces as a clang error against generated C. */
interface Enclosing {
  readonly label?: string;
  readonly isLoop: boolean;
  /** A function body's boundary, pushed as the sole entry when one is entered. It is not a jump
   * target -- it is a wall: `break` and `continue` skip it (and so find nothing, which is the
   * right answer), while `return` looks for exactly it. */
  readonly isFunction?: boolean;
}

export function verifyHir(module: Module): readonly VerifyProblem[] {
  const problems: VerifyProblem[] = [];
  const bindings = new Map<string, { kind: 'let' | 'const'; type: HType }>();

  verifyModule(module, problems, bindings);

  return problems;
}

function verifyModule(
  module: Module,
  problems: VerifyProblem[],
  bindings: Map<string, { kind: 'let' | 'const'; type: HType }>,
): void {
  // Check module itself has a type
  if (!module.type) {
    problems.push({
      kind: 'module',
      span: module.span,
      code: 'STA4020',
      message: 'module node missing HType',
    });
  }

  // Verify all statements
  hoistFunctions(module.statements, bindings);
  for (const stmt of module.statements) {
    verifyStatement(stmt, problems, bindings);
  }
}

/** Mirrors the lowering's hoist: a function declaration's binding exists for the whole body it is
 * declared in, not from its own line down. Without this a legal forward call is reported as an
 * undefined identifier (STA4002) by the verifier alone. */
function hoistFunctions(
  statements: readonly Statement[],
  bindings: Map<string, { kind: 'let' | 'const'; type: HType }>,
): void {
  for (const stmt of statements) {
    if (stmt.kind === 'function-declaration') {
      bindings.set(stmt.name, { kind: 'const', type: stmt.fn.type });
    }
  }
}

/** Only an array can be indexed, and only Unknown may pretend to be one.
 *
 * The Unknown exemption is the same one calls get (STA4041): in js mode indexing an unresolved
 * value is the whole point, and the runtime decides. A CONCRETE non-array target means the
 * lowering built an index the checker would already have rejected. */
function checkIndexable(
  target: Expression,
  kind: 'index-access' | 'index-assignment',
  code: 'STA4044',
  problems: VerifyProblem[],
): void {
  if (target.type.kind !== 'array' && target.type.kind !== 'unknown') {
    problems.push({
      kind,
      span: target.span,
      code,
      message: `index target has type '${hTypeName(target.type)}', which is not indexable`,
    });
  }
}

/** The stored slot still names `field` in the target's class.
 *
 * This is the whole reason FieldAccess carries a slot instead of the emitter recomputing one: a
 * recomputed index is right by construction and therefore unfalsifiable, while a stored one can be
 * checked against the layout it claims to index -- and a disagreement between the lowering's field
 * order and the type's is a silent read of the wrong field, which is the worst bug this pass can
 * catch. */
function checkField(
  target: Expression,
  field: string,
  slot: number,
  kind: 'field-access' | 'field-assignment',
  problems: VerifyProblem[],
): void {
  if (target.type.kind !== 'object') {
    problems.push({
      kind,
      span: target.span,
      code: 'STA4046',
      message: `field target has type '${hTypeName(target.type)}', which has no fields`,
    });
    return;
  }
  if (fieldSlot(target.type, field) !== slot) {
    problems.push({
      kind,
      span: target.span,
      code: 'STA4046',
      message: `field '${field}' is not slot ${String(slot)} of ${target.type.name}`,
    });
  }
}

/** Separate from checkIndexable because the emitted loop is different, not just the message: a
 * for-of over an array compiles to a counted loop, and there is no other iterable in the subset. */
function checkIterable(iterable: Expression, problems: VerifyProblem[]): void {
  if (iterable.type.kind !== 'array' && iterable.type.kind !== 'unknown') {
    problems.push({
      kind: 'for-of-statement',
      span: iterable.span,
      code: 'STA4045',
      message: `for-of iterable has type '${hTypeName(iterable.type)}', which is not an array`,
    });
  }
}

function verifyStatement(
  stmt: Statement,
  problems: VerifyProblem[],
  bindings: Map<string, { kind: 'let' | 'const'; type: HType }>,
  enclosing: readonly Enclosing[] = [],
): void {
  // Check statement has a type
  if (!stmt.type) {
    problems.push({
      kind: stmt.kind,
      span: stmt.span,
      code: 'STA4020',
      message: `${stmt.kind} node missing HType`,
    });
    return; // can't continue without a type
  }

  switch (stmt.kind) {
    case 'declaration': {
      const decl = stmt as Declaration;
      verifyExpression(decl.value, problems, bindings);
      // Register the binding for future reference
      bindings.set(decl.name, { kind: decl.declKind, type: decl.type });
      break;
    }

    case 'assignment': {
      const assign = stmt as Assignment;
      verifyExpression(assign.value, problems, bindings);

      // Check that the target is a known binding
      const binding = bindings.get(assign.target);
      if (!binding) {
        problems.push({
          kind: 'assignment',
          span: assign.span,
          code: 'STA4003',
          message: `identifier '${assign.target}' assigned before declaration`,
        });
        break;
      }

      // Check that the value type matches the target type. An Unknown target accepts anything --
      // that is what the dynamic path IS, and it is the same exemption a call's callee gets
      // (STA4041): a binding declared `string | number` is Unknown here, and every assignment to
      // it is legal precisely because nothing was promised about it.
      if (binding.type.kind !== 'unknown' && !hTypeEquals(assign.value.type, binding.type)) {
        problems.push({
          kind: 'assignment',
          span: assign.span,
          code: 'STA4004',
          message: `assignment target type ${hTypeName(binding.type)} does not match value type ${hTypeName(assign.value.type)}`,
        });
      }
      break;
    }

    case 'expression-statement': {
      const exprStmt = stmt as ExpressionStatement;
      verifyExpression(exprStmt.expression, problems, bindings);
      break;
    }

    case 'if-statement': {
      const ifStmt = stmt as IfStatement;
      verifyExpression(ifStmt.condition, problems, bindings);

      // No type rule on the condition. `if (x)` applies ToBoolean, which is total: every value
      // is either truthy or falsy, so there is nothing here for the verifier to reject. The
      // former "condition must be boolean" check (STA4005, retired) was an artifact of the
      // walking skeleton testing the boxed value's low bit instead.

      // Create a new scope for the if block
      const thenBindings = new Map(bindings);
      verifyBlock(ifStmt.consequent, problems, thenBindings, enclosing);

      if (ifStmt.alternate) {
        const elseBindings = new Map(bindings);
        verifyBlock(ifStmt.alternate, problems, elseBindings, enclosing);
      }
      break;
    }

    // The three loops share every rule: ToBoolean on the condition (see the if-statement case,
    // STA4006 retired with STA4005), body verified in the enclosing scope, and the loop itself
    // pushed so `break`/`continue` inside it resolve.
    case 'while-statement':
    case 'do-while-statement':
    case 'for-statement': {
      const inner = [...enclosing, { isLoop: true, ...(stmt.label && { label: stmt.label }) }];
      if (stmt.kind === 'for-statement') {
        // The header's own statements are inside the loop for `break`/`continue` purposes only in
        // the update slot; an init that jumps would be nonsense. Both are verified with the outer
        // scope's bindings, which is also where `let i = 0` registers `i`.
        if (stmt.init) {
          verifyStatement(stmt.init, problems, bindings, enclosing);
        }
        if (stmt.condition) {
          verifyExpression(stmt.condition, problems, bindings);
        }
        if (stmt.update) {
          verifyStatement(stmt.update, problems, bindings, inner);
        }
      } else {
        verifyExpression(stmt.condition, problems, bindings);
      }
      verifyBlock(stmt.body, problems, bindings, inner);
      break;
    }

    case 'switch-statement': {
      verifyExpression(stmt.discriminant, problems, bindings);

      // A switch is breakable but not continuable, so `continue` inside one still targets the
      // enclosing loop. That is the whole reason `isLoop` exists.
      const inner = [...enclosing, { isLoop: false, ...(stmt.label && { label: stmt.label }) }];

      let defaults = 0;
      for (const clause of stmt.clauses) {
        if (clause.test === undefined) {
          defaults++;
        } else {
          verifyExpression(clause.test, problems, bindings);
        }
        // Clauses share one scope: they are not blocks, and a `let` in one is visible in the next.
        for (const child of clause.statements) {
          verifyStatement(child, problems, bindings, inner);
        }
      }
      if (defaults > 1) {
        problems.push({
          kind: 'switch-statement',
          span: stmt.span,
          code: 'STA4040',
          message: `switch has ${defaults} default clauses; at most one is legal`,
        });
      }
      break;
    }

    case 'break-statement':
    case 'continue-statement': {
      // `continue` may only target a loop; `break` may target either. An unlabelled jump takes the
      // innermost candidate, which is why this scans from the end.
      const wantsLoop = stmt.kind === 'continue-statement';
      const target = [...enclosing]
        .reverse()
        .find(
          (e) =>
            e.isFunction !== true &&
            (wantsLoop ? e.isLoop : true) &&
            (stmt.label === undefined || e.label === stmt.label),
        );
      if (target === undefined) {
        const what = stmt.label === undefined ? 'an enclosing' : `a labelled '${stmt.label}'`;
        problems.push({
          kind: stmt.kind,
          span: stmt.span,
          code: 'STA4029',
          message: `${stmt.kind === 'break-statement' ? 'break' : 'continue'} has no ${what} ${wantsLoop ? 'loop' : 'loop or switch'} to jump out of`,
        });
      }
      break;
    }

    case 'block': {
      const block = stmt as Block;
      verifyBlock(block, problems, bindings, enclosing);
      break;
    }

    case 'function-declaration': {
      // The binding was registered by hoistFunctions before this statement was reached; setting
      // it again here would be the only way a declaration could shadow itself.
      verifyFunction(stmt.fn, problems, bindings);
      break;
    }

    // `a[i] = v`. The three subexpressions are verified in evaluation order -- target, index,
    // value -- which is the order the lowering promised and the emitter must preserve.
    case 'index-assignment': {
      verifyExpression(stmt.target, problems, bindings);
      verifyExpression(stmt.index, problems, bindings);
      verifyExpression(stmt.value, problems, bindings);
      checkIndexable(stmt.target, 'index-assignment', 'STA4044', problems);
      // No element-type rule. `a[i] = v` on a `number[]` with a `v: unknown` is the dynamic path
      // doing its job; the runtime stores whatever it is given, and narrowing is Task 3.5's.
      break;
    }

    // A for-of opens a scope holding exactly one binding, whose type is the iterable's ELEMENT
    // type -- TypeScript models iteration as yielding `T`, not `T | undefined`, because the loop
    // never runs past the end. That is why typed iteration stays on the static path while `a[i]`
    // does not (plan-notes 53).
    case 'for-of-statement': {
      verifyExpression(stmt.iterable, problems, bindings);
      checkIterable(stmt.iterable, problems);
      const inner = [...enclosing, { isLoop: true, ...(stmt.label && { label: stmt.label }) }];
      const scope = new Map(bindings);
      scope.set(stmt.binding, {
        kind: stmt.declKind,
        type: stmt.iterable.type.kind === 'array' ? stmt.iterable.type.element : hUnknown(false),
      });
      verifyBlock(stmt.body, problems, scope, inner);
      break;
    }

    case 'field-assignment': {
      verifyExpression(stmt.target, problems, bindings);
      verifyExpression(stmt.value, problems, bindings);
      checkField(stmt.target, stmt.field, stmt.slot, 'field-assignment', problems);
      // No field-type rule, for the same reason index-assignment has none: narrowing a written
      // value against the slot's declared type is Task 3.5's boundary check, not this pass's.
      break;
    }

    // A class declares no binding this pass can see: the class NAME is not a value in the subset
    // (the gate rejects using one), so what is left to verify is the member functions -- each of
    // which must actually receive the instance it will read fields out of.
    case 'class-declaration': {
      const members = [...(stmt.ctor === undefined ? [] : [stmt.ctor]), ...stmt.methods];
      for (const member of members) {
        const receiver = member.fn.params[0]?.type;
        if (receiver === undefined || receiver.kind !== 'object' || receiver.name !== stmt.name) {
          problems.push({
            kind: 'class-declaration',
            span: member.fn.span,
            code: 'STA4049',
            message: `${stmt.name}.${member.name} does not take ${stmt.name} as its receiver`,
          });
        }
        verifyFunction(member.fn, problems, bindings);
      }
      break;
    }

    case 'return-statement': {
      // `enclosing` is reset to a lone 'function' marker when a body is entered, so a `return`
      // that is lexically inside a loop but outside any function is still caught here.
      if (!enclosing.some((e) => e.isFunction === true)) {
        problems.push({
          kind: 'return-statement',
          span: stmt.span,
          code: 'STA4042',
          message: 'return statement outside a function',
        });
      }
      if (stmt.value !== undefined) {
        verifyExpression(stmt.value, problems, bindings);
      }
      break;
    }

    default: {
      const _exhaustive: never = stmt;
      throw new Error(`Exhaustiveness check failed: ${_exhaustive}`);
    }
  }
}

function verifyBlock(
  block: Block,
  problems: VerifyProblem[],
  bindings: Map<string, { kind: 'let' | 'const'; type: HType }>,
  enclosing: readonly Enclosing[] = [],
): void {
  // Check block has a type
  if (!block.type) {
    problems.push({
      kind: 'block',
      span: block.span,
      code: 'STA4020',
      message: 'block node missing HType',
    });
  }

  // Create a new scope for this block
  const blockBindings = new Map(bindings);
  hoistFunctions(block.statements, blockBindings);
  for (const stmt of block.statements) {
    verifyStatement(stmt, problems, blockBindings, enclosing);
  }
}

/** A function body is a scope of its own, not a nested block of the caller's.
 *
 * Bindings are copied in rather than shared because rung 4a has no captures: what the copy
 * carries is the module-level bindings the gate already proved are the only outer names the body
 * can name. `enclosing` restarts at ['function'] so a `break` cannot escape into the enclosing
 * function's loop, and a `return` inside the body is recognised as in-function. */
function verifyFunction(
  fn: FunctionExpr,
  problems: VerifyProblem[],
  bindings: Map<string, { kind: 'let' | 'const'; type: HType }>,
): void {
  const inner = new Map(bindings);
  for (const param of fn.params) {
    inner.set(param.name, { kind: 'let', type: param.type });
  }
  verifyBlock(fn.body, problems, inner, [{ isLoop: false, isFunction: true }]);
}

function verifyExpression(
  expr: Expression,
  problems: VerifyProblem[],
  bindings: Map<string, { kind: 'let' | 'const'; type: HType }>,
): void {
  // Check expression has a type
  if (!expr.type) {
    problems.push({
      kind: expr.kind,
      span: expr.span,
      code: 'STA4020',
      message: `${expr.kind} expression missing HType`,
    });
    return; // can't continue without a type
  }

  switch (expr.kind) {
    case 'number-literal': {
      // Number literal must have type number
      if (!hTypeEquals(expr.type, H_NUMBER)) {
        problems.push({
          kind: 'number-literal',
          span: expr.span,
          code: 'STA4007',
          message: `number-literal must have type 'number', got '${hTypeName(expr.type)}'`,
        });
      }
      break;
    }

    case 'string-literal': {
      // String literal must have type string
      if (expr.type.kind !== 'string') {
        problems.push({
          kind: 'string-literal',
          span: expr.span,
          code: 'STA4008',
          message: `string-literal must have type 'string', got '${hTypeName(expr.type)}'`,
        });
      }
      break;
    }

    case 'boolean-literal': {
      // Boolean literal must have type boolean
      if (!hTypeEquals(expr.type, H_BOOLEAN)) {
        problems.push({
          kind: 'boolean-literal',
          span: expr.span,
          code: 'STA4009',
          message: `boolean-literal must have type 'boolean', got '${hTypeName(expr.type)}'`,
        });
      }
      break;
    }

    case 'null-literal': {
      if (expr.type.kind !== 'null') {
        problems.push({
          kind: 'null-literal',
          span: expr.span,
          code: 'STA4022',
          message: `null-literal must have type 'null', got '${hTypeName(expr.type)}'`,
        });
      }
      break;
    }

    case 'undefined-literal': {
      if (expr.type.kind !== 'undefined') {
        problems.push({
          kind: 'undefined-literal',
          span: expr.span,
          code: 'STA4023',
          message: `undefined-literal must have type 'undefined', got '${hTypeName(expr.type)}'`,
        });
      }
      break;
    }

    case 'identifier': {
      const id = expr as Identifier;
      // Check that the identifier is in scope
      if (!bindings.has(id.name)) {
        problems.push({
          kind: 'identifier',
          span: id.span,
          code: 'STA4002',
          message: `identifier '${id.name}' is not defined`,
        });
      }
      // Otherwise, type should match the binding's type — this is verified by lowering,
      // but we can check it for assurance
      const binding = bindings.get(id.name);
      if (binding) {
        if (!hTypeEquals(expr.type, binding.type)) {
          problems.push({
            kind: 'identifier',
            span: id.span,
            code: 'STA4010',
            message: `identifier '${id.name}' has type '${hTypeName(binding.type)}' but is used as '${hTypeName(expr.type)}'`,
          });
        }
      }
      break;
    }

    case 'binary-op': {
      const binOp = expr as BinaryOp;
      verifyExpression(binOp.left, problems, bindings);
      verifyExpression(binOp.right, problems, bindings);

      const op = binOp.operator;

      // Arithmetic operators: - * / %
      // `+` is deliberately absent. It is the one operator here that is not arithmetic: given a
      // string operand it concatenates, so neither "operands are numbers" nor "the result is a
      // number" holds for it. `"a" + "b"` is well-formed IR of type string.
      if (op === '-' || op === '*' || op === '/' || op === '%') {
        // Operands must be number, or `unknown` -- a value whose type is not known until it exists.
        // The emitter wraps every arithmetic operand in `jsrt_to_number`, which is ToNumber, which
        // is defined on every value there is: an object converts through ToPrimitive, a string
        // through the StringNumericLiteral grammar, anything unparseable to NaN. So `unknown` here
        // is a well-formed dynamic operand, not a lowering that lost a type. What the rule still
        // catches is a KNOWN non-number -- a `string` operand means the lowering built `-` out of
        // something the frontend had already typed, which no source can produce.
        const arithmeticOperand = (t: HType): boolean =>
          hTypeEquals(t, H_NUMBER) || t.kind === 'unknown';
        if (!arithmeticOperand(binOp.left.type)) {
          problems.push({
            kind: 'binary-op',
            span: binOp.left.span,
            code: 'STA4011',
            message: `arithmetic operand must be number, got ${hTypeName(binOp.left.type)}`,
          });
        }
        if (!arithmeticOperand(binOp.right.type)) {
          problems.push({
            kind: 'binary-op',
            span: binOp.right.span,
            code: 'STA4012',
            message: `arithmetic operand must be number, got ${hTypeName(binOp.right.type)}`,
          });
        }
        // Result must be number
        if (!hTypeEquals(expr.type, H_NUMBER)) {
          problems.push({
            kind: 'binary-op',
            span: expr.span,
            code: 'STA4013',
            message: `arithmetic operator result must be number, got ${hTypeName(expr.type)}`,
          });
        }
      }

      // Relational operators: < > <= >=
      if (op === '<' || op === '>' || op === '<=' || op === '>=') {
        // No operand rules. Abstract Relational Comparison accepts any two primitives and picks
        // its algorithm from what it finds: text order when both are strings, ToNumber otherwise.
        // `"10" < 9` is legal and false; `true < 2` is legal and true. The old rules that operands
        // must agree (STA4014) and be number-or-string (STA4015) are retired — they described the
        // Phase 2 fragment, not the language.

        // Result must be boolean
        if (!hTypeEquals(expr.type, H_BOOLEAN)) {
          problems.push({
            kind: 'binary-op',
            span: expr.span,
            code: 'STA4016',
            message: `comparison result must be boolean, got ${hTypeName(expr.type)}`,
          });
        }
      }

      // Bitwise: & | ^ << >> >>>
      // Deliberately no operand check. ToInt32 accepts any primitive, and the useful constraint
      // is on the RESULT: it must be a plain number, because `>>>` can produce a value larger
      // than int32 holds and a pass that assumed otherwise would be wrong (docs/NUMERIC.md §4.2).
      if (op === '&' || op === '|' || op === '^' || op === '<<' || op === '>>' || op === '>>>') {
        if (!hTypeEquals(expr.type, H_NUMBER)) {
          problems.push({
            kind: 'binary-op',
            span: expr.span,
            code: 'STA4024',
            message: `bitwise operator result must be number, got '${hTypeName(expr.type)}'`,
          });
        }
      }

      // Equality: == != === !==
      // All four share one rule and no other. Operand types are NOT required to agree, for
      // either flavour: coercion across types is the whole purpose of `==`, and `null ===
      // undefined` is legal code that simply answers false. The old same-type rule (STA4017,
      // retired) rejected correct IR — a verifier rule has to be an invariant of the language,
      // not of the fragment that happened to exist when it was written.
      if (op === '==' || op === '!=' || op === '===' || op === '!==') {
        if (!hTypeEquals(expr.type, H_BOOLEAN)) {
          problems.push({
            kind: 'binary-op',
            span: expr.span,
            code: 'STA4018',
            message: `equality result must be boolean, got ${hTypeName(expr.type)}`,
          });
        }
      }

      break;
    }

    case 'unary-op': {
      verifyExpression(expr.operand, problems, bindings);
      // No operand constraint: ToNumber and ToBoolean are total on primitives. The result type,
      // however, is fixed by the operator and nothing else.
      const wanted = expr.operator === '!' ? H_BOOLEAN : H_NUMBER;
      if (!hTypeEquals(expr.type, wanted)) {
        problems.push({
          kind: 'unary-op',
          span: expr.span,
          code: 'STA4025',
          message: `unary operator '${expr.operator}' result must be ${hTypeName(wanted)}, got '${hTypeName(expr.type)}'`,
        });
      }
      break;
    }

    case 'template-literal': {
      for (const part of expr.expressions) {
        verifyExpression(part, problems, bindings);
      }
      // The literal chunks bracket the holes, so there is always exactly one more chunk than
      // hole. A violation means the lowering built the node wrong, and the emitter would drop or
      // duplicate text without noticing.
      if (expr.quasis.length !== expr.expressions.length + 1) {
        problems.push({
          kind: 'template-literal',
          span: expr.span,
          code: 'STA4026',
          message: `template literal has ${expr.quasis.length} literal chunks for ${expr.expressions.length} substitutions; expected ${expr.expressions.length + 1}`,
        });
      }
      if (!hTypeEquals(expr.type, H_STRING)) {
        problems.push({
          kind: 'template-literal',
          span: expr.span,
          code: 'STA4027',
          message: `template literal must have type 'string', got '${hTypeName(expr.type)}'`,
        });
      }
      break;
    }

    case 'string-length': {
      verifyExpression(expr.operand, problems, bindings);
      if (!hTypeEquals(expr.type, H_NUMBER)) {
        problems.push({
          kind: 'string-length',
          span: expr.span,
          code: 'STA4028',
          message: `string length must have type 'number', got '${hTypeName(expr.type)}'`,
        });
      }
      break;
    }

    case 'logical-op': {
      verifyExpression(expr.left, problems, bindings);
      verifyExpression(expr.right, problems, bindings);
      // No result-type rule. The value of `a && b` is one of the OPERANDS, so its type is their
      // union -- which the HType lattice represents as Unknown until unions land. Asserting
      // anything narrower here would reject correct IR.
      break;
    }

    case 'function': {
      verifyFunction(expr, problems, bindings);
      break;
    }

    case 'call': {
      verifyExpression(expr.callee, problems, bindings);
      for (const arg of expr.args) {
        verifyExpression(arg, problems, bindings);
      }
      // Unknown is callable by construction: in js mode that is the whole point, and the check
      // happens at runtime. A concrete non-function callee is a lowering bug -- the checker would
      // have rejected the source before the gate ever saw it.
      if (expr.callee.type.kind !== 'fn' && expr.callee.type.kind !== 'unknown') {
        problems.push({
          kind: 'call',
          span: expr.span,
          code: 'STA4041',
          message: `callee has type '${hTypeName(expr.callee.type)}', which is not callable`,
        });
      }
      break;
    }

    case 'array-length': {
      verifyExpression(expr.operand, problems, bindings);
      if (!hTypeEquals(expr.type, H_NUMBER)) {
        problems.push({
          kind: 'array-length',
          span: expr.span,
          code: 'STA4043',
          message: `array length must have type 'number', got '${hTypeName(expr.type)}'`,
        });
      }
      break;
    }

    case 'array-literal': {
      for (const element of expr.elements) {
        verifyExpression(element, problems, bindings);
      }
      // No rule relating element types to `expr.type.element`. The literal's type came from the
      // checker, which already widened `[1, 2]` to `number[]` and `[1, 'a']` to Unknown; asserting
      // invariant equality here would reject IR the checker built correctly.
      break;
    }

    case 'index-access': {
      verifyExpression(expr.target, problems, bindings);
      verifyExpression(expr.index, problems, bindings);
      checkIndexable(expr.target, 'index-access', 'STA4044', problems);
      // No rule on `expr.type` either. It is `T | undefined` -- Unknown -- until Task 3.5 narrows
      // it, and pinning it to Unknown here would have to be undone by that same pass.
      break;
    }

    case 'console-log': {
      const call = expr as ConsoleLogCall;
      // Verify all arguments
      for (const arg of call.args) {
        verifyExpression(arg, problems, bindings);
      }
      // console.log should have type undefined (no return value in Phase 2)
      if (expr.type.kind !== 'undefined') {
        problems.push({
          kind: 'console-log',
          span: expr.span,
          code: 'STA4019',
          message: `console.log must have type 'undefined', got '${hTypeName(expr.type)}'`,
        });
      }
      break;
    }

    case 'field-access': {
      verifyExpression(expr.target, problems, bindings);
      checkField(expr.target, expr.field, expr.slot, 'field-access', problems);
      break;
    }

    case 'method-call': {
      verifyExpression(expr.target, problems, bindings);
      for (const arg of expr.args) {
        verifyExpression(arg, problems, bindings);
      }
      // The class is named on the node so the emitter can call the method directly. That name is
      // only trustworthy if it still matches the receiver's type, and the method still exists on
      // it -- otherwise the emitted call reads a body belonging to another class.
      if (expr.target.type.kind !== 'object' || expr.target.type.name !== expr.className) {
        problems.push({
          kind: 'method-call',
          span: expr.span,
          code: 'STA4047',
          message: `receiver has type '${hTypeName(expr.target.type)}', not ${expr.className}`,
        });
      } else if (methodOf(expr.target.type, expr.method) === undefined) {
        problems.push({
          kind: 'method-call',
          span: expr.span,
          code: 'STA4047',
          message: `${expr.className} has no method '${expr.method}'`,
        });
      }
      break;
    }

    case 'new': {
      for (const arg of expr.args) {
        verifyExpression(arg, problems, bindings);
      }
      if (expr.type.kind !== 'object' || expr.type.name !== expr.className) {
        problems.push({
          kind: 'new',
          span: expr.span,
          code: 'STA4048',
          message: `new ${expr.className} has type '${hTypeName(expr.type)}'`,
        });
      }
      break;
    }

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Exhaustiveness check failed: ${_exhaustive}`);
    }
  }
}

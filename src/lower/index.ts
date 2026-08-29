/** Lowering: TypeScript AST -> typed HIR.
 *
 * Transforms a gate-approved SourceFile into a typed HIR Module.
 * The gate has already ensured only the Phase 2 micro-subset is present.
 * This module raises STA4xxx for any construct outside the subset, which is
 * an internal error (the gate should have caught it).
 */

import * as ts from 'typescript';
import { tsTypeToHType } from '../frontend/types.ts';
import type {
  ArrayLength,
  ArrayLiteral,
  BinaryOp,
  BinaryOperator,
  Block,
  CallExpr,
  ClassDeclaration,
  ClassMethod,
  ConsoleLogCall,
  Declaration,
  Expression,
  FieldAccess,
  FunctionDeclaration,
  FunctionExpr,
  Identifier,
  IfStatement,
  IndexAccess,
  LogicalOp,
  MethodCall,
  Module,
  NewExpr,
  Parameter,
  ReturnStatement,
  Span,
  Statement,
  StringLength,
  SwitchClause,
  TemplateLiteral,
  UnaryOp,
} from '../hir/nodes.ts';
import type { HObject, HType } from '../hir/types.ts';
import { fieldSlot, H_NUMBER, H_UNDEFINED, hFunction, hTypeName } from '../hir/types.ts';
import type { Diagnostic } from '../support/diagnostics.ts';
import { diagnosticFromNode } from '../support/diagnostics.ts';
import type { CaptureMap, FunctionLike } from './captures.ts';
import { analyzeCaptures } from './captures.ts';

/** Token -> HIR operator. A table rather than a chain of `if`s so that the gate's accept set and
 * the HIR's vocabulary can be compared against it by eye: a token the gate lets through and this
 * map does not name is the invariant break that produces an STA4036. */
const BINARY_OPERATORS = new Map<ts.SyntaxKind, BinaryOperator>([
  [ts.SyntaxKind.PlusToken, '+'],
  [ts.SyntaxKind.MinusToken, '-'],
  [ts.SyntaxKind.AsteriskToken, '*'],
  [ts.SyntaxKind.SlashToken, '/'],
  [ts.SyntaxKind.PercentToken, '%'],
  [ts.SyntaxKind.LessThanToken, '<'],
  [ts.SyntaxKind.GreaterThanToken, '>'],
  [ts.SyntaxKind.LessThanEqualsToken, '<='],
  [ts.SyntaxKind.GreaterThanEqualsToken, '>='],
  [ts.SyntaxKind.EqualsEqualsEqualsToken, '==='],
  [ts.SyntaxKind.ExclamationEqualsEqualsToken, '!=='],
  [ts.SyntaxKind.EqualsEqualsToken, '=='],
  [ts.SyntaxKind.ExclamationEqualsToken, '!='],
  [ts.SyntaxKind.AmpersandToken, '&'],
  [ts.SyntaxKind.BarToken, '|'],
  [ts.SyntaxKind.CaretToken, '^'],
  [ts.SyntaxKind.LessThanLessThanToken, '<<'],
  [ts.SyntaxKind.GreaterThanGreaterThanToken, '>>'],
  [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, '>>>'],
]);

const LOGICAL_OPERATORS = new Map<ts.SyntaxKind, LogicalOp['operator']>([
  [ts.SyntaxKind.AmpersandAmpersandToken, '&&'],
  [ts.SyntaxKind.BarBarToken, '||'],
  [ts.SyntaxKind.QuestionQuestionToken, '??'],
]);

const UNARY_OPERATORS = new Map<ts.SyntaxKind, UnaryOp['operator']>([
  [ts.SyntaxKind.MinusToken, '-'],
  [ts.SyntaxKind.PlusToken, '+'],
  [ts.SyntaxKind.ExclamationToken, '!'],
  [ts.SyntaxKind.TildeToken, '~'],
]);

export function lowerSourceFile(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): { readonly module: Module | null; readonly diagnostics: readonly Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const bindings = new Map<string, HType>();

  try {
    hoistFunctionDeclarations(sourceFile.statements, checker, bindings);
    const statements: Statement[] = [];
    for (const node of sourceFile.statements) {
      const stmt = lowerStatement(node, sourceFile, checker, bindings, diagnostics);
      if (stmt === null) {
        return { module: null, diagnostics };
      }
      statements.push(stmt);
    }

    const module: Module = {
      kind: 'module',
      type: H_UNDEFINED,
      span: makeSpan(0, sourceFile.getEnd(), sourceFile),
      fileName: sourceFile.fileName,
      statements,
    };

    return { module, diagnostics };
  } catch (error) {
    // Ensure no exception escapes — all errors must be diagnostics
    diagnostics.push(
      diagnosticFromNode(
        sourceFile,
        sourceFile,
        'STA4030',
        'internal',
        'ts',
        `internal error during lowering: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return { module: null, diagnostics };
  }
}

/** `label` is set only when re-entering from a LabeledStatement, and is meaningful only for the
 * loop and switch cases — every other statement ignores it, because the gate has already ensured
 * a label never reaches one. */
function lowerStatement(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
  label?: string,
): Statement | null {
  // Variable declaration (let/const)
  if (ts.isVariableStatement(node)) {
    return lowerDeclarationList(
      node.declarationList,
      node,
      sourceFile,
      checker,
      bindings,
      diagnostics,
    );
  }

  // Expression statement (including assignments and console.log)
  if (ts.isExpressionStatement(node)) {
    return lowerExpressionAsStatement(
      node.expression,
      node,
      sourceFile,
      checker,
      bindings,
      diagnostics,
    );
  }

  // If statement
  if (ts.isIfStatement(node)) {
    const condition = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
    if (!condition) {
      return null;
    }

    const consequent = lowerBody(node.thenStatement, sourceFile, checker, bindings, diagnostics);
    if (!consequent) {
      return null;
    }

    // `else if` needs no special case: an `else` whose statement is an IfStatement wraps that if
    // in a Block exactly as any other single statement, and the emitter's nesting reproduces it.
    let alternate: Block | undefined;
    if (node.elseStatement) {
      const result = lowerBody(node.elseStatement, sourceFile, checker, bindings, diagnostics);
      if (!result) {
        return null;
      }
      alternate = result;
    }

    const stmt: IfStatement = {
      kind: 'if-statement',
      type: H_UNDEFINED,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      condition,
      consequent,
      ...(alternate && { alternate }),
    };
    return stmt;
  }

  // `while` and `do/while` differ only in which node kind they are and whether the test runs
  // before the first iteration -- everything else about lowering them is identical.
  if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
    const condition = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
    if (!condition) {
      return null;
    }
    const body = lowerBody(node.statement, sourceFile, checker, bindings, diagnostics);
    if (!body) {
      return null;
    }
    return {
      kind: ts.isWhileStatement(node) ? 'while-statement' : 'do-while-statement',
      type: H_UNDEFINED,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      condition,
      body,
      ...(label && { label }),
    };
  }

  if (ts.isForStatement(node)) {
    return lowerFor(node, sourceFile, checker, bindings, diagnostics, label);
  }

  if (ts.isForOfStatement(node)) {
    return lowerForOf(node, sourceFile, checker, bindings, diagnostics, label);
  }

  if (ts.isSwitchStatement(node)) {
    return lowerSwitch(node, sourceFile, checker, bindings, diagnostics, label);
  }

  if (ts.isClassDeclaration(node)) {
    return lowerClass(node, sourceFile, checker, bindings, diagnostics);
  }

  if (ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
    const target = node.label?.text;
    return {
      kind: ts.isBreakStatement(node) ? 'break-statement' : 'continue-statement',
      type: H_UNDEFINED,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      ...(target !== undefined && { label: target }),
    };
  }

  // `outer: for (…)`. The label is handed to the loop rather than wrapped around it, so this
  // re-enters with the label in hand. The gate has already established the inner statement is
  // something that can carry one.
  if (ts.isLabeledStatement(node)) {
    return lowerStatement(
      node.statement,
      sourceFile,
      checker,
      bindings,
      diagnostics,
      node.label.text,
    );
  }

  // Block
  if (ts.isBlock(node)) {
    return lowerBlock(node, sourceFile, checker, bindings, diagnostics);
  }

  // `function f(...) { ... }`. The binding is already in `bindings` -- hoisting put it there
  // before the first statement of this body was lowered, which is what makes a call that appears
  // above the declaration resolve.
  if (ts.isFunctionDeclaration(node)) {
    const name = node.name?.text;
    if (name === undefined) {
      diagnostics.push(
        diagnosticFromNode(
          node,
          sourceFile,
          'STA4031',
          'internal',
          'ts',
          'function declaration without a name',
        ),
      );
      return null;
    }
    const fn = lowerFunction(node, sourceFile, checker, bindings, diagnostics);
    if (fn === null) {
      return null;
    }
    const declaration: FunctionDeclaration = {
      kind: 'function-declaration',
      type: H_UNDEFINED,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      name,
      fn,
    };
    return declaration;
  }

  // `return;` / `return e;`
  if (ts.isReturnStatement(node)) {
    let value: Expression | undefined;
    if (node.expression !== undefined) {
      const lowered = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
      if (lowered === null) {
        return null;
      }
      value = lowered;
    }
    const statement: ReturnStatement = {
      kind: 'return-statement',
      type: H_UNDEFINED,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      ...(value !== undefined && { value }),
    };
    return statement;
  }

  // Empty statement (semicolon)
  if (ts.isEmptyStatement(node)) {
    // Empty statements are acceptable but we don't generate an HIR node for them
    // Instead, return a no-op block
    const stmt: Block = {
      kind: 'block',
      type: H_UNDEFINED,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      statements: [],
    };
    return stmt;
  }

  // Anything else is an internal error
  diagnostics.push(
    diagnosticFromNode(
      node,
      sourceFile,
      'STA4031',
      'internal',
      'ts',
      `unexpected statement kind: ${ts.SyntaxKind[node.kind]}`,
    ),
  );
  return null;
}

/** `let x = 1` / `const x = 1`, from either a statement or a `for` header's first slot.
 *
 * `at` is the node the span comes from — the whole VariableStatement at statement level, and the
 * declaration list itself inside a `for` header, where there is no statement wrapping it. Passing
 * it in rather than synthesising a VariableStatement matters: a factory-made node has no source
 * position, and asking one for its start is a hard failure inside the TypeScript API. */
function lowerDeclarationList(
  list: ts.VariableDeclarationList,
  at: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Statement | null {
  const fail = (target: ts.Node, message: string): null => {
    diagnostics.push(diagnosticFromNode(target, sourceFile, 'STA4032', 'internal', 'ts', message));
    return null;
  };

  if (!list.declarations || list.declarations.length === 0) {
    return fail(at, 'empty variable declaration list');
  }
  // One binding per Declaration node, so `let a = 1, b = 2;` has nowhere to go yet.
  if (list.declarations.length > 1) {
    return fail(at, 'multiple declarations in one statement not supported');
  }
  const decl = list.declarations[0];
  if (!decl?.initializer) {
    return fail(decl ?? at, 'declaration without initializer');
  }

  const name = decl.name.getText(sourceFile);
  const value = lowerExpression(decl.initializer, sourceFile, checker, bindings, diagnostics);
  if (!value) {
    return null;
  }

  // The BINDING's type, not the initializer's. They differ whenever an annotation is wider than
  // what it was initialized with -- `let x: string | number = 1` binds a union, and taking the
  // initializer's `number` would make the perfectly legal `x = 'a'` an internal error, and would
  // let a later pass unbox a slot that can hold a string.
  const type = tsTypeToHType(checker.getTypeAtLocation(decl.name), checker);
  bindings.set(name, type);

  const stmt: Declaration = {
    kind: 'declaration',
    type,
    span: makeSpan(at.getStart(sourceFile), at.getWidth(sourceFile), sourceFile),
    name,
    declKind: list.flags & ts.NodeFlags.Const ? 'const' : 'let',
    value,
  };
  return stmt;
}

/** C-style `for`. Every header slot is optional; an absent condition means the loop runs until
 * something jumps out of it, which the HIR records as an absent `condition` rather than as a
 * literal `true` so the emitter can drop the test entirely. */
/** `for (const x of a)`.
 *
 * The binding's type comes from the checker at the binding site, which is the ELEMENT type with no
 * `| undefined` — the loop visits only indices that exist, so unlike `a[i]` this read cannot miss.
 * That is what keeps a typed for-of on the static path where an indexed loop is not. */
function lowerForOf(
  node: ts.ForOfStatement,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
  label?: string,
): Statement | null {
  const iterable = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
  if (!iterable) {
    return null;
  }

  const list = node.initializer;
  const declaration = ts.isVariableDeclarationList(list) ? list.declarations[0] : undefined;
  if (declaration === undefined || !ts.isIdentifier(declaration.name)) {
    diagnostics.push(
      diagnosticFromNode(
        node,
        sourceFile,
        'STA4035',
        'internal',
        'ts',
        'for-of binding must be a single named declaration',
      ),
    );
    return null;
  }

  const binding = declaration.name.text;
  // In scope for the body, and only for the body: a fresh binding each iteration is exactly what
  // `let`/`const` in a for-of header means.
  const inner = new Map(bindings);
  inner.set(binding, tsTypeToHType(checker.getTypeAtLocation(declaration.name), checker));

  const body = lowerBody(node.statement, sourceFile, checker, inner, diagnostics);
  if (!body) {
    return null;
  }

  return {
    kind: 'for-of-statement',
    type: H_UNDEFINED,
    span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
    binding,
    declKind: (list.flags & ts.NodeFlags.Const) !== 0 ? 'const' : 'let',
    iterable,
    body,
    ...(label !== undefined && { label }),
  };
}

function lowerFor(
  node: ts.ForStatement,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
  label?: string,
): Statement | null {
  let init: Statement | undefined;
  if (node.initializer !== undefined) {
    // The initializer is either a declaration list (`let i = 0`) or an expression (`i = 0`). The
    // declaration form is NOT wrapped in a VariableStatement here as it is at statement level,
    // which is why the list is lowered directly.
    const lowered = ts.isVariableDeclarationList(node.initializer)
      ? lowerDeclarationList(
          node.initializer,
          node.initializer,
          sourceFile,
          checker,
          bindings,
          diagnostics,
        )
      : lowerExpressionAsStatement(
          node.initializer,
          node.initializer,
          sourceFile,
          checker,
          bindings,
          diagnostics,
        );
    if (!lowered) {
      return null;
    }
    init = lowered;
  }

  let condition: Expression | undefined;
  if (node.condition !== undefined) {
    const lowered = lowerExpression(node.condition, sourceFile, checker, bindings, diagnostics);
    if (!lowered) {
      return null;
    }
    condition = lowered;
  }

  let update: Statement | undefined;
  if (node.incrementor !== undefined) {
    const lowered = lowerExpressionAsStatement(
      node.incrementor,
      node.incrementor,
      sourceFile,
      checker,
      bindings,
      diagnostics,
    );
    if (!lowered) {
      return null;
    }
    update = lowered;
  }

  const body = lowerBody(node.statement, sourceFile, checker, bindings, diagnostics);
  if (!body) {
    return null;
  }

  return {
    kind: 'for-statement',
    type: H_UNDEFINED,
    span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
    ...(init && { init }),
    ...(condition && { condition }),
    ...(update && { update }),
    body,
    ...(label && { label }),
  };
}

/** `switch`. The clauses keep their source order, `default` included: its position matters for
 * fall-through even though it is tried last. Both facts are the emitter's problem, and it can only
 * honour them if the lowering preserves the order rather than hoisting `default` to the end. */
function lowerSwitch(
  node: ts.SwitchStatement,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
  label?: string,
): Statement | null {
  const discriminant = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
  if (!discriminant) {
    return null;
  }

  const clauses: SwitchClause[] = [];
  for (const clause of node.caseBlock.clauses) {
    let test: Expression | undefined;
    if (ts.isCaseClause(clause)) {
      const lowered = lowerExpression(
        clause.expression,
        sourceFile,
        checker,
        bindings,
        diagnostics,
      );
      if (!lowered) {
        return null;
      }
      test = lowered;
    }
    const statements: Statement[] = [];
    for (const child of clause.statements) {
      const stmt = lowerStatement(child, sourceFile, checker, bindings, diagnostics);
      if (!stmt) {
        return null;
      }
      statements.push(stmt);
    }
    clauses.push({ ...(test && { test }), statements });
  }

  return {
    kind: 'switch-statement',
    type: H_UNDEFINED,
    span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
    discriminant,
    clauses,
    ...(label && { label }),
  };
}

/** Compound-assignment token -> the binary operator it folds to. */
const COMPOUND_OPERATORS = new Map<ts.SyntaxKind, BinaryOperator>([
  [ts.SyntaxKind.PlusEqualsToken, '+'],
  [ts.SyntaxKind.MinusEqualsToken, '-'],
  [ts.SyntaxKind.AsteriskEqualsToken, '*'],
  [ts.SyntaxKind.SlashEqualsToken, '/'],
  [ts.SyntaxKind.PercentEqualsToken, '%'],
]);

/** An expression used for its effect and not its value: the whole of an expression statement, or
 * a `for` header's third slot. The gate has already established that any assignment-like form
 * reaching here has its value discarded, which is what makes the folds below sound.
 *
 * `span` comes from `at` rather than from `expr` so a `for` incrementor is reported at the header
 * position a reader would point to. */
function lowerExpressionAsStatement(
  expr: ts.Expression,
  at: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Statement | null {
  const span = makeSpan(at.getStart(sourceFile), at.getWidth(sourceFile), sourceFile);

  // A member target is a different statement shape, so it is tried first: assignmentParts would
  // otherwise report `a[i] = v` as an internal "target must be an identifier" error.
  const member = memberAssignment(expr, at, sourceFile, checker, bindings, diagnostics);
  if (member !== undefined) {
    return member;
  }

  const assignment = assignmentParts(expr, sourceFile, checker, bindings, diagnostics);
  if (assignment === null) {
    return null;
  }
  if (assignment !== undefined) {
    return { kind: 'assignment', type: assignment.value.type, span, ...assignment };
  }

  const exp = lowerExpression(expr, sourceFile, checker, bindings, diagnostics);
  if (!exp) {
    return null;
  }
  return { kind: 'expression-statement', type: exp.type, span, expression: exp };
}

/** The parameter a method's `this` reads from. The leading space makes it unspellable in source,
 * so it can never collide with a user binding, and it is the SAME key the emitter maps to a frame
 * slot -- `this` is an ordinary identifier from here down (see ClassMethod in src/hir/nodes.ts). */
const RECEIVER = ' this';

/** The slot `field` occupies in `target`'s class, or `null` after reporting an internal error.
 *
 * A miss is never a user error: the checker proved the name is declared and the gate proved the
 * target is a class this subset lays out, so the only way to get here is for `classTypeToHType` and
 * the gate to disagree about what a class IS -- which is the load-bearing invariant, and an
 * internal bug when it breaks. */
function slotOf(
  target: Expression,
  field: string,
  at: ts.Node,
  sourceFile: ts.SourceFile,
  diagnostics: Diagnostic[],
): number | null {
  const slot = target.type.kind === 'object' ? fieldSlot(target.type, field) : undefined;
  if (slot === undefined) {
    diagnostics.push(
      diagnosticFromNode(
        at,
        sourceFile,
        'STA4060',
        'internal',
        'ts',
        `no field '${field}' on ${hTypeName(target.type)}`,
      ),
    );
    return null;
  }
  return slot;
}

/** The target and value of `x = e`, `x += e`, `x++` and `--x`, or `undefined` if `expr` is none of
 * those. `null` means it was one and lowering it failed.
 *
 * `x += e` folds to `x = x + e` and `x++` to `x = (+x) + 1`. Those two are NOT the same shape, and
 * the difference is the reason for the explicit unary `+`: `+=` uses the `+` OPERATOR, which
 * concatenates when either side is a string, while `++` is defined to run ToNumber first. For
 * `x = '5'` the language says `x += 1` is `'51'` and `x++` is `6`, and only the unary `+` keeps
 * those apart. It is written on the `--` path too, where `-` would have coerced anyway, so the
 * pair reads as one rule rather than two. */
function assignmentParts(
  expr: ts.Expression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): { target: string; value: Expression } | null | undefined {
  const build = (
    targetNode: ts.Expression,
    make: (current: Identifier) => Expression | null,
  ): { target: string; value: Expression } | null => {
    if (!ts.isIdentifier(targetNode)) {
      diagnostics.push(
        diagnosticFromNode(
          targetNode,
          sourceFile,
          'STA4033',
          'internal',
          'ts',
          'assignment target must be an identifier',
        ),
      );
      return null;
    }
    const target = targetNode.getText(sourceFile);
    const binding = bindings.get(target);
    if (!binding) {
      diagnostics.push(
        diagnosticFromNode(
          targetNode,
          sourceFile,
          'STA4034',
          'internal',
          'ts',
          `identifier '${target}' assigned before declaration`,
        ),
      );
      return null;
    }
    const current: Identifier = {
      kind: 'identifier',
      type: binding,
      span: makeSpan(targetNode.getStart(sourceFile), targetNode.getWidth(sourceFile), sourceFile),
      name: target,
    };
    const value = make(current);
    return value === null ? null : { target, value };
  };

  if (ts.isBinaryExpression(expr)) {
    if (expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      return build(expr.left, () =>
        lowerExpression(expr.right, sourceFile, checker, bindings, diagnostics),
      );
    }
    const operator = COMPOUND_OPERATORS.get(expr.operatorToken.kind);
    if (operator !== undefined) {
      return build(expr.left, (current) => {
        const right = lowerExpression(expr.right, sourceFile, checker, bindings, diagnostics);
        if (right === null) {
          return null;
        }
        // NOT H_NUMBER: `+=` is the `+` operator, so `s += 1` on a string is a string. Asking the
        // checker for the type of the whole `x += e` is the only answer that holds for all five
        // compound operators — the verifier rejected the hardcoded number, correctly.
        return {
          kind: 'binary-op',
          type: tsTypeToHType(checker.getTypeAtLocation(expr), checker),
          span: current.span,
          operator,
          left: current,
          right,
        };
      });
    }
    return undefined;
  }

  const update = updateOperator(expr);
  if (update === undefined) {
    return undefined;
  }
  // H_NUMBER is right here and nowhere else in this function: `++` runs ToNumber first, so its
  // result is a number even when the variable held a string.
  return build(update.operand, (current) => ({
    kind: 'binary-op',
    type: H_NUMBER,
    span: current.span,
    operator: update.operator,
    left: { kind: 'unary-op', type: H_NUMBER, span: current.span, operator: '+', operand: current },
    right: { kind: 'number-literal', type: H_NUMBER, span: current.span, value: 1 },
  }));
}

/** Can this expression be re-read without re-running anything? An identifier and a literal can:
 * evaluating either twice is indistinguishable from evaluating it once. Anything else -- a call, a
 * nested index, an assignment -- has to be hoisted into a temporary so the read and the write of
 * `a[i()] += 1` share ONE evaluation (plan-notes 43). Erring toward hoisting is always correct;
 * this predicate only avoids spending a frame slot where it would buy nothing. */
function isSideEffectFree(node: ts.Expression): boolean {
  return (
    ts.isIdentifier(node) ||
    ts.isNumericLiteral(node) ||
    ts.isStringLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  );
}

/** Assignment to a MEMBER of something: `a[i] = v`, `o.x = v`, and the `op=`, `++` and `--` forms
 * of each. `undefined` when `expr` is none of those; `null` when it was one and lowering it failed.
 *
 * The two places are one function because they differ in exactly two lines — how the place is read
 * and how it is written — and agree on everything expensive: which operator folds to which, and
 * THE READ-ONCE RULE (plan-notes 43), which says a compound form must evaluate each part of the
 * place exactly ONCE. `a[i()] += 1` calls `i` a single time, and `f().x++` calls `f` a single time;
 * the fold `a[i] = a[i] + 1` names the parts twice, so anything not already re-readable is bound to
 * a temporary and the fold refers to that. */
function memberAssignment(
  expr: ts.Expression,
  at: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Statement | null | undefined {
  const span = makeSpan(at.getStart(sourceFile), at.getWidth(sourceFile), sourceFile);

  const compound =
    ts.isBinaryExpression(expr) && expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken
      ? COMPOUND_OPERATORS.get(expr.operatorToken.kind)
      : undefined;
  const update = updateOperator(expr);
  const plain =
    ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken;

  const targetNode = ts.isBinaryExpression(expr)
    ? expr.left
    : update !== undefined
      ? update.operand
      : undefined;
  if (
    targetNode === undefined ||
    !(ts.isElementAccessExpression(targetNode) || ts.isPropertyAccessExpression(targetNode))
  ) {
    return undefined;
  }
  if (!plain && compound === undefined && update === undefined) {
    return undefined; // a binary operator that is not an assignment at all
  }

  // A compound form reads the place and writes it back, so every part of the PLACE must be
  // evaluated exactly once: `a[i()] += 1` calls `i` a single time, and the value it returned is
  // both the slot read and the slot written. The fold names each part twice, so anything that is
  // not already re-readable is bound to a temporary and the fold refers to that. A plain `=` reads
  // nothing and needs none of it -- which is what `plain` short-circuits below.
  const statements: Statement[] = [];
  const hoisted = (node: ts.Expression, slot: number): Expression | null => {
    const lowered = lowerExpression(node, sourceFile, checker, bindings, diagnostics);
    if (lowered === null || plain || isSideEffectFree(node)) {
      return lowered;
    }
    // The name is unspellable in source, so it can never shadow a user binding. It stays a
    // compile-time key: the emitter maps every binding to a frame slot and emits the slot.
    const name = ` index${String(slot)}`;
    bindings.set(name, lowered.type);
    statements.push({
      kind: 'declaration',
      type: lowered.type,
      span: lowered.span,
      name,
      declKind: 'const',
      value: lowered,
    });
    return { kind: 'identifier', type: lowered.type, span: lowered.span, name };
  };

  const target = hoisted(targetNode.expression, 0);
  if (target === null) {
    return null;
  }

  // The place, in the two forms it can take: what reading it looks like, and what writing it is.
  // The read is only used by the compound and update folds; a plain `=` discards it.
  let current: Expression;
  let write: (value: Expression) => Statement;
  const placeType = tsTypeToHType(checker.getTypeAtLocation(targetNode), checker);
  if (ts.isElementAccessExpression(targetNode)) {
    const index = hoisted(targetNode.argumentExpression, 1);
    if (index === null) {
      return null;
    }
    current = { kind: 'index-access', type: placeType, span, target, index };
    write = (value) => ({ kind: 'index-assignment', type: value.type, span, target, index, value });
  } else {
    const field = targetNode.name.text;
    const slot = slotOf(target, field, targetNode, sourceFile, diagnostics);
    if (slot === null) {
      return null;
    }
    current = { kind: 'field-access', type: placeType, span, target, field, slot };
    write = (value) => ({
      kind: 'field-assignment',
      type: value.type,
      span,
      target,
      field,
      slot,
      value,
    });
  }

  let value: Expression | null;
  if (update !== undefined) {
    // `++` runs ToNumber first, so the result is a number even when the place held a string --
    // the same distinction assignmentParts spells out for `x++` versus `x += 1`.
    value = {
      kind: 'binary-op',
      type: H_NUMBER,
      span,
      operator: update.operator,
      left: { kind: 'unary-op', type: H_NUMBER, span, operator: '+', operand: current },
      right: { kind: 'number-literal', type: H_NUMBER, span, value: 1 },
    };
  } else if (!ts.isBinaryExpression(expr)) {
    return undefined;
  } else if (compound !== undefined) {
    const right = lowerExpression(expr.right, sourceFile, checker, bindings, diagnostics);
    value =
      right === null
        ? null
        : {
            kind: 'binary-op',
            type: tsTypeToHType(checker.getTypeAtLocation(expr), checker),
            span,
            operator: compound,
            left: current,
            right,
          };
  } else {
    value = lowerExpression(expr.right, sourceFile, checker, bindings, diagnostics);
  }
  if (value === null) {
    return null;
  }

  const stmt = write(value);
  if (statements.length === 0) {
    return stmt;
  }
  // The temporaries and the write are one statement, so this fits anywhere a statement does --
  // including a `for` update clause, which the emitter emits as a statement after the body.
  statements.push(stmt);
  return { kind: 'block', type: H_UNDEFINED, span, statements };
}

/** `a[i]` as a read. Shared by the expression case and by the compound-assignment fold, so both
 * agree on the node's type — which comes from the checker, and is `T | undefined` under
 * `noUncheckedIndexedAccess`, not the array's element type. */
function lowerIndexAccess(
  node: ts.ElementAccessExpression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): IndexAccess | null {
  const target = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
  if (!target) {
    return null;
  }
  const index = lowerExpression(
    node.argumentExpression,
    sourceFile,
    checker,
    bindings,
    diagnostics,
  );
  if (!index) {
    return null;
  }
  return {
    kind: 'index-access',
    type: tsTypeToHType(checker.getTypeAtLocation(node), checker),
    span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
    target,
    index,
  };
}

/** `x++`, `x--`, `++x`, `--x` — prefix and postfix are the same statement once the value is
 * discarded, which the gate has already guaranteed. */
function updateOperator(
  expr: ts.Expression,
): { operand: ts.Expression; operator: '+' | '-' } | undefined {
  if (!ts.isPostfixUnaryExpression(expr) && !ts.isPrefixUnaryExpression(expr)) {
    return undefined;
  }
  if (expr.operator === ts.SyntaxKind.PlusPlusToken) {
    return { operand: expr.operand, operator: '+' };
  }
  if (expr.operator === ts.SyntaxKind.MinusMinusToken) {
    return { operand: expr.operand, operator: '-' };
  }
  return undefined;
}

/** The body of an `if`, loop, or labelled statement, as a Block.
 *
 * A body is a Block in the HIR whether or not it was one in the source, because `while (c) x++;`
 * and `while (c) { x++; }` differ only in punctuation. Wrapping here rather than at each call site
 * keeps that fact in one place — it was previously spelled out four times, and each new loop
 * would have spelled it again. */
function lowerBody(
  node: ts.Statement,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Block | null {
  if (ts.isBlock(node)) {
    return lowerBlock(node, sourceFile, checker, bindings, diagnostics);
  }
  const single = lowerStatement(node, sourceFile, checker, bindings, diagnostics);
  if (!single) {
    return null;
  }
  return {
    kind: 'block',
    type: H_UNDEFINED,
    span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
    statements: [single],
  };
}

function lowerBlock(
  node: ts.Block,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Block | null {
  hoistFunctionDeclarations(node.statements, checker, bindings);
  const statements: Statement[] = [];
  for (const child of node.statements) {
    const stmt = lowerStatement(child, sourceFile, checker, bindings, diagnostics);
    if (stmt === null) {
      return null;
    }
    statements.push(stmt);
  }

  const block: Block = {
    kind: 'block',
    type: H_UNDEFINED,
    span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
    statements,
  };
  return block;
}

function lowerExpression(
  node: ts.Expression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Expression | null {
  // Parentheses only expressed precedence, and the tree already encodes it. Unwrapping here
  // rather than modelling them is why the HIR has no grouping node -- and it must happen before
  // every other case, since a parenthesized anything can appear wherever an expression can.
  if (ts.isParenthesizedExpression(node)) {
    return lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
  }

  // `-1` parses as a prefix minus applied to the literal 1, but it is one negative number to a
  // reader and to the emitted C. Folding it keeps the HIR free of a unary node it would otherwise
  // need for this single case; the gate accepts prefix minus ONLY on a numeric literal, so
  // anything else here is real negation and falls through to the unsupported-kind path.
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return {
      kind: 'number-literal',
      type: tsTypeToHType(checker.getTypeAtLocation(node), checker),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      value: -Number(node.operand.text),
    };
  }

  // Number literal
  if (ts.isNumericLiteral(node)) {
    const value = parseFloat(node.text);
    const type = tsTypeToHType(checker.getTypeAtLocation(node), checker);
    return {
      kind: 'number-literal',
      type,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      value,
    };
  }

  // String literal
  if (ts.isStringLiteral(node)) {
    const value = node.text;
    const type = tsTypeToHType(checker.getTypeAtLocation(node), checker);
    return {
      kind: 'string-literal',
      type,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      value,
    };
  }

  // `` `no holes` `` carries no substitutions, so it IS a string literal -- distinguishing it
  // from one below the frontend would be preserving syntax, not meaning.
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return {
      kind: 'string-literal',
      type: tsTypeToHType(checker.getTypeAtLocation(node), checker),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      value: node.text,
    };
  }

  // `` `a${x}b` `` -- head, then one (expression, literal) pair per span.
  if (ts.isTemplateExpression(node)) {
    const quasis: string[] = [node.head.text];
    const expressions: Expression[] = [];
    for (const span of node.templateSpans) {
      const value = lowerExpression(span.expression, sourceFile, checker, bindings, diagnostics);
      if (!value) {
        return null;
      }
      expressions.push(value);
      quasis.push(span.literal.text);
    }
    const template: TemplateLiteral = {
      kind: 'template-literal',
      type: tsTypeToHType(checker.getTypeAtLocation(node), checker),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      quasis,
      expressions,
    };
    return template;
  }

  // `o.x` on a class instance. This is tested BEFORE `.length` because a class may declare a field
  // called `length`, and that field is a slot -- the array and string intrinsics of the same name
  // belong to those types, not to every object that borrows the word.
  if (ts.isPropertyAccessExpression(node) && isClassInstance(node.expression, checker)) {
    const target = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
    if (target === null) {
      return null;
    }
    const field = node.name.text;
    const slot = slotOf(target, field, node, sourceFile, diagnostics);
    if (slot === null) {
      return null;
    }
    const access: FieldAccess = {
      kind: 'field-access',
      type: tsTypeToHType(checker.getTypeAtLocation(node), checker),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      target,
      field,
      slot,
    };
    return access;
  }

  // `s.length` and `a.length`. The gate already confirmed the object is a string or an array; a
  // property access that is neither never reaches here, and `console.log` is the call case. The
  // two produce different nodes because they become different runtime calls, and this is the last
  // point at which the operand's type is known.
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'length') {
    const operand = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
    if (!operand) {
      return null;
    }
    const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
    if (operand.type.kind === 'array') {
      const length: ArrayLength = { kind: 'array-length', type: H_NUMBER, span, operand };
      return length;
    }
    const length: StringLength = { kind: 'string-length', type: H_NUMBER, span, operand };
    return length;
  }

  if (ts.isArrayLiteralExpression(node)) {
    const elements: Expression[] = [];
    for (const element of node.elements) {
      const lowered = lowerExpression(element, sourceFile, checker, bindings, diagnostics);
      if (!lowered) {
        return null;
      }
      elements.push(lowered);
    }
    const literal: ArrayLiteral = {
      kind: 'array-literal',
      // From the checker, not from the elements: `[1, 2]` in `const a: number[] = [1, 2]` is
      // `number[]`, but the same literal assigned to `unknown[]` is not, and only the checker
      // knows which context this literal sits in.
      type: tsTypeToHType(checker.getTypeAtLocation(node), checker),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      elements,
    };
    return literal;
  }

  if (ts.isElementAccessExpression(node)) {
    return lowerIndexAccess(node, sourceFile, checker, bindings, diagnostics);
  }

  // Boolean literal (true/false)
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    const value = node.kind === ts.SyntaxKind.TrueKeyword;
    const type = tsTypeToHType(checker.getTypeAtLocation(node), checker);
    return {
      kind: 'boolean-literal',
      type,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      value,
    };
  }

  // `this` is a read of the receiver parameter, and nothing more: the gate admits it only inside a
  // class member, and every class member's parameter list starts with that parameter. There is no
  // `this` node in the HIR because there is nothing left for one to mean.
  if (node.kind === ts.SyntaxKind.ThisKeyword) {
    const binding = bindings.get(RECEIVER);
    if (binding === undefined) {
      diagnostics.push(
        diagnosticFromNode(
          node,
          sourceFile,
          'STA4061',
          'internal',
          'ts',
          'this outside a class member',
        ),
      );
      return null;
    }
    const receiver: Identifier = {
      kind: 'identifier',
      type: binding,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      name: RECEIVER,
    };
    return receiver;
  }

  // `new C(...)`. The class is named, not evaluated: the gate accepted only an identifier callee,
  // and what the emitter needs is the descriptor that identifier resolves to.
  if (ts.isNewExpression(node)) {
    const type = tsTypeToHType(checker.getTypeAtLocation(node), checker);
    if (type.kind !== 'object') {
      diagnostics.push(
        diagnosticFromNode(
          node,
          sourceFile,
          'STA4062',
          'internal',
          'ts',
          `new produced ${hTypeName(type)}, which is not a class instance`,
        ),
      );
      return null;
    }
    const args: Expression[] = [];
    for (const arg of node.arguments ?? []) {
      const lowered = lowerExpression(arg, sourceFile, checker, bindings, diagnostics);
      if (lowered === null) {
        return null;
      }
      args.push(lowered);
    }
    const created: NewExpr = {
      kind: 'new',
      type,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      className: type.name,
      args,
    };
    return created;
  }

  // null
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return {
      kind: 'null-literal',
      type: tsTypeToHType(checker.getTypeAtLocation(node), checker),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
    };
  }

  // Identifier
  if (ts.isIdentifier(node)) {
    const name = node.text;
    const binding = bindings.get(name);
    // `undefined` is a global binding, not a keyword, so it arrives here as an ordinary
    // identifier. The `bindings` lookup comes first deliberately: a local named `undefined` is
    // legal JavaScript and must win, exactly as it does at runtime.
    if (binding === undefined && name === 'undefined') {
      return {
        kind: 'undefined-literal',
        type: H_UNDEFINED,
        span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      };
    }
    if (!binding) {
      diagnostics.push(
        diagnosticFromNode(
          node,
          sourceFile,
          'STA4035',
          'internal',
          'ts',
          `identifier '${name}' used before declaration`,
        ),
      );
      return null;
    }

    const ident: Identifier = {
      kind: 'identifier',
      type: binding,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      name,
    };
    return ident;
  }

  // Binary and short-circuiting expressions
  if (ts.isBinaryExpression(node)) {
    const opKind = node.operatorToken.kind;
    const operator = BINARY_OPERATORS.get(opKind);
    const logical = LOGICAL_OPERATORS.get(opKind);
    if (operator === undefined && logical === undefined) {
      diagnostics.push(
        diagnosticFromNode(
          node,
          sourceFile,
          'STA4036',
          'internal',
          'ts',
          `unsupported binary operator: ${ts.SyntaxKind[opKind]}`,
        ),
      );
      return null;
    }

    const left = lowerExpression(node.left, sourceFile, checker, bindings, diagnostics);
    if (!left) {
      return null;
    }

    const right = lowerExpression(node.right, sourceFile, checker, bindings, diagnostics);
    if (!right) {
      return null;
    }

    const type = tsTypeToHType(checker.getTypeAtLocation(node), checker);
    const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);

    if (logical !== undefined) {
      const logicalOp: LogicalOp = {
        kind: 'logical-op',
        type,
        span,
        operator: logical,
        left,
        right,
      };
      return logicalOp;
    }
    if (operator !== undefined) {
      const binOp: BinaryOp = { kind: 'binary-op', type, span, operator, left, right };
      return binOp;
    }
    return null;
  }

  // Prefix unary. The `-<numeric literal>` fold above already returned; anything reaching here is
  // a real operation on a computed operand.
  if (ts.isPrefixUnaryExpression(node)) {
    const operator = UNARY_OPERATORS.get(node.operator);
    if (operator === undefined) {
      diagnostics.push(
        diagnosticFromNode(
          node,
          sourceFile,
          'STA4036',
          'internal',
          'ts',
          `unsupported unary operator: ${ts.SyntaxKind[node.operator]}`,
        ),
      );
      return null;
    }

    const operand = lowerExpression(node.operand, sourceFile, checker, bindings, diagnostics);
    if (!operand) {
      return null;
    }

    const unaryOp: UnaryOp = {
      kind: 'unary-op',
      type: tsTypeToHType(checker.getTypeAtLocation(node), checker),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      operator,
      operand,
    };
    return unaryOp;
  }

  // A function literal used as a value: `const f = (x: number) => x * 2`.
  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    return lowerFunction(node, sourceFile, checker, bindings, diagnostics);
  }

  // Call expression (console.log)
  if (ts.isCallExpression(node)) {
    const expr = node.expression;

    // Check if this is a property access (console.log)
    if (ts.isPropertyAccessExpression(expr)) {
      const obj = expr.expression;
      const propName = expr.name.text;

      // Check if it's console.log
      if (
        ts.isIdentifier(obj) &&
        obj.text === 'console' &&
        (propName === 'log' || propName === 'warn' || propName === 'error')
      ) {
        // Lower all arguments
        const args: Expression[] = [];
        for (const arg of node.arguments) {
          const argExpr = lowerExpression(arg, sourceFile, checker, bindings, diagnostics);
          if (!argExpr) {
            return null;
          }
          args.push(argExpr);
        }

        const type = tsTypeToHType(checker.getTypeAtLocation(node), checker);
        const call: ConsoleLogCall = {
          kind: 'console-log',
          type,
          span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
          args,
        };
        return call;
      }

      // `o.m(a)`. The receiver is lowered; the method is NOT -- one function is shared by every
      // instance, so naming its class here is what lets the emitter make a direct call instead of
      // loading a per-instance closure out of a slot.
      if (isClassInstance(obj, checker)) {
        const target = lowerExpression(obj, sourceFile, checker, bindings, diagnostics);
        if (target === null) {
          return null;
        }
        if (target.type.kind !== 'object') {
          diagnostics.push(
            diagnosticFromNode(
              expr,
              sourceFile,
              'STA4049',
              'internal',
              'ts',
              'receiver is not an object',
            ),
          );
          return null;
        }
        const args: Expression[] = [];
        for (const arg of node.arguments) {
          const lowered = lowerExpression(arg, sourceFile, checker, bindings, diagnostics);
          if (lowered === null) {
            return null;
          }
          args.push(lowered);
        }
        const call: MethodCall = {
          kind: 'method-call',
          type: tsTypeToHType(checker.getTypeAtLocation(node), checker),
          span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
          target,
          className: target.type.name,
          method: propName,
          args,
        };
        return call;
      }
    }

    // An ordinary call. The callee is evaluated as a value like any other expression -- the gate
    // has already restricted it to shapes whose value the emitter can produce.
    const callee = lowerExpression(expr, sourceFile, checker, bindings, diagnostics);
    if (callee === null) {
      return null;
    }
    const args: Expression[] = [];
    for (const arg of node.arguments) {
      const lowered = lowerExpression(arg, sourceFile, checker, bindings, diagnostics);
      if (lowered === null) {
        return null;
      }
      args.push(lowered);
    }
    const call: CallExpr = {
      kind: 'call',
      type: tsTypeToHType(checker.getTypeAtLocation(node), checker),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      callee,
      args,
    };
    return call;
  }

  // Anything else is an internal error
  diagnostics.push(
    diagnosticFromNode(
      node,
      sourceFile,
      'STA4031',
      'internal',
      'ts',
      `unexpected expression kind: ${ts.SyntaxKind[node.kind]}`,
    ),
  );
  return null;
}

/** Binds every function declared directly in `statements` before any of them is lowered.
 *
 * This is hoisting, and it is not optional: `f(); function f() {}` is legal and must resolve. The
 * emitter mirrors it by initialising the same bindings in the enclosing body's prologue. */
function hoistFunctionDeclarations(
  statements: readonly ts.Statement[],
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
): void {
  for (const statement of statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      bindings.set(
        statement.name.text,
        tsTypeToHType(checker.getTypeAtLocation(statement), checker),
      );
    }
  }
}

/** The one lowering for all three function spellings.
 *
 * The body is lowered against a COPY of the enclosing bindings. Copying is sound only because the
 * gate rejects any reference to a binding local to an enclosing function (rung 4a has no
 * environment structs): what survives the copy is module-level, which the emitter roots for the
 * program's lifetime. Copying also stops a local of this function leaking back into the caller's
 * scope, which a shared map would do. */
function lowerFunction(
  node: FunctionLike,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
  receiver?: HObject,
): FunctionExpr | null {
  const inner = new Map(bindings);
  const params: Parameter[] = [];
  // A method's receiver is parameter zero under a name no source can spell. Everything downstream
  // -- arity padding, the closure ABI, capture analysis, the emitter -- then treats `this` as an
  // ordinary parameter, which is why methods needed no machinery of their own.
  if (receiver !== undefined) {
    const at = makeSpan(node.getStart(sourceFile), 0, sourceFile);
    params.push({ name: RECEIVER, type: receiver, span: at });
    inner.set(RECEIVER, receiver);
  }
  for (const param of node.parameters) {
    if (!ts.isIdentifier(param.name)) {
      diagnostics.push(
        diagnosticFromNode(param, sourceFile, 'STA4031', 'internal', 'ts', 'unexpected parameter'),
      );
      return null;
    }
    const type = tsTypeToHType(checker.getTypeAtLocation(param), checker);
    params.push({
      name: param.name.text,
      type,
      span: makeSpan(param.getStart(sourceFile), param.getWidth(sourceFile), sourceFile),
    });
    inner.set(param.name.text, type);
  }

  const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
  const body = lowerFunctionBody(node.body, sourceFile, checker, inner, diagnostics);
  if (body === null) {
    return null;
  }

  const info = capturesFor(sourceFile, checker).get(node);
  // Without a receiver the checker's own type is the answer. With one, the emitted function has a
  // parameter the source did not write, so the type has to describe what is actually called --
  // and for a constructor the checker has no function type to offer at all.
  const declared = tsTypeToHType(checker.getTypeAtLocation(node), checker);
  const type =
    receiver === undefined
      ? declared
      : hFunction(
          params.map((p) => p.type),
          declared.kind === 'fn' ? declared.ret : H_UNDEFINED,
        );
  const name = ts.isConstructorDeclaration(node)
    ? undefined
    : node.name !== undefined && ts.isIdentifier(node.name)
      ? node.name.text
      : undefined;
  const fn: FunctionExpr = {
    kind: 'function',
    type,
    span,
    ...(name !== undefined && { name }),
    params,
    body,
    envVars: info?.envVars ?? [],
    captures: info?.captures ?? [],
    needsEnv: info?.needsEnv ?? false,
  };
  return fn;
}

/** Does this expression evaluate to an instance of a class this subset lays out?
 *
 * Asked of the checker's type rather than of a lowered node, because it decides WHICH lowering to
 * run -- and it must give the same answer `tsTypeToHType` will, since that is what produces the
 * HObject the slot is resolved against. */
function isClassInstance(node: ts.Expression, checker: ts.TypeChecker): boolean {
  return tsTypeToHType(checker.getTypeAtLocation(node), checker).kind === 'object';
}

/** `class C { … }`.
 *
 * Three things happen here and nowhere else. The field ORDER is fixed -- declaration order is slot
 * order, and `HObject.fields` was built from the same list, so the two agree by construction rather
 * than by coincidence. Each member becomes an ordinary function with the receiver prepended. And a
 * field INITIALIZER is moved into the constructor: `class C { n = 0 }` runs `this.n = 0` before the
 * constructor body, in declaration order, which is what the language specifies and what lets the
 * emitter have exactly one place that populates an object. A class with initializers but no
 * constructor gets an empty one to hold them. */
function lowerClass(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): ClassDeclaration | null {
  const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
  const symbol = node.name === undefined ? undefined : checker.getSymbolAtLocation(node.name);
  const self = symbol === undefined ? undefined : checker.getDeclaredTypeOfSymbol(symbol);
  const type = self === undefined ? undefined : tsTypeToHType(self, checker);
  if (node.name === undefined || type === undefined || type.kind !== 'object') {
    diagnostics.push(
      diagnosticFromNode(
        node,
        sourceFile,
        'STA4062',
        'internal',
        'ts',
        'not a class instance the type model describes',
      ),
    );
    return null;
  }

  // The slot list comes from the TYPE, not from a second walk of the members: HObject.fields is
  // what every FieldAccess slot was resolved against, so re-deriving the order here would be a
  // chance for the emitted descriptor to disagree with the indices written into it. A `.js` class
  // has fields with no member node at all, which is the case that makes this not merely tidier.
  const fields: Parameter[] = type.fields.map((field) => {
    const at = node.members.find((m) => m.name?.getText(sourceFile) === field.name) ?? node;
    return {
      name: field.name,
      type: field.type,
      span: makeSpan(at.getStart(sourceFile), at.getWidth(sourceFile), sourceFile),
    };
  });
  const initializers: ts.PropertyDeclaration[] = [];
  let ctorNode: ts.ConstructorDeclaration | undefined;
  const methodNodes: ts.MethodDeclaration[] = [];
  for (const member of node.members) {
    if (ts.isPropertyDeclaration(member)) {
      if (member.initializer !== undefined) {
        initializers.push(member);
      }
    } else if (ts.isConstructorDeclaration(member)) {
      ctorNode = member;
    } else if (ts.isMethodDeclaration(member)) {
      methodNodes.push(member);
    }
  }

  const methods: ClassMethod[] = [];
  for (const method of methodNodes) {
    const fn = lowerFunction(method, sourceFile, checker, bindings, diagnostics, type);
    if (fn === null) {
      return null;
    }
    methods.push({ name: method.name.getText(sourceFile), fn });
  }

  let ctor: ClassMethod | undefined;
  if (ctorNode !== undefined || initializers.length > 0) {
    const fn =
      ctorNode === undefined
        ? emptyConstructor(node, sourceFile, type)
        : lowerFunction(ctorNode, sourceFile, checker, bindings, diagnostics, type);
    if (fn === null) {
      return null;
    }
    const prologue = lowerFieldInitializers(
      initializers,
      type,
      sourceFile,
      checker,
      bindings,
      diagnostics,
    );
    if (prologue === null) {
      return null;
    }
    ctor = {
      name: 'constructor',
      fn: {
        ...fn,
        body: { ...fn.body, statements: [...prologue, ...fn.body.statements] },
      },
    };
  }

  return {
    kind: 'class-declaration',
    type: H_UNDEFINED,
    span,
    name: node.name.text,
    fields,
    ...(ctor !== undefined && { ctor }),
    methods,
  };
}

/** `this.x = <init>` for each initialized field, in declaration order.
 *
 * These run against a scope holding only the receiver: a field initializer may not see the
 * constructor's parameters, which is why they are lowered here rather than inside the constructor's
 * own bindings. */
function lowerFieldInitializers(
  members: readonly ts.PropertyDeclaration[],
  self: HObject,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Statement[] | null {
  const inner = new Map(bindings);
  inner.set(RECEIVER, self);
  const statements: Statement[] = [];
  for (const member of members) {
    if (member.initializer === undefined) {
      continue;
    }
    const span = makeSpan(member.getStart(sourceFile), member.getWidth(sourceFile), sourceFile);
    const field = member.name.getText(sourceFile);
    const slot = fieldSlot(self, field);
    const value = lowerExpression(member.initializer, sourceFile, checker, inner, diagnostics);
    if (slot === undefined || value === null) {
      if (slot === undefined) {
        diagnostics.push(
          diagnosticFromNode(
            member,
            sourceFile,
            'STA4060',
            'internal',
            'ts',
            `no field '${field}' on ${self.name}`,
          ),
        );
      }
      return null;
    }
    statements.push({
      kind: 'field-assignment',
      type: value.type,
      span,
      target: { kind: 'identifier', type: self, span, name: RECEIVER },
      field,
      slot,
      value,
    });
  }
  return statements;
}

/** The constructor a class with initializers but no `constructor` gets: receiver in, nothing done.
 * Built rather than lowered because there is no declaration to lower. */
function emptyConstructor(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  self: HObject,
): FunctionExpr {
  const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
  return {
    kind: 'function',
    type: hFunction([self], H_UNDEFINED),
    span,
    params: [{ name: RECEIVER, type: self, span }],
    body: { kind: 'block', type: H_UNDEFINED, span, statements: [] },
    envVars: [],
    captures: [],
    needsEnv: false,
  };
}

/* Capture analysis is a whole-file question, so it runs once per source file rather than once per
 * function. Cached on the file itself: `lowerFunction` already receives both the file and the
 * checker, so nothing has to be threaded through the twenty lowering functions between them. */
const captureCache = new WeakMap<ts.SourceFile, CaptureMap>();

function capturesFor(sourceFile: ts.SourceFile, checker: ts.TypeChecker): CaptureMap {
  const cached = captureCache.get(sourceFile);
  if (cached !== undefined) {
    return cached;
  }
  const computed = analyzeCaptures(sourceFile, checker);
  captureCache.set(sourceFile, computed);
  return computed;
}

/** An arrow's expression body is a return in disguise; giving it one here means the HIR has a
 * single body shape and neither the verifier nor the emitter has to know arrows exist. */
function lowerFunctionBody(
  body: ts.Block | ts.Expression | undefined,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Block | null {
  if (body === undefined) {
    return null;
  }
  if (ts.isBlock(body)) {
    return lowerBlock(body, sourceFile, checker, bindings, diagnostics);
  }
  const value = lowerExpression(body, sourceFile, checker, bindings, diagnostics);
  if (value === null) {
    return null;
  }
  const span = makeSpan(body.getStart(sourceFile), body.getWidth(sourceFile), sourceFile);
  return {
    kind: 'block',
    type: H_UNDEFINED,
    span,
    statements: [{ kind: 'return-statement', type: H_UNDEFINED, span, value }],
  };
}

function makeSpan(start: number, width: number, sourceFile: ts.SourceFile): Span {
  const line = sourceFile.getLineAndCharacterOfPosition(start).line + 1; // 1-indexed
  return {
    start,
    length: width,
    line,
  };
}

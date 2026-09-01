/** Lowering: TypeScript AST -> typed HIR.
 *
 * Transforms a gate-approved SourceFile into a typed HIR Module.
 * The gate has already ensured only the Phase 2 micro-subset is present.
 * This module raises STA4xxx for any construct outside the subset, which is
 * an internal error (the gate should have caught it).
 */

import * as ts from 'typescript';
import {
  isArrayReceiver,
  isDateReceiver,
  isGlobalDate,
  isGlobalJson,
  isGlobalMath,
  isGlobalObject,
  isGlobalPromise,
  isMatchReceiver,
  isRegExpReceiver,
  isStringReceiver,
  MATH_CONSTANTS,
  MATH_METHODS,
  OBJECT_STATICS,
  PROMISE_STATICS,
} from '../frontend/gate.ts';
import {
  genericCallInstantiation,
  specializationName,
  substituteHType,
} from '../frontend/generics.ts';
import { assertedBy, isCheckable, narrowedTo, sourceLocation } from '../frontend/narrowing.ts';
import {
  accessorDeclaringClass,
  ancestry,
  baseClassOf,
  classDeclarationOf,
  isDynamicShape,
  isStaticMember,
  methodDeclaringClass,
  staticMemberOf,
  tsTypeToHType,
} from '../frontend/types.ts';
import type {
  ArrayLength,
  ArrayLiteral,
  ArrayOpName,
  BinaryOp,
  BinaryOperator,
  Block,
  CallExpr,
  ClassDeclaration,
  ClassMethod,
  CollectionNew,
  CollectionOp,
  CollectionOperation,
  ConsoleLogCall,
  ConsoleMethod,
  DateOperation,
  DateStatic,
  Declaration,
  Expression,
  FieldAccess,
  FunctionDeclaration,
  FunctionExpr,
  Identifier,
  IfStatement,
  IndexAccess,
  InstanceOf,
  LogicalOp,
  MatchField,
  MathMethod,
  MethodCall,
  Module,
  NewExpr,
  ObjectEntry,
  ObjectLiteral,
  ObjectStaticMethod,
  Parameter,
  PromiseStaticMethod,
  Provenance,
  RegExpField,
  RegExpOperation,
  ReturnStatement,
  Span,
  Statement,
  StringLength,
  StringOpName,
  SuperCall,
  SwitchClause,
  TemplateLiteral,
  UnaryOp,
} from '../hir/nodes.ts';
import {
  ARRAY_OPS,
  CONSOLE_METHODS,
  DATE_OPS,
  DATE_STATICS,
  isSetOperation,
  MATCH_FIELDS,
  REGEXP_FIELDS,
  REGEXP_OPS,
  STRING_OPS,
} from '../hir/nodes.ts';
import type { HObject, HType } from '../hir/types.ts';
import {
  accessorName,
  fieldSlot,
  H_BOOLEAN,
  H_NUMBER,
  H_STRING,
  H_UNDEFINED,
  hasTypeParam,
  hFunction,
  hPromise,
  hTypeHasUnknown,
  hTypeName,
  hUnknown,
} from '../hir/types.ts';
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
  return lowerProgram([sourceFile], checker);
}

/* Lowers a whole program -- the module-graph files in topological order, entry LAST -- into ONE
 * merged Module (plan.md §5 Task 3.11). The merge is the binding map: it is shared across files,
 * so a dependency's top-level names are already registered when its importers lower, and an
 * imported identifier resolves to the exporting file's own binding by name. The graph walk has
 * already refused what would make that unsound: cycles (STA3001) and cross-file name collisions. */
export function lowerProgram(
  files: readonly ts.SourceFile[],
  checker: ts.TypeChecker,
): { readonly module: Module | null; readonly diagnostics: readonly Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const bindings = new Map<string, HType>();
  const statements: Statement[] = [];
  const entry = files.at(-1);
  if (entry === undefined) {
    throw new Error('lowerProgram requires at least one file');
  }
  let current = entry;

  try {
    for (const sourceFile of files) {
      current = sourceFile;
      // Monomorphization runs before anything is lowered, because a specialization is a FUNCTION
      // the module contains and the module's own statements may call it. Nothing is cloned: a
      // specialization is the generic's own AST lowered a second time with a substitution in
      // scope. Two files instantiating one generic at the same tuple produce one specialization:
      // the name (`box<number>`) is unspellable from source, so a binding under it can only be an
      // earlier file's copy of the same function.
      const collected = collectSpecializations(sourceFile, checker, diagnostics);
      if (collected === null) {
        return { module: null, diagnostics };
      }
      const specializations = collected.filter((spec) => !bindings.has(spec.name));
      hoistFunctionDeclarations(sourceFile.statements, checker, bindings);
      for (const specialization of specializations) {
        bindings.set(specialization.name, specializationType(specialization, checker));
      }

      for (const specialization of specializations) {
        const declaration = lowerSpecialization(
          specialization,
          sourceFile,
          checker,
          bindings,
          diagnostics,
        );
        if (declaration === null) {
          return { module: null, diagnostics };
        }
        statements.push(declaration);
      }
      for (const node of sourceFile.statements) {
        // A generic declaration lowers to nothing: its specializations are already above, and the
        // name itself binds no value (the gate refuses reading one).
        if (ts.isFunctionDeclaration(node) && isGenericDeclaration(node)) {
          continue;
        }
        // Module syntax lowers to nothing either: an import binds nothing in the merged namespace
        // (the name resolves to the exporting file's own binding), `export { x }` is metadata
        // about a binding that already exists, and a default export is gate-restricted to a
        // literal, which has no effect to keep.
        if (
          ts.isImportDeclaration(node) ||
          ts.isExportDeclaration(node) ||
          ts.isExportAssignment(node)
        ) {
          continue;
        }
        const stmt = lowerStatement(node, sourceFile, checker, bindings, diagnostics);
        if (stmt === null) {
          return { module: null, diagnostics };
        }
        statements.push(stmt);
      }
    }

    const module: Module = {
      kind: 'module',
      type: H_UNDEFINED,
      span: makeSpan(0, entry.getEnd(), entry),
      fileName: entry.fileName,
      statements,
    };

    return { module, diagnostics };
  } catch (error) {
    // Ensure no exception escapes — all errors must be diagnostics
    diagnostics.push(
      diagnosticFromNode(
        current,
        current,
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
  // `super(...)`. The base class comes from the RECEIVER's own type rather than from threaded
  // context: `bases[0]` is the immediate base, and the receiver is in scope for exactly the
  // constructor bodies where a super call is legal. The gate proved the position.
  if (
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.kind === ts.SyntaxKind.SuperKeyword
  ) {
    return lowerSuperCall(node.expression, node, sourceFile, checker, bindings, diagnostics);
  }

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

  if (ts.isThrowStatement(node)) {
    const value = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
    if (!value) {
      return null;
    }
    return {
      kind: 'throw-statement',
      type: H_UNDEFINED,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      value,
    };
  }

  if (ts.isTryStatement(node)) {
    const tryBlock = lowerBlock(node.tryBlock, sourceFile, checker, bindings, diagnostics);
    if (!tryBlock) {
      return null;
    }
    let catchBinding: string | undefined;
    let catchBlock: Block | undefined;
    if (node.catchClause !== undefined) {
      // The caught value is Unknown by decree, not by inference: anything can be thrown, so the
      // binding enters scope as an unchecked value and a narrowing of it goes through the same
      // BoundaryCheck machinery as any other unknown (Task 3.5). The scope copy is what confines
      // it to the catch block.
      const scope = new Map(bindings);
      const declared = node.catchClause.variableDeclaration?.name;
      if (declared !== undefined && ts.isIdentifier(declared)) {
        catchBinding = declared.text;
        scope.set(catchBinding, hUnknown(false));
      }
      const lowered = lowerBlock(node.catchClause.block, sourceFile, checker, scope, diagnostics);
      if (!lowered) {
        return null;
      }
      catchBlock = lowered;
    }
    let finallyBlock: Block | undefined;
    if (node.finallyBlock !== undefined) {
      const lowered = lowerBlock(node.finallyBlock, sourceFile, checker, bindings, diagnostics);
      if (!lowered) {
        return null;
      }
      finallyBlock = lowered;
    }
    return {
      kind: 'try-statement',
      type: H_UNDEFINED,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      tryBlock,
      ...(catchBinding !== undefined && { catchBinding }),
      ...(catchBlock !== undefined && { catchBlock }),
      ...(finallyBlock !== undefined && { finallyBlock }),
    };
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
  const type = typeAt(decl.name, checker, bindings);
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
  inner.set(binding, typeAt(declaration.name, checker, bindings));

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

/** The binding an assignment TARGET names, or `undefined` if it names no binding at all.
 *
 * Two spellings reach one binding: a plain identifier, and `C.count` on a static. Resolving both
 * here is what lets `C.count += 1` and `C.count++` reuse the identifier machinery unchanged --
 * a static is a plain binding, so there is no place to evaluate once and nothing to hoist. */
function placeName(
  node: ts.Expression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): string | undefined {
  if (ts.isIdentifier(node)) {
    return node.getText(sourceFile);
  }
  if (!ts.isPropertyAccessExpression(node)) {
    return undefined;
  }
  const found = staticMemberOf(node, checker, false);
  return found === undefined || found.owner.name === undefined
    ? undefined
    : staticName(found.owner.name.text, node.name.text);
}

/** The parameter a method's `this` reads from. The leading space makes it unspellable in source,
 * so it can never collide with a user binding, and it is the SAME key the emitter maps to a frame
 * slot -- `this` is an ordinary identifier from here down (see ClassMethod in src/hir/nodes.ts). */
const RECEIVER = ' this';

/** The binding name a static member gets: `C.count`.
 *
 * A dot is what makes it unspellable, the same trick `RECEIVER` uses with a leading space -- no
 * source identifier can contain one, so a static can never collide with a user binding. The
 * DECLARING class is the half that matters: statics are inherited, so `D.count` on a subclass and
 * `C.count` on its base must produce the same name or one static would become two bindings. */
function staticName(className: string, member: string): string {
  return `${className}.${member}`;
}

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
    const target = placeName(targetNode, sourceFile, checker);
    if (target === undefined) {
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
          type: typeAt(expr, checker, bindings),
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
  // `C.count = …` looks like a member write and is not one: a static is a plain binding, so it
  // belongs to the identifier path, which `assignmentParts` reaches once this declines it.
  if (
    ts.isPropertyAccessExpression(targetNode) &&
    staticMemberOf(targetNode, checker, false) !== undefined
  ) {
    return undefined;
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
  const placeType = typeAt(targetNode, checker, bindings);
  if (ts.isElementAccessExpression(targetNode)) {
    const index = hoisted(targetNode.argumentExpression, 1);
    if (index === null) {
      return null;
    }
    current = { kind: 'index-access', type: placeType, span, target, index };
    write = (value) => ({ kind: 'index-assignment', type: value.type, span, target, index, value });
  } else if (accessorOwner(targetNode.expression, targetNode.name.text, checker) !== undefined) {
    // `o.x = v` RUNS the setter. The gate refused the compound forms, so `current` is never read
    // here -- it is built anyway so the two halves of a place stay one shape.
    const field = targetNode.name.text;
    const owner = accessorOwner(targetNode.expression, field, checker) ?? '';
    // A set-only property has no read at all, which is legal and is why this is conditional: the
    // only forms that would read it are the compound ones, and the gate refused those.
    const read = hasAccessorHalf(targetNode.expression, field, 'get', checker)
      ? accessorCall(
          'get',
          owner,
          target,
          field,
          [],
          placeType,
          span,
          targetNode,
          sourceFile,
          diagnostics,
        )
      : { kind: 'undefined-literal' as const, type: H_UNDEFINED, span };
    if (read === null) {
      return null;
    }
    current = read;
    write = (value) => {
      const call = accessorCall(
        'set',
        owner,
        target,
        field,
        [value],
        H_UNDEFINED,
        span,
        targetNode,
        sourceFile,
        diagnostics,
      );
      // `accessorCall` already reported; a null here would be the same miss the read survived.
      return call === null
        ? { kind: 'expression-statement', type: H_UNDEFINED, span, expression: value }
        : { kind: 'expression-statement', type: H_UNDEFINED, span, expression: call };
    };
  } else if (isDynamicShape(checker.getTypeAtLocation(targetNode.expression), checker)) {
    // A dynamic-shape write goes through the shape table (docs/VALUE.md §4.10). Only plain `=`
    // reaches here -- the gate refused the compound and update forms -- so `current` is never
    // read; it is built anyway so the two halves of a place stay one shape.
    const field = targetNode.name.text;
    current = { kind: 'dyn-field-access', type: hUnknown(false), span, target, field };
    write = (value) => ({
      kind: 'dyn-field-assignment',
      type: value.type,
      span,
      target,
      field,
      value,
    });
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
            type: typeAt(expr, checker, bindings),
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
    type: typeAt(node, checker, bindings),
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
      type: typeAt(node, checker, bindings),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      value: -Number(node.operand.text),
    };
  }

  // Number literal
  if (ts.isNumericLiteral(node)) {
    const value = parseFloat(node.text);
    const type = typeAt(node, checker, bindings);
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
    const type = typeAt(node, checker, bindings);
    return {
      kind: 'string-literal',
      type,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      value,
    };
  }

  // `/ab+c/gi`. The AST hands the whole literal back as ONE token, so the split is here: the last
  // `/` ends the pattern (an inner one is escaped or inside a class, and neither can be the last
  // character -- the grammar requires the closing delimiter after it). Neither half is parsed; the
  // vendored engine is the only thing that reads them, which is what keeps them from disagreeing.
  if (ts.isRegularExpressionLiteral(node)) {
    const text = node.text;
    const end = text.lastIndexOf('/');
    return {
      kind: 'regexp-literal',
      type: typeAt(node, checker, bindings),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      source: text.slice(1, end),
      flags: text.slice(end + 1),
    };
  }

  // `` `no holes` `` carries no substitutions, so it IS a string literal -- distinguishing it
  // from one below the frontend would be preserving syntax, not meaning.
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return {
      kind: 'string-literal',
      type: typeAt(node, checker, bindings),
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
      type: typeAt(node, checker, bindings),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      quasis,
      expressions,
    };
    return template;
  }

  // `C.count` on a class NAME. Tested before the instance case because the receiver's type answers
  // the same for both -- the type of the expression `C` is the class's static side, whose symbol is
  // still the class declaration. A static is one binding, so this is an ordinary identifier read.
  if (ts.isPropertyAccessExpression(node)) {
    const found = staticMemberOf(node, checker, undefined);
    if (found !== undefined && found.owner.name !== undefined) {
      const name = staticName(found.owner.name.text, node.name.text);
      const type = bindings.get(name);
      if (type === undefined) {
        diagnostics.push(
          diagnosticFromNode(
            node,
            sourceFile,
            'STA4066',
            'internal',
            'ts',
            `static '${name}' read before its class declaration was lowered`,
          ),
        );
        return null;
      }
      return {
        kind: 'identifier',
        type,
        span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
        name,
      };
    }
  }

  // `Math.PI` and the other Math constants fold to number literals HERE: the compiler runs on
  // the pinned Node, so the double it holds is bit-for-bit the one the golden tests diff against,
  // and no runtime representation of Math has to exist.
  if (
    ts.isPropertyAccessExpression(node) &&
    isGlobalMath(node.expression, checker) &&
    MATH_CONSTANTS.has(node.name.text)
  ) {
    const constants: Record<string, number> = {
      E: Math.E,
      LN10: Math.LN10,
      LN2: Math.LN2,
      LOG10E: Math.LOG10E,
      LOG2E: Math.LOG2E,
      PI: Math.PI,
      SQRT1_2: Math.SQRT1_2,
      SQRT2: Math.SQRT2,
    };
    return {
      kind: 'number-literal',
      type: H_NUMBER,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      value: constants[node.name.text] ?? Number.NaN,
    };
  }

  // `o.x` on a DYNAMIC shape: no slot exists, so the read resolves the NAME through the shape
  // table with a per-site cache (docs/VALUE.md §4.10). The result is Unknown -- an absent optional
  // property reads as `undefined`, and narrowing it back is the caller's job, like a Map get.
  if (
    ts.isPropertyAccessExpression(node) &&
    isDynamicShape(checker.getTypeAtLocation(node.expression), checker)
  ) {
    const target = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
    if (target === null) {
      return null;
    }
    return {
      kind: 'dyn-field-access',
      type: hUnknown(false),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      target,
      field: node.name.text,
    };
  }

  // `o.x` on a class instance. This is tested BEFORE `.length` because a class may declare a field
  // called `length`, and that field is a slot -- the array and string intrinsics of the same name
  // belong to those types, not to every object that borrows the word.
  if (ts.isPropertyAccessExpression(node) && isClassInstance(node.expression, checker, bindings)) {
    const target = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
    if (target === null) {
      return null;
    }
    const field = node.name.text;
    // An accessor is not a slot: reading `o.x` RUNS the getter, which is what the property means.
    const owner = accessorOwner(node.expression, field, checker);
    if (owner !== undefined) {
      return accessorCall(
        'get',
        owner,
        target,
        field,
        [],
        typeAt(node, checker, bindings),
        makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
        node,
        sourceFile,
        diagnostics,
      );
    }
    const slot = slotOf(target, field, node, sourceFile, diagnostics);
    if (slot === null) {
      return null;
    }
    const access: FieldAccess = {
      kind: 'field-access',
      type: typeAt(node, checker, bindings),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      target,
      field,
      slot,
    };
    return access;
  }

  // `m.size` -- a count the structure keeps, so a read rather than a walk, and the reason it is a
  // `CollectionOp` with no arguments instead of a node of its own.
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'size') {
    const target = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
    if (target === null) {
      return null;
    }
    if (target.type.kind === 'map' || target.type.kind === 'set') {
      const size: CollectionOp = {
        kind: 'collection-op',
        type: H_NUMBER,
        span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
        collection: target.type.kind,
        op: 'size',
        target,
        args: [],
      };
      return size;
    }
  }

  // `m.index`, `m.input`, `m.groups`, `m.length` -- the match array's own surface. It sits ahead of
  // the `.length` arm below because a match's `.length` is an ARRAY length read through a receiver
  // the HIR types Unknown, which that arm's array check would refuse.
  if (ts.isPropertyAccessExpression(node) && isMatchReceiver(node.expression, checker)) {
    const field = node.name.text;
    if (Object.hasOwn(MATCH_FIELDS, field)) {
      const target = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
      if (target === null) {
        return null;
      }
      const result = MATCH_FIELDS[field as MatchField];
      return {
        kind: 'match-read',
        type: result === 'number' ? H_NUMBER : result === 'string' ? H_STRING : hUnknown(false),
        span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
        field: field as MatchField,
        target,
      };
    }
  }

  // `re.source`, `re.global` and their nine siblings. Ahead of the `.length` arm for no reason of
  // its own -- a regexp has no `.length` -- but beside the match read it mirrors.
  if (ts.isPropertyAccessExpression(node) && isRegExpReceiver(node.expression, checker)) {
    const field = node.name.text;
    if (Object.hasOwn(REGEXP_FIELDS, field)) {
      const target = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
      if (target === null) {
        return null;
      }
      const result = REGEXP_FIELDS[field as RegExpField].result;
      return {
        kind: 'regexp-read',
        type: result === 'number' ? H_NUMBER : result === 'string' ? H_STRING : H_BOOLEAN,
        span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
        field: field as RegExpField,
        target,
      };
    }
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
      type: typeAt(node, checker, bindings),
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
    const type = typeAt(node, checker, bindings);
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
    return receiverIdentifier(node, sourceFile, bindings, diagnostics);
  }

  // `{ x: 1 }`. The gate proved every key is an identifier and that the type is a shape, so the
  // entries are the slots -- in the order written, which is the order the shape lists them and the
  // order `console.log` prints them.
  if (ts.isObjectLiteralExpression(node)) {
    const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
    const entries: ObjectEntry[] = [];
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
        diagnostics.push(
          diagnosticFromNode(
            property,
            sourceFile,
            'STA4068',
            'internal',
            'ts',
            'object literal member is not a name/value pair',
          ),
        );
        return null;
      }
      const value = lowerExpression(
        property.initializer,
        sourceFile,
        checker,
        bindings,
        diagnostics,
      );
      if (value === null) {
        return null;
      }
      entries.push({ name: property.name.text, value });
    }
    // The CONTEXTUAL type decides fixed-versus-dynamic, and it must be asked FIRST: in
    // `const o: { x?: number } = { x: 1 }` the literal's own type is a layout, but every later
    // read of `o` goes through the annotation -- so the object must be the dynamic one those
    // reads resolve against (same reasoning, same order, as gateObjectLiteral).
    const decisive = checker.getContextualType(node) ?? checker.getTypeAtLocation(node);
    if (isDynamicShape(decisive, checker)) {
      return { kind: 'dyn-object-literal', type: hUnknown(false), span, entries };
    }
    const type = typeAt(node, checker, bindings);
    if (type.kind !== 'object') {
      diagnostics.push(
        diagnosticFromNode(
          node,
          sourceFile,
          'STA4068',
          'internal',
          'ts',
          'object literal has no shape',
        ),
      );
      return null;
    }
    const literal: ObjectLiteral = { kind: 'object-literal', type, span, entries };
    return literal;
  }

  // `new C(...)`. The class is named, not evaluated: the gate accepted only an identifier callee,
  // and what the emitter needs is the descriptor that identifier resolves to.
  if (ts.isNewExpression(node)) {
    const type = typeAt(node, checker, bindings);
    // A Map and a Set are allocated, not constructed: there is no descriptor to name and no
    // constructor to run, so the node carries which of the two it is and nothing else.
    if (type.kind === 'map' || type.kind === 'set') {
      const created: CollectionNew = {
        kind: 'collection-new',
        type,
        span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
        collection: type.kind,
      };
      return created;
    }
    // A Date is allocated too, but unlike a collection it takes an ARGUMENT: the one-argument form
    // is the only one the gate let through, and `jsrt_date_from_value` discriminates its three
    // shapes -- a time value, an ISO string, another Date -- by tag.
    if (type.kind === 'date') {
      const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
      const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
      if (args === null) {
        return null;
      }
      // `new Date()` is `new Date(Date.now())`: §21.4.2.1 step 2 defines the zero-argument form as
      // the current time value, so desugaring it here costs the HIR no second node kind and keeps
      // the clock read in exactly one place. It is NOT `new Date(undefined)`, which is an Invalid
      // Date -- which is why the desugaring is to an explicit `now` call and not to padding.
      const arg: Expression = args[0] ?? {
        kind: 'date-static',
        type: H_NUMBER,
        span,
        method: 'now',
        args: [],
      };
      // The COMPONENT form is a different node: seven operands rather than one, and local-time
      // semantics rather than a time value. Omitted trailing components are padded with
      // `undefined`, which the runtime reads as the spec's defaults (day 1, the rest 0) -- the
      // same padding convention every `date-op` setter uses.
      if (args.length >= 2) {
        const padded = [...args];
        while (padded.length < 7) {
          padded.push({ kind: 'undefined-literal', type: H_UNDEFINED, span });
        }
        return { kind: 'date-components', type, span, args: padded };
      }
      return {
        kind: 'date-new',
        type,
        span,
        arg,
      };
    }
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
    const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
    if (args === null) {
      return null;
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
      type: typeAt(node, checker, bindings),
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
    // `NaN` and `Infinity` are globals too, exempted by name at the gate exactly like
    // `undefined` -- and like it, a user binding of the same name wins first, above.
    if (binding === undefined && (name === 'NaN' || name === 'Infinity')) {
      return {
        kind: 'number-literal',
        type: H_NUMBER,
        span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
        value: name === 'NaN' ? Number.NaN : Number.POSITIVE_INFINITY,
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
    // A narrowed read of an `unknown` is a boundary: the checker's claim about this use is settled
    // here, once, and every operation downstream may then trust the type completely. The gate has
    // already refused any narrowing this cannot check (`isCheckable`), so an unhandled one reaching
    // the emitter would be the accept-set invariant breaking, not a missing feature.
    const narrowing = narrowedTo(node, checker);
    if (narrowing !== null && isCheckable(narrowing.narrowed) && binding.kind === 'unknown') {
      return {
        kind: 'boundary-check',
        type: narrowing.narrowed,
        span: ident.span,
        value: ident,
        where: sourceLocation(node, sourceFile),
      };
    }
    return ident;
  }

  // `typeof x`. The operand is lowered as an ordinary expression and constrains nothing: this is
  // the one operator that is total on every value the runtime has.
  if (ts.isTypeOfExpression(node)) {
    const operand = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
    if (!operand) {
      return null;
    }
    return {
      kind: 'typeof',
      type: H_STRING,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      operand,
    };
  }

  // `await e`. The result type is the promise's value type, taken from the checker's own answer
  // for the await expression rather than by peeling the operand -- `await 1` is legal and its
  // operand is not a promise at all, which is exactly the case peeling would get wrong.
  if (ts.isAwaitExpression(node)) {
    const value = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
    if (!value) {
      return null;
    }
    return {
      kind: 'await',
      type: typeAt(node, checker, bindings),
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      value,
    };
  }

  // `x as T`. A widening or identity cast asserts nothing and lowers to its operand alone; anything
  // else is the program overruling the checker, and the check is what makes that safe.
  if (ts.isAsExpression(node)) {
    const operand = lowerExpression(node.expression, sourceFile, checker, bindings, diagnostics);
    if (!operand) {
      return null;
    }
    const assertion = assertedBy(node, checker);
    if (assertion === null || !isCheckable(assertion.asserted)) {
      return operand;
    }
    // A cast off a value the compiler already types concretely needs no check -- the checker
    // rejects `1 as string` outright, so what remains is a widening the operand already satisfies.
    if (operand.type.kind !== 'unknown') {
      return operand;
    }
    return {
      kind: 'boundary-check',
      type: assertion.asserted,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      value: operand,
      where: sourceLocation(node, sourceFile),
    };
  }

  // Binary and short-circuiting expressions
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) {
    // The right operand is a class NAME, and the name is taken from the DECLARATION rather than
    // from the reference: `import { C as D }` would spell the reference `D`, and the emitter's
    // descriptor is keyed by what the class calls itself.
    const declaration = checker.getSymbolAtLocation(node.right)?.valueDeclaration;
    if (
      declaration === undefined ||
      !ts.isClassDeclaration(declaration) ||
      declaration.name === undefined
    ) {
      diagnostics.push(
        diagnosticFromNode(
          node.right,
          sourceFile,
          'STA4063',
          'internal',
          'ts',
          'instanceof right operand is not a class the gate accepted',
        ),
      );
      return null;
    }
    const target = lowerExpression(node.left, sourceFile, checker, bindings, diagnostics);
    if (target === null) {
      return null;
    }
    const test: InstanceOf = {
      kind: 'instanceof',
      // Always boolean, whatever the checker narrowed the expression to at this position.
      type: H_BOOLEAN,
      span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
      target,
      className: declaration.name.text,
    };
    return test;
  }

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

    const type = typeAt(node, checker, bindings);
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
      type: typeAt(node, checker, bindings),
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

      // A console call. The gate allowed the method to omit its optional trailing argument. Where
      // the spec's own absent case IS undefined (`count()` counts under "default") the list is
      // padded here and one C entry point serves both forms; where it is not (`group`, `assert`,
      // whose explicit-undefined output differs from their omitted output) the list stays short
      // and `consoleEntryPoint` picks the runtime function that means absence.
      if (
        ts.isIdentifier(obj) &&
        obj.text === 'console' &&
        Object.hasOwn(CONSOLE_METHODS, propName)
      ) {
        const given = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
        if (given === null) {
          return null;
        }
        const method = propName as ConsoleMethod;
        const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
        const shape = CONSOLE_METHODS[method];
        const args = [...given];
        if (!('bare' in shape)) {
          while (args.length < shape.arity) {
            args.push({ kind: 'undefined-literal', type: H_UNDEFINED, span });
          }
        }
        const call: ConsoleLogCall = {
          kind: 'console-log',
          type: typeAt(node, checker, bindings),
          span,
          method,
          args,
        };
        return call;
      }

      // The Object namespace calls. `keys`/`getOwnPropertyNames` are `string[]` by construction
      // and `hasOwn` a boolean; for `values`/`entries` the checker's answer is kept when it maps
      // to an array, and the element degrades to Unknown when it does not (a mixed shape makes
      // the element genuinely a union this type model does not carry). `fromEntries` builds a
      // DYNAMIC shape and `assign` returns a target that just GREW one, so both are Unknown outright — the same honest answer `JSON.parse` gives,
      // and every read of it is a boundary.
      if (isGlobalObject(obj, checker) && Object.hasOwn(OBJECT_STATICS, propName)) {
        const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
        if (args === null) {
          return null;
        }
        const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
        const method = propName as ObjectStaticMethod;
        const checkerType = typeAt(node, checker, bindings);
        let type: HType;
        if (method === 'keys' || method === 'getOwnPropertyNames') {
          type = { kind: 'array', element: H_STRING };
        } else if (method === 'hasOwn') {
          type = H_BOOLEAN;
        } else if (method === 'fromEntries' || method === 'assign') {
          type = hUnknown(false);
        } else {
          type =
            checkerType.kind === 'array'
              ? checkerType
              : { kind: 'array', element: hUnknown(false) };
        }
        return { kind: 'object-static', type, span, method, args };
      }

      // `Date.UTC(...)` and `Date.parse(s)`. Both answer a time VALUE, so the type is pinned to
      // number here rather than taken from the node -- the checker agrees, and the verifier holds
      // it either way. Omitted trailing components are padded with undefined-literals: §21.4.3.4
      // reads absence off the argument list and the runtime reads it off JSRT_UNDEFINED, which is
      // the same question asked one layer down.
      if (isGlobalDate(obj, checker) && Object.hasOwn(DATE_STATICS, propName)) {
        const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
        if (args === null) {
          return null;
        }
        const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
        const method = propName as DateStatic;
        const padded: Expression[] = [...args];
        while (padded.length < DATE_STATICS[method].arity) {
          padded.push({ kind: 'undefined-literal', type: H_UNDEFINED, span });
        }
        return { kind: 'date-static', type: H_NUMBER, span, method, args: padded };
      }

      // The two JSON calls, both single-argument. `stringify` is always a string: the gate
      // already refused arguments whose type admits `undefined` or a function at the top level,
      // the two cases where the spec's answer is `undefined` rather than a string. `parse` is
      // Unknown by construction -- the checker types it `any` because the text is data, and the
      // honest HIR type for data nobody has checked yet is the one every use must narrow.
      if (isGlobalJson(obj, checker)) {
        const arg = lowerOnlyArgument(node, sourceFile, checker, bindings, diagnostics);
        if (arg === null) {
          return null;
        }
        const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
        return propName === 'parse'
          ? { kind: 'json-parse', type: hUnknown(false), span, arg }
          : { kind: 'json-stringify', type: H_STRING, span, arg };
      }

      // The three Promise statics the subset carries. `resolve`/`reject` take one value of any
      // type and `all` an array; the result is always a promise, and its value type comes from
      // the checker -- which knows `Promise.resolve(1)` is `Promise<number>` and, for `all`, the
      // tuple-or-array element the awaited result carries. Where the checker's answer does not
      // map to a promise (an untyped argument in js mode) the value degrades to Unknown, which
      // is what every read of the awaited result must narrow anyway.
      if (isGlobalPromise(obj, checker) && Object.hasOwn(PROMISE_STATICS, propName)) {
        const arg = lowerOnlyArgument(node, sourceFile, checker, bindings, diagnostics);
        if (arg === null) {
          return null;
        }
        const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
        const checkerType = typeAt(node, checker, bindings);
        const type = checkerType.kind === 'promise' ? checkerType : hPromise(hUnknown(false));
        return {
          kind: 'promise-static',
          type,
          span,
          method: propName as PromiseStaticMethod,
          arg,
        };
      }

      // `Math.floor(x)` and the rest of the Math surface. Variadic min/max are folded to nested
      // BINARY nodes here -- left fold, so `Math.min(a, b, c)` compares a to b first, which is
      // the order the spec's own loop uses and the order side effects already ran in. The
      // zero-argument forms are their identity literals, and one argument passes through: every
      // argument is typed number, and min/max of one number is that number (NaN included).
      if (isGlobalMath(obj, checker) && MATH_METHODS.has(propName)) {
        const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
        if (args === null) {
          return null;
        }
        const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
        if (propName === 'min' || propName === 'max') {
          if (args.length === 0) {
            return {
              kind: 'number-literal',
              type: H_NUMBER,
              span,
              value: propName === 'min' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY,
            };
          }
          let folded = args[0];
          if (folded === undefined) {
            return null;
          }
          for (const next of args.slice(1)) {
            folded = {
              kind: 'math-call',
              type: H_NUMBER,
              span,
              method: propName,
              args: [folded, next],
            };
          }
          return folded;
        }
        // hypot's degenerate arities, which the runtime entry point (binary, like min/max) cannot
        // express. These two are not folds of a binary hypot -- they are what the spec says the
        // answer IS: hypot() is +0, and hypot(x) is |x|. Three or more arguments never reach here;
        // the gate refuses them, because hypot is not associative (see the gate's note).
        if (propName === 'hypot' && args.length < 2) {
          const [only] = args;
          if (only === undefined) {
            return { kind: 'number-literal', type: H_NUMBER, span, value: 0 };
          }
          return { kind: 'math-call', type: H_NUMBER, span, method: 'abs', args: [only] };
        }
        return {
          kind: 'math-call',
          type: H_NUMBER,
          span,
          method: propName as MathMethod,
          args,
        };
      }

      // The landed `Date.prototype` surface, on the string ops' padding discipline and for the
      // same reason: every setter's spec text reads an omitted trailing component exactly as it
      // reads an explicitly-passed undefined. The result type comes from the table.
      if (isDateReceiver(obj, checker) && Object.hasOwn(DATE_OPS, propName)) {
        const op = propName as DateOperation;
        const target = lowerExpression(obj, sourceFile, checker, bindings, diagnostics);
        if (target === null) {
          return null;
        }
        const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
        if (args === null) {
          return null;
        }
        const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
        const padded: Expression[] = [...args];
        while (padded.length < DATE_OPS[op].arity) {
          padded.push({ kind: 'undefined-literal', type: H_UNDEFINED, span });
        }
        const type = DATE_OPS[op].result === 'number' ? H_NUMBER : H_STRING;
        return { kind: 'date-op', type, span, op, target, args: padded };
      }

      // The landed RegExp.prototype METHODS. The result is taken from the node rather than the
      // table because the verifier pins it either way, and this keeps a checker that says
      // otherwise visible instead of overwritten.
      if (isRegExpReceiver(obj, checker) && Object.hasOwn(REGEXP_OPS, propName)) {
        const target = lowerExpression(obj, sourceFile, checker, bindings, diagnostics);
        if (target === null) {
          return null;
        }
        const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
        if (args === null) {
          return null;
        }
        return {
          kind: 'regexp-op',
          type: typeAt(node, checker, bindings),
          span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
          op: propName as RegExpOperation,
          target,
          args,
        };
      }

      // The landed String.prototype surface. Missing optional arguments are PADDED with
      // undefined-literals up to the table's arity -- for every op in the set the spec gives an
      // explicitly-passed undefined the same meaning as an absent argument, which is what makes
      // the padding observably identical to the source. The node's type comes from the table,
      // the same table the verifier holds it to.
      if (isStringReceiver(obj, checker) && Object.hasOwn(STRING_OPS, propName)) {
        const op = propName as StringOpName;
        const target = lowerExpression(obj, sourceFile, checker, bindings, diagnostics);
        if (target === null) {
          return null;
        }
        const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
        if (args === null) {
          return null;
        }
        const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
        const shape = STRING_OPS[op];
        const padded: Expression[] = [...args];
        while (padded.length < shape.arity) {
          padded.push({ kind: 'undefined-literal', type: H_UNDEFINED, span });
        }
        const type: HType =
          shape.result === 'element' || shape.result === 'match'
            ? hUnknown(false)
            : shape.result === 'string-array'
              ? { kind: 'array', element: H_STRING }
              : shape.result === 'number'
                ? H_NUMBER
                : shape.result === 'boolean'
                  ? H_BOOLEAN
                  : H_STRING;
        return { kind: 'string-op', type, span, op, target, args: padded };
      }

      // The landed Array.prototype surface, on the same table discipline: pad optional positions
      // with `undefined` (sound for every op the table holds — `lastIndexOf` lands without its
      // position for exactly the case where it would not be), and take the result type from the
      // table, where `self` is the RECEIVER's own array type and `element` is Unknown by the
      // IndexAccess rule (`pop` on an empty array really answers `undefined`).
      if (isArrayReceiver(obj, checker) && Object.hasOwn(ARRAY_OPS, propName)) {
        const op = propName as ArrayOpName;
        const target = lowerExpression(obj, sourceFile, checker, bindings, diagnostics);
        if (target === null) {
          return null;
        }
        const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
        if (args === null) {
          return null;
        }
        const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
        const shape = ARRAY_OPS[op];
        const padded: Expression[] = [...args];
        while (padded.length < shape.arity) {
          padded.push({ kind: 'undefined-literal', type: H_UNDEFINED, span });
        }
        // `mapped` keeps the checker's answer -- map's element is the callback's to choose and a
        // type-guard filter legitimately narrows below the receiver -- degrading to Unknown when
        // the answer is not an array this model can spell.
        const checkerType = typeAt(node, checker, bindings);
        const type: HType =
          shape.result === 'self'
            ? target.type
            : shape.result === 'checker'
              ? checkerType
              : shape.result === 'mapped'
                ? checkerType.kind === 'array'
                  ? checkerType
                  : { kind: 'array', element: hUnknown(false) }
                : shape.result === 'undefined'
                  ? H_UNDEFINED
                  : shape.result === 'number'
                    ? H_NUMBER
                    : shape.result === 'boolean'
                      ? H_BOOLEAN
                      : shape.result === 'string'
                        ? H_STRING
                        : hUnknown(false);
        return { kind: 'array-op', type, span, op, target, args: padded };
      }

      // `m.get(k)`, `s.add(v)` and the rest. Decided before the class case because a Map has no
      // class declaration at all: the receiver's TYPE is the whole test, and each operation is one
      // runtime function shared by every collection in the program.
      const receiver = typeAt(obj, checker, bindings);
      if (receiver.kind === 'map' || receiver.kind === 'set') {
        // Asked of the TYPE before anything is lowered: `super.m()` reaches this same branch, and
        // `super` names no value, so lowering the receiver to find out what it is would report an
        // error on a call that is perfectly fine.
        const target = lowerExpression(obj, sourceFile, checker, bindings, diagnostics);
        if (target === null) {
          return null;
        }
        {
          const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
          if (args === null) {
            return null;
          }
          const op = collectionOperation(propName);
          if (op === undefined) {
            diagnostics.push(
              diagnosticFromNode(
                expr,
                sourceFile,
                'STA4069',
                'internal',
                'ts',
                `'${propName}' is not an operation of a ${hTypeName(receiver)}`,
              ),
            );
            return null;
          }
          const call: CollectionOp = {
            kind: 'collection-op',
            type: typeAt(node, checker, bindings),
            span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
            collection: receiver.kind,
            op,
            target,
            args,
          };
          return call;
        }
      }

      // `o.m(a)`. The receiver is lowered; the method is NOT -- one function is shared by every
      // instance, so naming its class here is what lets the emitter make a direct call instead of
      // loading a per-instance closure out of a slot.
      if (isClassInstance(obj, checker, bindings)) {
        // `super.m()` is a call on THIS receiver that skips the override -- the object is the same
        // one, only the function differs. So the target is the receiver parameter, not an
        // evaluation of `super`, which names no value at all.
        const viaSuper = obj.kind === ts.SyntaxKind.SuperKeyword;
        const target = viaSuper
          ? receiverIdentifier(obj, sourceFile, bindings, diagnostics)
          : lowerExpression(obj, sourceFile, checker, bindings, diagnostics);
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
        const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
        if (args === null) {
          return null;
        }
        // The DECLARING class, not the receiver's -- `d.describe()` on a `Dog` names `Animal` when
        // `Animal` is where `describe` is written. Naming the receiver's class here would make the
        // emitter look for a method that class does not own.
        const owner = declaringClassName(obj, propName, checker);
        if (owner === null) {
          diagnostics.push(
            diagnosticFromNode(
              expr,
              sourceFile,
              'STA4065',
              'internal',
              'ts',
              `no class in the receiver's ancestry declares method '${propName}'`,
            ),
          );
          return null;
        }
        // The slot is resolved against the receiver's STATIC type and read from its DYNAMIC one,
        // which is sound for the same reason a field slot is: a subclass's method table begins
        // with its base's, in the base's order.
        const slot = target.type.methods.findIndex((m) => m.name === propName);
        if (slot < 0) {
          diagnostics.push(
            diagnosticFromNode(
              expr,
              sourceFile,
              'STA4067',
              'internal',
              'ts',
              `method '${propName}' has no slot in the layout of ${hTypeName(target.type)}`,
            ),
          );
          return null;
        }
        const call: MethodCall = {
          kind: 'method-call',
          type: typeAt(node, checker, bindings),
          span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
          target,
          className: owner,
          method: propName,
          slot,
          // Skipping the override is what `super` MEANS, so this one call stays direct even where
          // every other call to the same method is virtual.
          dispatch:
            !viaSuper && isOverridden(target.type.name, propName, sourceFile, checker)
              ? 'virtual'
              : 'direct',
          args,
        };
        return call;
      }
    }

    // A call to a generic names a SPECIALIZATION, not the generic: `box(1)` is a call to
    // `box<number>`, which `collectSpecializations` has already put in `bindings` under that
    // mangled name. The callee is not lowered as an expression, because the name it would lower to
    // binds nothing -- a generic function has no value (the gate says so, in the same words).
    const specialized = specializedCallee(node, sourceFile, checker, bindings, diagnostics);
    if (specialized === null) {
      return null;
    }

    // An ordinary call's callee is evaluated as a value like any other expression -- the gate has
    // already restricted it to shapes whose value the emitter can produce.
    const callee = specialized ?? lowerExpression(expr, sourceFile, checker, bindings, diagnostics);
    if (callee === null) {
      return null;
    }
    const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
    if (args === null) {
      return null;
    }
    const call: CallExpr = {
      kind: 'call',
      type: typeAt(node, checker, bindings),
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
      bindings.set(statement.name.text, typeAt(statement, checker, bindings));
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
    const type = typeAt(param, checker, bindings);
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
  const declared = typeAt(node, checker, bindings);
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
    isAsync: node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) === true,
    envVars: info?.envVars ?? [],
    captures: info?.captures ?? [],
    needsEnv: info?.needsEnv ?? false,
    provenance: provenanceOf(node, params, type),
  };
  return fn;
}

/** Where a function's signature types came from (docs/HIR.md, plan.md §8 step 1).
 *
 * The question is about the SIGNATURE only. A fully annotated function whose body holds an Unknown
 * is still `typed`: its callers see the signature, and the signature is what a boundary checks.
 *
 * Unknown is asked first because it outranks the other two -- an Unknown parameter is not an
 * un-annotated one the checker happened to solve, it is the request for a dynamic value, and no
 * amount of annotation elsewhere makes the call site static. */
function provenanceOf(node: FunctionLike, params: readonly Parameter[], type: HType): Provenance {
  const ret = type.kind === 'fn' ? type.ret : H_UNDEFINED;
  if (params.some((p) => hTypeHasUnknown(p.type)) || hTypeHasUnknown(ret)) {
    return 'dynamic';
  }
  return node.parameters.every(isAnnotated) && returnIsAnnotated(node) ? 'typed' : 'inferred';
}

/** An explicit type annotation, in either spelling. `x: number` and `@param {number} x` are the
 * same claim by the same author, which is the whole of js mode's JSDoc freebie: annotated
 * JavaScript buys exactly what annotated TypeScript does, and is trusted exactly as little at a
 * boundary. `node.parameters` is the SOURCE's list, so the synthesized receiver never reaches
 * here -- no author wrote it and its type comes from the class layout, not from a claim. */
function isAnnotated(param: ts.ParameterDeclaration): boolean {
  return param.type !== undefined || ts.getJSDocType(param) !== undefined;
}

/** A constructor's return is not writable in either spelling, so it cannot be the missing
 * annotation that demotes one to `inferred`. */
function returnIsAnnotated(node: FunctionLike): boolean {
  return (
    ts.isConstructorDeclaration(node) ||
    node.type !== undefined ||
    ts.getJSDocReturnType(node) !== undefined
  );
}

/** Does this expression evaluate to an instance of a class this subset lays out?
 *
 * Asked of the checker's type rather than of a lowered node, because it decides WHICH lowering to
 * run -- and it must give the same answer `tsTypeToHType` will, since that is what produces the
 * HObject the slot is resolved against. */
function declaringClassName(
  receiver: ts.Expression,
  method: string,
  checker: ts.TypeChecker,
): string | null {
  const declaration = classDeclarationOf(checker.getTypeAtLocation(receiver));
  const owner =
    declaration === undefined ? undefined : methodDeclaringClass(declaration, method, checker);
  return owner?.name?.text ?? null;
}

/* Overriding, and the two questions it raises.
 *
 * A method call is direct -- a named C function, no table, no load -- exactly while the method has
 * ONE implementation for every receiver that can reach the call site. That stops being true the
 * moment two classes in one chain declare the same name, and it stops being true for the whole
 * FAMILY, not just for the pair: a call through a base-typed reference may land on any descendant.
 * So the question is asked of the file, not of the call: does any chain that contains this class
 * declare this method twice? A `yes` makes every call to that name on that family virtual, which
 * is why a class that is never overridden keeps rung 6a's zero-cost direct call unchanged.
 *
 * Scanning per call site is quadratic in a file's classes and linear in its chains. It is also
 * exact, needs no plumbing through the lowering, and a program with enough classes for that to
 * matter has a much larger emitter cost -- memoize when a measurement says to. */
function classesIn(sourceFile: ts.SourceFile): ts.ClassDeclaration[] {
  const found: ts.ClassDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
}

function declaresMethod(declaration: ts.ClassDeclaration, name: string): boolean {
  return declaration.members.some(
    (m) =>
      ts.isMethodDeclaration(m) &&
      !isStaticMember(m) &&
      (ts.isIdentifier(m.name) || ts.isPrivateIdentifier(m.name)) &&
      m.name.text === name,
  );
}

function className(declaration: ts.ClassDeclaration): string {
  return declaration.name?.text ?? '';
}

/** Is `method` declared twice in some chain that contains the class `name`? */
function isOverridden(
  name: string,
  method: string,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): boolean {
  for (const declaration of classesIn(sourceFile)) {
    const chain = ancestry(declaration, checker);
    if (!chain.some((c) => className(c) === name)) {
      continue;
    }
    if (chain.filter((c) => declaresMethod(c, method)).length > 1) {
      return true;
    }
  }
  return false;
}

/** `o.x` and `o.x = v` on an accessor: a call to the member function the mangled name holds.
 *
 * Dispatch is direct because an accessor cannot be overridden here -- the gate refuses a subclass
 * that re-declares an inherited accessor -- so the name resolves to one function. The slot is
 * resolved anyway, so that the node is a well-formed method call and the verifier's check on it
 * means the same thing it means everywhere else. */
function accessorCall(
  kind: 'get' | 'set',
  owner: string,
  target: Expression,
  property: string,
  args: readonly Expression[],
  type: HType,
  span: Span,
  at: ts.Node,
  sourceFile: ts.SourceFile,
  diagnostics: Diagnostic[],
): MethodCall | null {
  const method = accessorName(kind, property);
  const slot =
    target.type.kind === 'object' ? target.type.methods.findIndex((m) => m.name === method) : -1;
  if (slot < 0) {
    diagnostics.push(
      diagnosticFromNode(
        at,
        sourceFile,
        'STA4067',
        'internal',
        'ts',
        `method '${method}' has no slot in the layout of ${hTypeName(target.type)}`,
      ),
    );
    return null;
  }
  return {
    kind: 'method-call',
    type,
    span,
    target,
    className: owner,
    method,
    slot,
    dispatch: 'direct',
    args,
  };
}

/** The class that declares `property` as an accessor for this receiver, or `undefined`. */
function accessorOwner(
  receiver: ts.Expression,
  property: string,
  checker: ts.TypeChecker,
): string | undefined {
  const declaration = classDeclarationOf(checker.getTypeAtLocation(receiver));
  const found =
    declaration === undefined ? undefined : accessorDeclaringClass(declaration, property, checker);
  return found?.owner.name?.text;
}

/** Does this receiver's accessor for `property` have the given half? A property may be read-only
 * or write-only, and each half is a separate member function. */
function hasAccessorHalf(
  receiver: ts.Expression,
  property: string,
  half: 'get' | 'set',
  checker: ts.TypeChecker,
): boolean {
  const declaration = classDeclarationOf(checker.getTypeAtLocation(receiver));
  const found =
    declaration === undefined ? undefined : accessorDeclaringClass(declaration, property, checker);
  return found?.[half] === true;
}

/** The name a member function goes under: its own for a method, the mangled one for an accessor. */
function memberFunctionName(
  member: ts.MethodDeclaration | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
  sourceFile: ts.SourceFile,
): string {
  const spelled = member.name.getText(sourceFile);
  if (ts.isGetAccessorDeclaration(member)) {
    return accessorName('get', spelled);
  }
  return ts.isSetAccessorDeclaration(member) ? accessorName('set', spelled) : spelled;
}

/** A read of the receiver parameter, which is what both `this` and the object of `super.m()` are.
 *
 * The gate admits either only inside a class member, and every class member's parameter list
 * starts with that parameter, so there is nothing left for a `this` node in the HIR to mean. */
function receiverIdentifier(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Identifier | null {
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
  return {
    kind: 'identifier',
    type: binding,
    span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
    name: RECEIVER,
  };
}

function isClassInstance(
  node: ts.Expression,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
): boolean {
  // A class NAME is not an instance of itself, and the checker's type cannot say so: the type of
  // the expression `C` is the class's STATIC side, whose symbol is still the class declaration, so
  // `tsTypeToHType` answers with the very layout `new C()` produces. Only the spelling separates
  // them, which is why this asks the AST and not the type.
  if (
    ts.isIdentifier(node) &&
    ts.isClassDeclaration(checker.getSymbolAtLocation(node)?.valueDeclaration ?? node)
  ) {
    return false;
  }
  return typeAt(node, checker, bindings).kind === 'object';
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
  // An accessor is a member function under a mangled name, so it joins the method list rather
  // than getting a list of its own -- which is what makes the table, dispatch and the receiver
  // parameter apply to it unchanged.
  const methodNodes: (
    | ts.MethodDeclaration
    | ts.GetAccessorDeclaration
    | ts.SetAccessorDeclaration
  )[] = [];
  const staticNodes: (ts.PropertyDeclaration | ts.MethodDeclaration)[] = [];
  for (const member of node.members) {
    // A static belongs to the class object, not to the layout: it is neither a slot nor a member
    // function, so it leaves both lists before either is built.
    if (
      isStaticMember(member) &&
      (ts.isPropertyDeclaration(member) || ts.isMethodDeclaration(member))
    ) {
      staticNodes.push(member);
    } else if (ts.isPropertyDeclaration(member)) {
      if (member.initializer !== undefined) {
        initializers.push(member);
      }
    } else if (ts.isConstructorDeclaration(member)) {
      ctorNode = member;
    } else if (
      ts.isMethodDeclaration(member) ||
      ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member)
    ) {
      methodNodes.push(member);
    }
  }

  // Statics are lowered BEFORE the members, and their bindings are registered in the enclosing
  // scope: a static method's body may read another static (`C.count`), and so may an instance
  // method's, so the names have to exist by the time any body is lowered.
  //
  // Every name is registered BEFORE any value is lowered, for the reason function declarations are
  // hoisted: one static method may call another written below it, and a forward reference is legal
  // source that must not reach an internal error.
  const statics: Declaration[] = [];
  for (const member of staticNodes) {
    bindings.set(
      staticName(node.name.text, member.name.getText(sourceFile)),
      typeAt(member, checker, bindings),
    );
  }
  for (const member of staticNodes) {
    const name = staticName(node.name.text, member.name.getText(sourceFile));
    const at = makeSpan(member.getStart(sourceFile), member.getWidth(sourceFile), sourceFile);
    let value: Expression | null;
    if (ts.isMethodDeclaration(member)) {
      // No receiver: a static method is an ordinary function that happens to be written inside a
      // class. `this` inside one is refused at the gate, which is what makes that true.
      value = lowerFunction(member, sourceFile, checker, bindings, diagnostics);
    } else if (member.initializer === undefined) {
      // A declared-but-uninitialized static reads `undefined`, exactly as a field slot does.
      value = { kind: 'undefined-literal', type: H_UNDEFINED, span: at };
    } else {
      value = lowerExpression(member.initializer, sourceFile, checker, bindings, diagnostics);
    }
    if (value === null) {
      return null;
    }
    const declared = ts.isMethodDeclaration(member)
      ? value.type
      : typeAt(member, checker, bindings);
    statics.push({
      kind: 'declaration',
      type: declared,
      span: at,
      name,
      // `const`: a static method is a function that cannot be reassigned. A static FIELD can be
      // (`C.count++`), which is what makes the two differ here and nowhere else.
      declKind: ts.isMethodDeclaration(member) ? 'const' : 'let',
      value,
    });
    bindings.set(name, declared);
  }

  const methods: ClassMethod[] = [];
  for (const method of methodNodes) {
    const fn = lowerFunction(method, sourceFile, checker, bindings, diagnostics, type);
    if (fn === null) {
      return null;
    }
    methods.push({ name: memberFunctionName(method, sourceFile), fn });
  }

  // A derived class always needs a constructor even with nothing of its own to do, because the
  // BASE's has to run. That is JavaScript's implicit `constructor(...args) { super(...args) }`,
  // and it is why `base !== undefined` joins the two reasons a constructor was needed before.
  const base = baseClassOf(node, checker)?.name?.text;
  let ctor: ClassMethod | undefined;
  if (ctorNode !== undefined || initializers.length > 0 || base !== undefined) {
    const fn =
      ctorNode === undefined
        ? synthesizedConstructor(node, sourceFile, checker, type, base)
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
    // Field initializers run AFTER `super(...)`, never before it: an initializer may read a field
    // the base constructor wrote (`doubled = this.sides * 2`), and in JavaScript `this` does not
    // even exist until super returns. The gate proved super is the first statement when there is
    // one, so "after it" is index 1.
    const statements = fn.body.statements;
    const afterSuper = statements[0]?.kind === 'super-call' ? 1 : 0;
    ctor = {
      name: 'constructor',
      fn: {
        ...fn,
        body: {
          ...fn.body,
          statements: [
            ...statements.slice(0, afterSuper),
            ...prologue,
            ...statements.slice(afterSuper),
          ],
        },
      },
    };
  }

  // A table only where something is overridden. Its entries are file-scope constants, so a class
  // whose methods capture could not have one -- which is why the gate refuses overriding for a
  // class that is not at module scope, and why the empty table here is a real answer rather than
  // a missing one.
  const vtable = type.methods.some((m) => isOverridden(type.name, m.name, sourceFile, checker))
    ? type.methods.map((m) => ({
        name: m.name,
        // The MOST DERIVED declaration this class responds to: same name and same slot as the
        // base's, different implementation. That difference is the whole of overriding.
        className: methodDeclaringClass(node, m.name, checker)?.name?.text ?? type.name,
      }))
    : [];

  return {
    kind: 'class-declaration',
    type: H_UNDEFINED,
    span,
    name: node.name.text,
    ...(base !== undefined && { base }),
    fields,
    ...(ctor !== undefined && { ctor }),
    methods,
    statics,
    vtable,
  };
}

/** `super(a, b)` -> the base constructor run against this constructor's receiver.
 *
 * Everything this needs is already in scope: the receiver is a parameter, and its HObject carries
 * the ancestor names. Nothing is threaded down from `lowerClass`, so the rule "a super call is the
 * base constructor applied to my own receiver" is stated once, here. */
function lowerSuperCall(
  call: ts.CallExpression,
  statement: ts.ExpressionStatement,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Statement | null {
  const span = makeSpan(statement.getStart(sourceFile), statement.getWidth(sourceFile), sourceFile);
  const self = bindings.get(RECEIVER);
  const base = self !== undefined && self.kind === 'object' ? self.bases[0] : undefined;
  if (self === undefined || self.kind !== 'object' || base === undefined) {
    diagnostics.push(
      diagnosticFromNode(
        statement,
        sourceFile,
        'STA4064',
        'internal',
        'ts',
        'super call outside a derived constructor',
      ),
    );
    return null;
  }
  const args = lowerArguments(call.arguments, sourceFile, checker, bindings, diagnostics);
  if (args === null) {
    return null;
  }
  const superCall: SuperCall = {
    kind: 'super-call',
    type: H_UNDEFINED,
    span,
    className: base,
    receiver: { kind: 'identifier', type: self, span, name: RECEIVER },
    args,
  };
  return superCall;
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

/** The constructor a class that writes none gets. Built rather than lowered because there is no
 * declaration to lower.
 *
 * At the root of a chain it is `constructor() {}` -- the receiver in, nothing done, the field
 * initializers the caller prepends being the whole point. In a derived class it is JavaScript's
 * implicit `constructor(...args) { super(...args) }`, so it takes the parameters it forwards. It
 * takes the NEAREST DECLARED ancestor constructor's, since an ancestor that writes none forwards
 * in exactly the same way; that keeps the synthesized arity equal to the arity every caller and
 * the checker already agree on. */
function synthesizedConstructor(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  self: HObject,
  base: string | undefined,
): FunctionExpr {
  const span = makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile);
  const forwarded =
    base === undefined
      ? []
      : (nearestConstructor(node, checker)?.parameters ?? []).map((p, index) => ({
          name: ts.isIdentifier(p.name) ? p.name.text : `_arg${index}`,
          type: tsTypeToHType(checker.getTypeAtLocation(p), checker),
          span,
        }));
  const receiver: Identifier = { kind: 'identifier', type: self, span, name: RECEIVER };
  const statements: Statement[] =
    base === undefined
      ? []
      : [
          {
            kind: 'super-call',
            type: H_UNDEFINED,
            span,
            className: base,
            receiver,
            args: forwarded.map((p) => ({
              kind: 'identifier' as const,
              type: p.type,
              span,
              name: p.name,
            })),
          },
        ];
  return {
    kind: 'function',
    type: hFunction([self, ...forwarded.map((p) => p.type)], H_UNDEFINED),
    span,
    params: [{ name: RECEIVER, type: self, span }, ...forwarded],
    body: { kind: 'block', type: H_UNDEFINED, span, statements },
    isAsync: false,
    envVars: [],
    captures: [],
    needsEnv: false,
    // Nothing here was written, so nothing here was inferred either: every type was copied from a
    // declaration that already had one, and the synthesized constructor is exactly as typed as the
    // ancestor whose parameters it forwards.
    provenance: forwarded.some((p) => hTypeHasUnknown(p.type)) ? 'dynamic' : 'typed',
  };
}

/** The nearest constructor actually written in a class's ancestry, or `undefined` if none is. */
function nearestConstructor(
  declaration: ts.ClassDeclaration,
  checker: ts.TypeChecker,
): ts.ConstructorDeclaration | undefined {
  for (const current of ancestry(declaration, checker).toReversed()) {
    const ctor = current.members.find(ts.isConstructorDeclaration);
    if (ctor !== undefined) {
      return ctor;
    }
  }
  return undefined;
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
    // The file, per span rather than per module: a merged program's statements come from many
    // files, and a #line directive naming the wrong one would point every debugger at it.
    file: sourceFile.fileName,
  };
}

/** One function to emit: a generic declaration plus the tuple it is being built for.
 *
 * The tuple is CONCRETE by construction — `collectSpecializations` refuses to enqueue one that is
 * not — which is what makes the mangled name a complete identity: two calls agree on a
 * specialization exactly when they agree on the tuple, so `box(1)` and `box(2)` share one function
 * and `box('a')` gets its own. */
interface Specialization {
  readonly name: string;
  readonly declaration: ts.FunctionDeclaration;
  readonly substitution: ReadonlyMap<string, HType>;
}

/** How deep a chain of instantiations may go before the compiler stops rather than hangs.
 *
 * `function deeper<T>(x: T): void { deeper([x]); }` instantiates `deeper<T[]>`, then
 * `deeper<T[][]>`, forever: each instantiation is a new tuple, so nothing ever repeats and no
 * dedupe can end it. This is the halting problem in miniature and the answer is a cap, not
 * cleverness — 16 is far past any real generic and small enough that the refusal is instant. */
const MAX_INSTANTIATION_DEPTH = 16;

function isGenericDeclaration(node: ts.FunctionDeclaration): boolean {
  return node.typeParameters !== undefined && node.typeParameters.length > 0;
}

/** Every specialization the file needs, in an order where a caller follows what it calls.
 *
 * The walk is a worklist over TUPLES, not over declarations: the seeds are the generic calls in
 * ordinary code, where every tuple is concrete already, and processing one specialization looks
 * inside the body it is about to emit for further generic calls — whose tuples may mention the type
 * parameters this specialization is substituting, and are made concrete by doing exactly that.
 *
 * `null` means a diagnostic was pushed and the file cannot be lowered. */
function collectSpecializations(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  diagnostics: Diagnostic[],
): Specialization[] | null {
  const emitted = new Map<string, Specialization>();
  const queue: { readonly specialization: Specialization; readonly depth: number }[] = [];
  let failed = false;

  /** Records one call's instantiation, with `substitution` — the enclosing specialization's, empty
   * at the top level — applied to the tuple the checker inferred. */
  const request = (
    call: ts.CallExpression,
    substitution: ReadonlyMap<string, HType>,
    depth: number,
  ): void => {
    const instantiation = genericCallInstantiation(call, checker);
    if (instantiation.kind !== 'generic') {
      return;
    }
    const typeArguments = instantiation.typeArguments.map((t) =>
      substituteHType(t, (name) => substitution.get(name)),
    );
    if (typeArguments.some(hasTypeParam)) {
      // Unreachable for a well-formed program: the enclosing specialization substitutes every type
      // parameter in scope, so a leftover means the two walks disagree about which are in scope.
      diagnostics.push(
        diagnosticFromNode(
          call,
          sourceFile,
          'STA4070',
          'internal',
          'ts',
          `generic call still mentions a type parameter after substitution: ${typeArguments.map(hTypeName).join(', ')}`,
        ),
      );
      failed = true;
      return;
    }
    const name = specializationName(instantiation.declaration.name?.text ?? '', typeArguments);
    if (emitted.has(name)) {
      return;
    }
    if (depth > MAX_INSTANTIATION_DEPTH) {
      diagnostics.push(
        diagnosticFromNode(
          call,
          sourceFile,
          'STA2003',
          'error',
          'ts',
          `generic instantiation is more than ${String(MAX_INSTANTIATION_DEPTH)} deep at '${name}'; it does not terminate`,
        ),
      );
      failed = true;
      return;
    }
    const parameters = instantiation.declaration.typeParameters ?? [];
    const substitutionFor = new Map<string, HType>();
    parameters.forEach((parameter, index) => {
      const argument = typeArguments[index];
      if (argument !== undefined) {
        substitutionFor.set(parameter.name.text, argument);
      }
    });
    const specialization: Specialization = {
      name,
      declaration: instantiation.declaration,
      substitution: substitutionFor,
    };
    emitted.set(name, specialization);
    queue.push({ specialization, depth });
  };

  /** Every call in `root`, skipping the bodies of generic declarations — those are reached through
   * the worklist instead, once there is a tuple to read them under. */
  const walkCalls = (
    root: ts.Node,
    substitution: ReadonlyMap<string, HType>,
    depth: number,
  ): void => {
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && isGenericDeclaration(node) && node !== root) {
        return;
      }
      if (ts.isCallExpression(node)) {
        request(node, substitution, depth);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(root, visit);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && isGenericDeclaration(statement)) {
      continue;
    }
    walkCalls(statement, new Map(), 1);
  }
  // A plain index rather than `shift()`: the queue only grows, and the order it grows in is the
  // order the specializations are emitted in, which keeps the output stable across runs.
  for (let i = 0; i < queue.length && !failed; i++) {
    const item = queue[i];
    if (item === undefined) {
      continue;
    }
    walkCalls(item.specialization.declaration, item.specialization.substitution, item.depth + 1);
  }
  return failed ? null : [...emitted.values()];
}

/** The identifier naming the specialization this call resolves to.
 *
 * `undefined` means the call is not to a generic and the ordinary path applies; `null` means it is
 * and something went wrong, with a diagnostic already pushed. The mangled name is recomputed here
 * from the same inputs `collectSpecializations` used — the call and the enclosing substitution — so
 * the two cannot name different functions without disagreeing about the call itself. */
function specializedCallee(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Identifier | null | undefined {
  const instantiation = genericCallInstantiation(node, checker);
  if (instantiation.kind !== 'generic') {
    return undefined;
  }
  const typeArguments = instantiation.typeArguments.map((t) =>
    substituteHType(t, (name) => bindings.get(typeParameterKey(name))),
  );
  const name = specializationName(instantiation.declaration.name?.text ?? '', typeArguments);
  const type = bindings.get(name);
  if (type === undefined) {
    diagnostics.push(
      diagnosticFromNode(
        node,
        sourceFile,
        'STA4070',
        'internal',
        'ts',
        `no specialization '${name}' was collected for this call`,
      ),
    );
    return null;
  }
  return {
    kind: 'identifier',
    type,
    span: makeSpan(
      node.expression.getStart(sourceFile),
      node.expression.getWidth(sourceFile),
      sourceFile,
    ),
    name,
  };
}

/** The specialization's own function type: the generic's signature with the substitution applied. */
function specializationType(specialization: Specialization, checker: ts.TypeChecker): HType {
  const declared = tsTypeToHType(checker.getTypeAtLocation(specialization.declaration), checker);
  return substituteHType(declared, (name) => specialization.substitution.get(name));
}

/** Lowers the generic's body a second time, with its type parameters bound.
 *
 * This is the whole of monomorphization: no HIR is cloned and no type is rewritten after the fact,
 * because `typeAt` reads the substitution out of the binding map at the one point a `ts.Type`
 * becomes an HType. The emitted function keeps the SOURCE's name for printing (`[Function: box]`,
 * as Node prints it) — only the binding it is reached through is mangled. */
function lowerSpecialization(
  specialization: Specialization,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): FunctionDeclaration | null {
  const inner = new Map(bindings);
  for (const [parameter, type] of specialization.substitution) {
    inner.set(typeParameterKey(parameter), type);
  }
  const fn = lowerFunction(specialization.declaration, sourceFile, checker, inner, diagnostics);
  if (fn === null) {
    return null;
  }
  const node = specialization.declaration;
  return {
    kind: 'function-declaration',
    type: H_UNDEFINED,
    span: makeSpan(node.getStart(sourceFile), node.getWidth(sourceFile), sourceFile),
    name: specialization.name,
    fn,
  };
}

/** A type parameter's binding key inside `bindings`: `<T>`.
 *
 * The same unspellable-name trick the receiver parameter plays with a leading space and a static
 * with a dot. No identifier may contain an angle bracket, so a substitution can share the binding
 * map with the program's own names without either being able to reach the other — and the map is
 * already threaded through every function in this file, which is why the substitution needs no
 * parameter of its own and no mutable state to leak between specializations. */
function typeParameterKey(name: string): string {
  return `<${name}>`;
}

/** The HType of a node, with the enclosing specialization's substitution applied.
 *
 * EVERY type read in the lowering goes through here rather than calling `tsTypeToHType` directly,
 * and that is what keeps a type parameter out of the HIR: substitution happens at the one point a
 * `ts.Type` becomes an HType, so no node is ever built carrying a `T` that a later pass would have
 * to find and rewrite. Outside a specialization the lookup finds nothing and this is `tsTypeToHType`
 * exactly. */
function typeAt(node: ts.Node, checker: ts.TypeChecker, bindings: Map<string, HType>): HType {
  return substituteHType(tsTypeToHType(checker.getTypeAtLocation(node), checker), (name) =>
    bindings.get(typeParameterKey(name)),
  );
}

/** Every argument of a call, lowered left to right, or `null` if any of them failed.
 *
 * Six call shapes lower arguments — `new`, `console.log`, a collection operation, a method call, an
 * ordinary call and `super(...)` — and every one of them lowers left to right and abandons the whole
 * call on the first failure. That is not a coincidence to be factored for tidiness: argument order
 * IS evaluation order, and a copy of this loop that drifted would reorder a user's side effects. */
/** The sole argument of a one-argument namespace call, lowered -- `null` when lowering failed.
 * The gate already pinned the arity, so a missing argument here is unreachable, not a diagnostic. */
function lowerOnlyArgument(
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Expression | null {
  const args = lowerArguments(node.arguments, sourceFile, checker, bindings, diagnostics);
  return args?.[0] ?? null;
}

function lowerArguments(
  nodes: readonly ts.Expression[] | undefined,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  bindings: Map<string, HType>,
  diagnostics: Diagnostic[],
): Expression[] | null {
  const args: Expression[] = [];
  for (const node of nodes ?? []) {
    const lowered = lowerExpression(node, sourceFile, checker, bindings, diagnostics);
    if (lowered === null) {
      return null;
    }
    args.push(lowered);
  }
  return args;
}

/** The operation a Map or Set method name denotes, or undefined for a name that is not one.
 *
 * The gate has already refused every other name, so `undefined` here is an internal error rather
 * than a user-facing refusal -- which is exactly why this returns rather than throwing: the caller
 * reports it with a span, and the compiler does not stack-trace at the CLI. */
function collectionOperation(name: string): CollectionOperation | undefined {
  switch (name) {
    case 'get':
    case 'set':
    case 'has':
    case 'delete':
    case 'clear':
    case 'add':
    case 'size':
    case 'forEach':
      return name;
    default:
      // The ES2025 set operations, which are a table rather than seven more cases -- the gate and
      // the verifier read the same one.
      return isSetOperation(name) ? name : undefined;
  }
}

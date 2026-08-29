import * as ts from 'typescript';
import type { Diagnostic } from '../support/diagnostics.ts';
import { diagnosticFromFile, diagnosticFromNode } from '../support/diagnostics.ts';
import { hasExplicitAny, isImplicitAny } from './types.ts';

type Mode = 'ts' | 'js';

/** The mode policy gate: enforces subset acceptance and typing rules.
 * In ts mode: rejects untyped code entirely.
 * In js mode: accepts both .ts and .js files; untyped becomes Unknown/dynamic.
 * Gating decisions produce diagnostics; nothing below the gate knows the mode exists.
 */
export function gateProgram(program: ts.Program, mode: Mode): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const typeChecker = program.getTypeChecker();

  // Check each source file
  for (const sourceFile of program.getSourceFiles()) {
    // Declaration files describe an interface; they never execute, so there is no construct here
    // to accept or defer. This covers the TypeScript libs, Stator's own globals, and any `.d.ts`
    // the user brings.
    if (sourceFile.isDeclarationFile || program.isSourceFileDefaultLibrary(sourceFile)) {
      continue;
    }

    // In ts mode: reject .js files entirely
    if (mode === 'ts' && sourceFile.fileName.endsWith('.js')) {
      diagnostics.push(
        diagnosticFromFile(
          sourceFile.fileName,
          1,
          1,
          'STA1002',
          'never',
          mode,
          '.js files are not allowed in ts mode; use `--mode=js` or convert to .ts',
        ),
      );
      continue;
    }

    // Walk the AST and gate each node
    visitNode(sourceFile, sourceFile, typeChecker, mode, diagnostics);
  }

  return diagnostics;
}

/** Recursively visit and gate all nodes in the tree. */
function visitNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  typeChecker: ts.TypeChecker,
  mode: Mode,
  diagnostics: Diagnostic[],
): void {
  // Check for explicit `any` in ts mode (STA1001)
  if (mode === 'ts' && hasExplicitAny(node)) {
    diagnostics.push(
      diagnosticFromNode(
        node,
        sourceFile,
        'STA1001',
        'never',
        mode,
        "explicit 'any' is not allowed in ts mode; use 'unknown' instead",
      ),
    );
  }

  // Check for implicit `any` in ts mode (STA1003)
  if (mode === 'ts' && isImplicitAny(node, typeChecker)) {
    diagnostics.push(
      diagnosticFromNode(
        node,
        sourceFile,
        'STA1003',
        'never',
        mode,
        "implicit 'any' is not allowed in ts mode; add a type annotation",
      ),
    );
  }

  // Type annotations are the checker's business, not the gate's. They carry no runtime construct
  // to accept or defer, and running them through gateConstruct would reject `let x: number = 1`
  // -- the NumberKeyword node is not in any value-level accept list. The `any` checks above still
  // apply, and we still recurse so a nested `any` (e.g. `Array<any>`) is found.
  if (ts.isTypeNode(node)) {
    ts.forEachChild(node, (child) => visitNode(child, sourceFile, typeChecker, mode, diagnostics));
    return;
  }

  // Gate specific constructs: accept the micro-subset, reject the rest
  const gateResult = gateConstruct(node, mode, typeChecker);
  if (gateResult.kind === 'not-yet') {
    diagnostics.push(
      diagnosticFromNode(
        node,
        sourceFile,
        gateResult.code,
        'not-yet',
        mode,
        gateResult.message,
        gateResult.phase,
      ),
    );
    // A rejected construct's children add nothing: one diagnostic per construct beats a cascade
    // naming every subexpression of a function body the user already knows is unsupported.
    return;
  }
  if (gateResult.kind === 'never') {
    diagnostics.push(
      diagnosticFromNode(node, sourceFile, gateResult.code, 'never', mode, gateResult.message),
    );
    return;
  }

  // Recurse
  ts.forEachChild(node, (child) => visitNode(child, sourceFile, typeChecker, mode, diagnostics));
}

type GateResult =
  | { kind: 'accept' }
  /** Rejected by design and forever -- STA10xx/STA11xx, and never a phase (plan §1.3). */
  | { kind: 'never'; code: string; message: string }
  /** Outside the current subset but scheduled -- STA12xx, and the phase is part of the message. */
  | { kind: 'not-yet'; code: string; message: string; phase: number };

/** Decide whether one construct is in the Phase 2 micro-subset.
 *
 * THE INVARIANT: this accept set must equal the vocabulary of `src/hir/nodes.ts`, exactly. A
 * construct accepted here but absent from the HIR reaches the lowering, which can only answer
 * with an STA4xxx internal error -- the compiler blaming itself for source it chose to accept.
 * Widening the HIR and widening this function are the same change; do them together.
 *
 * Accepts today: number/string/boolean literals, `null` and `undefined`, identifiers, `let`/`const`
 * with an initializer, plain `=` assignment, the nineteen binary operators and three
 * short-circuiting operators the HIR models, prefix `- + ! ~`, parentheses, `console.log(x)` with
 * exactly one argument, expression statements, blocks, `if`/`else`, and `while`.
 */
function gateConstruct(node: ts.Node, mode: Mode, typeChecker: ts.TypeChecker): GateResult {
  const kind = node.kind;

  // Tokens carry no independent meaning: an operator token, keyword, or punctuation is only ever
  // reached as a child of a construct this function already ruled on. Gating them separately
  // would reject `1 + 2` for containing a PlusToken.
  if (kind <= ts.SyntaxKind.LastToken && kind !== ts.SyntaxKind.Identifier) {
    return { kind: 'accept' };
  }

  switch (kind) {
    // Structure that maps 1:1 onto HIR statements.
    case ts.SyntaxKind.SourceFile:
    case ts.SyntaxKind.VariableStatement:
    case ts.SyntaxKind.ExpressionStatement:
    case ts.SyntaxKind.Block:
    case ts.SyntaxKind.IfStatement:
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement:
    case ts.SyntaxKind.ForStatement:
    // A switch and its parts. CaseBlock/CaseClause/DefaultClause are nodes rather than tokens, so
    // each needs a case of its own -- the same trap TemplateSpan sprang (plan-notes 37).
    case ts.SyntaxKind.SwitchStatement:
    case ts.SyntaxKind.CaseBlock:
    case ts.SyntaxKind.CaseClause:
    case ts.SyntaxKind.DefaultClause:
      return { kind: 'accept' };

    case ts.SyntaxKind.BreakStatement:
    case ts.SyntaxKind.ContinueStatement:
      return { kind: 'accept' };

    // The three function spellings share one HIR node (`FunctionExpr`), so they share one gate.
    case ts.SyntaxKind.FunctionDeclaration:
    case ts.SyntaxKind.FunctionExpression:
    case ts.SyntaxKind.ArrowFunction:
      return gateFunction(
        node as ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
      );

    case ts.SyntaxKind.Parameter:
      return gateParameter(node as ts.ParameterDeclaration);

    // `return;` and `return e;`. That a return sits inside a function is a structural fact the
    // HIR verifier checks; the gate only decides the construct is in the subset.
    case ts.SyntaxKind.ReturnStatement:
      return { kind: 'accept' };

    // `outer: for (…)`. Only a loop or switch may carry a label here, because those are the only
    // HIR nodes with a place to put one. `foo: { … }` is legal JavaScript but would need a label
    // that is not attached to anything the HIR models.
    case ts.SyntaxKind.LabeledStatement: {
      const labelled = (node as ts.LabeledStatement).statement;
      return isLabellable(labelled)
        ? { kind: 'accept' }
        : notYet('a label on anything but a loop or switch is not yet supported', 3);
    }

    // `;` on its own lowers to nothing at all -- accepted so it is not a diagnostic, dropped by
    // the lowering rather than given an HIR node.
    case ts.SyntaxKind.EmptyStatement:
      return { kind: 'accept' };

    // Parentheses are pure grouping: the HIR tree already encodes the precedence they expressed,
    // so the lowering unwraps them instead of modelling them.
    case ts.SyntaxKind.ParenthesizedExpression:
      return { kind: 'accept' };

    case ts.SyntaxKind.Identifier:
      return gateIdentifier(node as ts.Identifier, typeChecker);

    case ts.SyntaxKind.VariableDeclarationList:
      return gateDeclarationList(node as ts.VariableDeclarationList, mode);

    case ts.SyntaxKind.VariableDeclaration:
      return gateDeclaration(node as ts.VariableDeclaration);

    case ts.SyntaxKind.BinaryExpression:
      return gateBinary(node as ts.BinaryExpression, typeChecker);

    case ts.SyntaxKind.PrefixUnaryExpression:
      return gatePrefixUnary(node as ts.PrefixUnaryExpression, typeChecker);

    case ts.SyntaxKind.PostfixUnaryExpression:
      return gateUpdate(node);

    case ts.SyntaxKind.CallExpression:
      return gateCall(node as ts.CallExpression, typeChecker);

    // Template literals. The no-substitution form is just a string; the substitution form is
    // TemplateLiteral, whose children (spans, head, middles, tail) are tokens and accepted above.
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateExpression:
    // A TemplateSpan is the pairing of one hole with the literal chunk that follows it. It is a
    // node rather than a token, so it needs an explicit case; its children are gated normally.
    case ts.SyntaxKind.TemplateSpan:
      return { kind: 'accept' };

    // Three shapes only: the callee of an accepted `console.log` (gateCall already vetted the whole
    // call, and this node is its child), and `.length` on a string or an array.
    case ts.SyntaxKind.PropertyAccessExpression: {
      const access = node as ts.PropertyAccessExpression;
      if (
        isConsoleLog(access) ||
        isStringLength(access, typeChecker) ||
        isArrayLength(access, typeChecker)
      ) {
        return { kind: 'accept' };
      }
      return gateMemberAccess(access, typeChecker);
    }

    case ts.SyntaxKind.ArrayLiteralExpression:
      return gateArrayLiteral(node as ts.ArrayLiteralExpression);

    case ts.SyntaxKind.ElementAccessExpression:
      return gateElementAccess(node as ts.ElementAccessExpression, typeChecker);

    case ts.SyntaxKind.ForOfStatement:
      return gateForOf(node as ts.ForOfStatement, typeChecker);

    case ts.SyntaxKind.ClassDeclaration:
      return gateClass(node as ts.ClassDeclaration);

    // The members of an accepted class. gateClass already vetted the class as a whole -- these are
    // its children, reached on the way down, and their own children are gated normally.
    case ts.SyntaxKind.PropertyDeclaration:
    case ts.SyntaxKind.MethodDeclaration:
    case ts.SyntaxKind.Constructor:
      return { kind: 'accept' };

    case ts.SyntaxKind.NewExpression:
      return gateNew(node as ts.NewExpression, typeChecker);

    case ts.SyntaxKind.ThisKeyword:
      return gateThis(node);

    // Permanently rejected in ts mode, by design -- these are the escape hatches that make static
    // compilation impossible (plan §0.1), not features waiting on a phase.
    case ts.SyntaxKind.WithStatement:
      return mode === 'ts'
        ? { kind: 'never', code: 'STA1107', message: 'with statements are not allowed in ts mode' }
        : notYet('with statements are not yet supported', 8);

    // Scheduled features that already own a code: the message must name the same phase the
    // diagnostics table does, or `stator explain` and docs/DIAGNOSTICS.md disagree.
    case ts.SyntaxKind.AwaitExpression:
    case ts.SyntaxKind.YieldExpression:
      return {
        kind: 'not-yet',
        code: 'STA1201',
        message:
          'async/await and generators are not yet supported; planned for Phase 4 (runtime v1)',
        phase: 4,
      };

    default:
      return notYet(`${describeKind(kind)} is not yet supported`, 3);
  }
}

/** One code for the whole Phase 2 boundary. These constructs are not deferred for six different
 * reasons -- they are deferred for one, the walking skeleton, and they all arrive together. The
 * message names the construct; the code names the boundary. */
function notYet(message: string, phase: number): GateResult {
  return {
    kind: 'not-yet',
    code: 'STA1214',
    message: `${message}; planned for Phase ${phase}`,
    phase,
  };
}

/** Readable construct names for the catch-all message. `ts.SyntaxKind[kind]` gives the enum name
 * ("ForStatement"), which is accurate but reads like an internal error to a user. */
function describeKind(kind: ts.SyntaxKind): string {
  switch (kind) {
    // The C-style `for` is lowered; these two are not, and they are deferred for a reason of
    // their own -- both iterate a collection, so they arrive with arrays and the object model
    // rather than with control flow.
    case ts.SyntaxKind.ForOfStatement:
      return 'for...of loops';
    case ts.SyntaxKind.ForInStatement:
      return 'for...in loops';
    case ts.SyntaxKind.ClassDeclaration:
    case ts.SyntaxKind.ClassExpression:
      return 'classes';
    case ts.SyntaxKind.TryStatement:
      return 'try/catch/finally';
    case ts.SyntaxKind.ThrowStatement:
      return 'throw';
    case ts.SyntaxKind.ArrayLiteralExpression:
      return 'array literals';
    case ts.SyntaxKind.ObjectLiteralExpression:
      return 'object literals';
    case ts.SyntaxKind.ElementAccessExpression:
      return 'index access';
    case ts.SyntaxKind.ConditionalExpression:
      return 'the conditional (?:) operator';
    case ts.SyntaxKind.ImportDeclaration:
    case ts.SyntaxKind.ExportDeclaration:
    case ts.SyntaxKind.ExportAssignment:
      return 'modules';
    default:
      return `this construct (${ts.SyntaxKind[kind]})`;
  }
}

/** Cross-function references are what rung 4b implements, so an identifier is accepted on its own.
 * The one shape held back: a binding declared inside a loop is a FRESH binding per iteration, and
 * rung 4b gives a function one environment per call, so every iteration's closure would share the
 * one slot and read the last iteration's value. Reject the capture rather than emit that program. */
function gateIdentifier(node: ts.Identifier, typeChecker: ts.TypeChecker): GateResult {
  const symbol = typeChecker.getSymbolAtLocation(node);
  const decl = symbol?.valueDeclaration;
  // A class NAME is not a value here. Three spellings are not uses of the value and must pass:
  // the declaration's own name, the callee of `new` (gateNew consumes the whole expression and the
  // emitter names the descriptor), and a type annotation -- `x: Point` mentions the class as a
  // TYPE, which erases. What is left is a class being passed, stored or compared, which needs the
  // class object rung 6b allocates.
  if (
    decl !== undefined &&
    ts.isClassDeclaration(decl) &&
    ts.getNameOfDeclaration(decl) !== node &&
    !ts.isTypeNode(node.parent) &&
    !(ts.isNewExpression(node.parent) && node.parent.expression === node)
  ) {
    return notYet('using a class as a value is not yet supported', 3);
  }
  // A global the compiler does not model -- `String`, `Number`, `parseInt`, `NaN`, `Infinity`,
  // `Math`, `globalThis`, `console` as a value, and everything else that resolves outside the
  // module being compiled. The lowering creates bindings only for declarations it lowers, so every
  // one of these used to be ACCEPTED here and then hit `STA4035 identifier used before
  // declaration` -- an INTERNAL error, for legal source. The accept set has to equal the HIR's
  // vocabulary (plan §0), and the HIR has no vocabulary for the global object.
  //
  // `undefined` is the one exception, and it is exempted by name here because the lowering
  // special-cases it by name too: it answers with an undefined-literal, and both sides have to
  // agree or the invariant above is broken again in the other direction.
  if (symbol !== undefined && node.text !== 'undefined' && isGlobalReference(node)) {
    // Declared in a declaration file (`lib.es5.d.ts`, `stator.globals.d.ts`) -- an ambient value
    // with no body to lower -- or declared nowhere at all, which is how the checker models
    // `globalThis`. `every` rather than `some`: a name that IS declared in user code is a
    // user binding, whatever else merges into it.
    const declarations = symbol.declarations ?? [];
    if (declarations.every((d) => d.getSourceFile().isDeclarationFile)) {
      return notYet(`the global '${node.text}' is not yet supported`, 4);
    }
  }
  if (decl === undefined || enclosingFunction(decl) === enclosingFunction(node)) {
    return { kind: 'accept' };
  }
  return loopScopeOf(decl) === undefined
    ? { kind: 'accept' }
    : notYet('capturing a variable declared inside a loop is not yet supported', 3);
}

/** Whether this identifier is a scope reference — a program actually READING the binding — as
 * opposed to a spelling that merely mentions the name. Three mentions reach the walker and none of
 * them is a use of the global they resolve to:
 *
 *   - a type position: `x: String` erases, and there is nothing to lower;
 *   - the NAME half of a property access: `s.length` and `p.x` are answered by the object's shape,
 *     never by scope, so the fact that `length` resolves to a lib declaration is an accident;
 *   - `console` in `console.log(x)`: the whole call is one HIR node that `gateCall` already vetted,
 *     and the walker descends into its children anyway.
 */
function isGlobalReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isTypeNode(parent)) {
    return false;
  }
  if (ts.isPropertyAccessExpression(parent)) {
    return !(parent.name === node || (parent.expression === node && isConsoleLog(parent)));
  }
  return true;
}

/** The nearest enclosing function, never the node itself: a nested `function g` lives in the scope
 * of the function around it, and a parameter lives in the scope of the function it belongs to. */
function enclosingFunction(node: ts.Node): ts.Node | undefined {
  for (let n = node.parent as ts.Node | undefined; n !== undefined; n = n.parent) {
    if (ts.isFunctionLike(n)) {
      return n;
    }
  }
  return undefined;
}

/** The loop giving `decl` a fresh binding each iteration. Searched no further out than the function
 * that owns the declaration -- a loop outside that function re-runs the call, not the binding. */
function loopScopeOf(decl: ts.Node): ts.Node | undefined {
  for (let n = decl.parent as ts.Node | undefined; n !== undefined; n = n.parent) {
    if (ts.isFunctionLike(n)) {
      return undefined;
    }
    if (ts.isIterationStatement(n, false)) {
      return n;
    }
  }
  return undefined;
}

function gateDeclarationList(list: ts.VariableDeclarationList, mode: Mode): GateResult {
  if ((list.flags & ts.NodeFlags.Let) !== 0 || (list.flags & ts.NodeFlags.Const) !== 0) {
    return { kind: 'accept' };
  }
  // `var` is rejected in ts mode by DESIGN, not by schedule: function-scoped hoisting with a
  // temporal dead zone is exactly the dynamic-scoping behaviour the strict mode exists to exclude.
  // It carries a never code and therefore no phase (plan §1.3).
  if (mode === 'ts') {
    return {
      kind: 'never',
      code: 'STA1104',
      message: 'var is not allowed in ts mode; use let or const instead',
    };
  }
  return notYet('var is not yet supported in js mode', 5);
}

function gateDeclaration(decl: ts.VariableDeclaration): GateResult {
  // `let x;` would need definite-assignment analysis to know whether a read yields undefined,
  // which is Phase 3 work. The HIR's Declaration requires an initializer for the same reason.
  // A for-of binding is the exception and not an exception to the reasoning: `for (const x of a)`
  // has no initializer to write because the LOOP assigns it, definitely, before the body runs.
  if (decl.initializer === undefined && !isForOfBinding(decl)) {
    return notYet('a declaration without an initializer is not yet supported', 3);
  }
  // Destructuring binds several names from one value; the HIR has one name per Declaration.
  if (!ts.isIdentifier(decl.name)) {
    return notYet('destructuring declarations are not yet supported', 3);
  }
  return { kind: 'accept' };
}

function gateBinary(bin: ts.BinaryExpression, typeChecker: ts.TypeChecker): GateResult {
  switch (bin.operatorToken.kind) {
    // Every operator BinaryOp and LogicalOp model, plus plain assignment. Loose equality is here
    // rather than deferred because docs/NUMERIC.md §6.3 defines it for primitives without any
    // object model: the `ToPrimitive` half of the table is unreachable while the only values are
    // primitives, and the lowering emits a runtime call that will grow that half in place.
    case ts.SyntaxKind.PlusToken:
    case ts.SyntaxKind.MinusToken:
    case ts.SyntaxKind.AsteriskToken:
    case ts.SyntaxKind.SlashToken:
    case ts.SyntaxKind.PercentToken:
    case ts.SyntaxKind.LessThanToken:
    case ts.SyntaxKind.GreaterThanToken:
    case ts.SyntaxKind.LessThanEqualsToken:
    case ts.SyntaxKind.GreaterThanEqualsToken:
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
    case ts.SyntaxKind.EqualsEqualsToken:
    case ts.SyntaxKind.ExclamationEqualsToken:
    case ts.SyntaxKind.AmpersandToken:
    case ts.SyntaxKind.BarToken:
    case ts.SyntaxKind.CaretToken:
    case ts.SyntaxKind.LessThanLessThanToken:
    case ts.SyntaxKind.GreaterThanGreaterThanToken:
    case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
    case ts.SyntaxKind.AmpersandAmpersandToken:
    case ts.SyntaxKind.BarBarToken:
    case ts.SyntaxKind.QuestionQuestionToken:
      return { kind: 'accept' };

    case ts.SyntaxKind.EqualsToken:
      // A bare name is HIR Assignment, `a[i] = v` is IndexAssignment, `o.x = v` is FieldAssignment.
      // Neither member form is re-checked here for what it is a member OF: this node's child is
      // gated in its own right, and gateElementAccess and gateMemberAccess are where that lives.
      return isAssignableTarget(bin.left, typeChecker)
        ? { kind: 'accept' }
        : notYet('assignment to anything but a variable is not yet supported', 3);

    // `x += e` on an identifier folds to `x = x + e`, sound because a bare identifier cannot have
    // side effects. An element target cannot use that fold -- `a[i()] += 1` must call `i` ONCE --
    // so the lowering hoists the target and the index into temporaries and reads the element from
    // those (the promise rung 3 made in plan-notes 43, kept here).
    case ts.SyntaxKind.PlusEqualsToken:
    case ts.SyntaxKind.MinusEqualsToken:
    case ts.SyntaxKind.AsteriskEqualsToken:
    case ts.SyntaxKind.SlashEqualsToken:
    case ts.SyntaxKind.PercentEqualsToken:
      if (!isAssignableTarget(bin.left, typeChecker)) {
        return notYet('compound assignment to anything but a variable is not yet supported', 3);
      }
      return gateUpdate(bin);

    default:
      return notYet('this operator is not yet supported', 3);
  }
}

function gatePrefixUnary(unary: ts.PrefixUnaryExpression, typeChecker: ts.TypeChecker): GateResult {
  switch (unary.operator) {
    // `-x`, `+x`, `!x`, `~x` all map onto UnaryOp. `-<numeric literal>` additionally gets folded
    // into a single NumberLiteral by the lowering, but that is an optimization, not the reason
    // the operator is accepted.
    case ts.SyntaxKind.MinusToken:
    case ts.SyntaxKind.PlusToken:
    case ts.SyntaxKind.ExclamationToken:
    case ts.SyntaxKind.TildeToken:
      return { kind: 'accept' };

    // `++x` reads AND writes; it is an assignment wearing an operator's clothes, so it is subject
    // to the same positional rule as compound assignment.
    case ts.SyntaxKind.PlusPlusToken:
    case ts.SyntaxKind.MinusMinusToken:
      if (!isAssignableTarget(unary.operand, typeChecker)) {
        return notYet('++ and -- on anything but a variable are not yet supported', 3);
      }
      return gateUpdate(unary);

    default:
      return notYet('this unary operator is not yet supported', 3);
  }
}

/** `x += e`, `x++`, `--x` — accepted only where their VALUE is discarded.
 *
 * All three read a variable, write it back, and also produce a value, and it is the third part
 * that is expensive: `y = x++` yields the value x had *before* the write, so it needs a temporary
 * that the increment cannot clobber, and `y = (x += 1)` yields the value after. Where the result
 * is thrown away the distinction vanishes, and the whole construct collapses to an Assignment the
 * HIR already has — which is exactly the two positions accepted here.
 *
 * Deciding this at the gate rather than in the lowering is deliberate. The gate's accept set must
 * equal the HIR's vocabulary (docs/HIR.md), and the HIR has no node for a value-producing update;
 * letting the syntax through and rejecting it one layer down would put a construct below the gate
 * that nothing below the gate can represent — the shape of both plan-notes 30 and 37. */
/** What a read-modify-write may be applied to: a variable, or an array element.
 *
 * Both are the HIR's vocabulary -- `Assignment` and `IndexAssignment` -- and the gate's accept set
 * must equal that vocabulary exactly, which is why this is one predicate rather than a check
 * duplicated at each operator. The element case is admitted here and vetted for real by
 * gateElementAccess when the child node is reached. */
function isAssignableTarget(node: ts.Expression, checker: ts.TypeChecker): boolean {
  if (ts.isIdentifier(node) || ts.isElementAccessExpression(node)) {
    return true;
  }
  // A field, and ONLY a field: `a.length = 0` is a property access too, and writing it resizes an
  // array -- which is a hole-creating operation the dense representation refuses (STA2002).
  return (
    ts.isPropertyAccessExpression(node) &&
    classDeclarationOf(checker.getTypeAtLocation(node.expression)) !== undefined
  );
}

function gateUpdate(node: ts.Node): GateResult {
  const parent: ts.Node | undefined = node.parent;
  if (parent === undefined) {
    return notYet('++, -- and compound assignment are not yet supported here', 3);
  }
  // Statement position: the value is discarded by the language itself.
  if (ts.isExpressionStatement(parent)) {
    return { kind: 'accept' };
  }
  // A `for` header's third slot, which discards it the same way. `initializer` is NOT included:
  // it is a statement slot the lowering handles separately, and a bare `i++` there is legal but
  // pointless, so it arrives via the ExpressionStatement path or not at all.
  if (ts.isForStatement(parent) && parent.incrementor === node) {
    return { kind: 'accept' };
  }
  return notYet('using the value of ++, -- or a compound assignment is not yet supported', 3);
}

/** Loops and switches are the only statements with somewhere to put a label. */
function isLabellable(stmt: ts.Statement): boolean {
  return (
    ts.isForStatement(stmt) ||
    ts.isForOfStatement(stmt) ||
    ts.isWhileStatement(stmt) ||
    ts.isDoStatement(stmt) ||
    ts.isSwitchStatement(stmt)
  );
}

function gateCall(call: ts.CallExpression, typeChecker: ts.TypeChecker): GateResult {
  if (call.typeArguments !== undefined) {
    return notYet('explicit type arguments on a call are not yet supported', 3);
  }
  const callee = skipParens(call.expression);

  // Two property-access callees, each its own HIR node: `console.log`, and a method of a class
  // this subset lays out. Anything else -- a method on a built-in, on an object literal, on an
  // interface-typed value -- needs the shape lookup the dynamic path will bring.
  if (ts.isPropertyAccessExpression(callee)) {
    if (isConsoleLog(callee)) {
      return call.arguments.length === 1
        ? { kind: 'accept' }
        : notYet('console.log with other than one argument is not yet supported', 3);
    }
    const declaration = classDeclarationOf(typeChecker.getTypeAtLocation(callee.expression));
    if (declaration === undefined) {
      return notYet('method calls are not yet supported', 3);
    }
    return declaration.members.some(
      (m) => ts.isMethodDeclaration(m) && m.name.getText() === callee.name.text,
    )
      ? { kind: 'accept' }
      : notYet('calling a class field is not yet supported', 3);
  }

  // The callee must be something whose *value* the emitter can produce and call. A name or a
  // function literal is; anything else (an index, a conditional, a call returning a call) needs
  // constructs that have not landed. The argument count is deliberately unchecked: JavaScript
  // drops extras and fills missing ones with `undefined`, and the calling convention does that
  // at runtime rather than making it a gate decision.
  if (ts.isIdentifier(callee)) {
    return callee.text === 'eval' && typeChecker.getSymbolAtLocation(callee) === undefined
      ? notYet('eval is not yet supported', 8)
      : { kind: 'accept' };
  }
  if (ts.isFunctionExpression(callee) || ts.isArrowFunction(callee)) {
    return { kind: 'accept' };
  }
  return notYet('calling an arbitrary expression is not yet supported', 3);
}

/** Rung 4a: functions with no captured environment. Each rejection below is a feature whose
 * binding form the HIR has no node for, not a judgement about the function itself. */
function gateFunction(
  fn: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
): GateResult {
  // A generator's asterisk is checked here as well as at YieldExpression, because a generator
  // with no `yield` in it is still a generator and still returns an iterator.
  if (!ts.isArrowFunction(fn) && fn.asteriskToken !== undefined) {
    return asyncNotYet();
  }
  if (fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) === true) {
    return asyncNotYet();
  }
  if (fn.typeParameters !== undefined && fn.typeParameters.length > 0) {
    return notYet('generic functions are not yet supported', 3);
  }
  if (fn.body === undefined) {
    return notYet('overload signatures are not yet supported', 3);
  }
  // An arrow's expression body (`(x) => x * 2`) is a Block in the HIR with a single return; the
  // lowering synthesises it, so nothing is gated here beyond what the expression itself gates.
  if (ts.isFunctionExpression(fn) && fn.name !== undefined) {
    return notYet('named function expressions are not yet supported', 3);
  }
  if (ts.isFunctionDeclaration(fn) && !isBodyTopLevel(fn.parent)) {
    return notYet('a function declaration inside a block, loop or branch is not yet supported', 3);
  }
  return { kind: 'accept' };
}

/** Shared with the AwaitExpression/YieldExpression case: same feature, same code, same phase. */
function asyncNotYet(): GateResult {
  return {
    kind: 'not-yet',
    code: 'STA1201',
    message: 'async/await and generators are not yet supported; planned for Phase 4 (runtime v1)',
    phase: 4,
  };
}

/** A parameter the HIR can bind: one plain name, always present, never defaulted. Everything
 * else is a binding form (patterns, rest) or a control-flow one (defaults run code at call
 * time), and each arrives with the feature it belongs to. */
function gateParameter(param: ts.ParameterDeclaration): GateResult {
  if (param.dotDotDotToken !== undefined) {
    return notYet('rest parameters are not yet supported', 3);
  }
  if (param.initializer !== undefined) {
    return notYet('default parameter values are not yet supported', 3);
  }
  if (param.questionToken !== undefined) {
    return notYet('optional parameters are not yet supported', 3);
  }
  if (!ts.isIdentifier(param.name)) {
    return notYet('destructuring parameters are not yet supported', 3);
  }
  if (param.name.text === 'this') {
    return notYet('a `this` parameter is not yet supported', 5);
  }
  return { kind: 'accept' };
}

/* Rung 4b gave captures a representation -- a heap environment chained through enclosing scopes
 * (docs/VALUE.md §4.3) -- so a reference to an enclosing function's local is no longer refused.
 * `gateIdentifier` and its declaration-site test are gone with it: every identifier the checker
 * resolves is now expressible, and the accept set matches the HIR's vocabulary again. */

/** True where a statement list is a function body or the module itself -- the two places a
 * function declaration's hoisted binding has an owner the emitter can initialise. */
function isBodyTopLevel(parent: ts.Node): boolean {
  if (ts.isSourceFile(parent)) {
    return true;
  }
  return (
    ts.isBlock(parent) &&
    (ts.isFunctionDeclaration(parent.parent) ||
      ts.isFunctionExpression(parent.parent) ||
      ts.isArrowFunction(parent.parent))
  );
}

function skipParens(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

/** `.length` on something the checker says is a string.
 *
 * The type test is what keeps the gate honest: `arr.length` and `fn.length` are the same syntax
 * and neither has an HIR node, so accepting `.length` on syntax alone would let them through to
 * an internal error. Any string-ish type qualifies — a literal type like `'ab'` is a String too,
 * and `StringLike` also covers a union of string literals. */
function isStringLength(access: ts.PropertyAccessExpression, checker: ts.TypeChecker): boolean {
  if (access.name.text !== 'length') {
    return false;
  }
  const objectType = checker.getTypeAtLocation(access.expression);
  return (objectType.flags & ts.TypeFlags.StringLike) !== 0;
}

/** True for the `x` in `for (const x of a)`, which is the one declaration with no initializer that
 * is nonetheless definitely assigned. */
function isForOfBinding(decl: ts.VariableDeclaration): boolean {
  const list = decl.parent;
  return ts.isVariableDeclarationList(list) && ts.isForOfStatement(list.parent);
}

/** `.length` on something the checker says is an array. The same reasoning as isStringLength: the
 * syntax alone does not say which runtime function the read becomes. A TUPLE is excluded with
 * everything else, because `checker.isArrayType` is false for one and its `.length` is a literal
 * type this model does not carry. */
function isArrayLength(access: ts.PropertyAccessExpression, checker: ts.TypeChecker): boolean {
  return (
    access.name.text === 'length' &&
    checker.isArrayType(checker.getTypeAtLocation(access.expression))
  );
}

/** An array literal, minus the spellings whose elements are not simply "the elements".
 *
 * A hole (`[1, , 3]`) is a real hole in ECMA-262 — it is `undefined` on read but absent to
 * iteration — and the dense runtime array has no way to be absent. A spread needs the iterator
 * protocol. Both are rejected rather than approximated. */
function gateArrayLiteral(literal: ts.ArrayLiteralExpression): GateResult {
  for (const element of literal.elements) {
    if (ts.isOmittedExpression(element)) {
      return notYet('a hole in an array literal is not yet supported', 5);
    }
    if (ts.isSpreadElement(element)) {
      return notYet('spread in an array literal is not yet supported', 5);
    }
  }
  return { kind: 'accept' };
}

/** The class declaration a type came from, or `undefined` if the type is not a class instance
 * this subset models. This must stay in step with `classTypeToHType` in src/frontend/types.ts: the
 * gate's accept set is the HIR's vocabulary, so a shape accepted here that maps to Unknown there
 * would be a construct the lowering cannot lower. */
function classDeclarationOf(type: ts.Type): ts.ClassDeclaration | undefined {
  const declaration = type.getSymbol()?.valueDeclaration;
  return declaration !== undefined &&
    ts.isClassDeclaration(declaration) &&
    declaration.name !== undefined
    ? declaration
    : undefined;
}

/** `class C { … }`, minus every member kind whose semantics the fixed-slot layout cannot express.
 *
 * Each rejection below is a real property of the layout, not a scheduling accident:
 * a getter or setter turns a field READ into a call, which is exactly what `SUBSET.md` says routes
 * classes to the dynamic path; a static member belongs to the class object, which is a second
 * allocation this rung does not make; `extends` needs a layout that starts with the parent's; and
 * `#private` needs a name that cannot collide with an inherited one. */
function gateClass(declaration: ts.ClassDeclaration): GateResult {
  if (declaration.name === undefined) {
    return notYet('an anonymous class is not yet supported', 3);
  }
  if (declaration.heritageClauses !== undefined && declaration.heritageClauses.length > 0) {
    return notYet('class inheritance is not yet supported', 3);
  }
  if (declaration.typeParameters !== undefined) {
    return notYet('a generic class is not yet supported', 3);
  }

  let constructors = 0;
  for (const member of declaration.members) {
    if (ts.isGetAccessor(member) || ts.isSetAccessor(member)) {
      return notYet('a class with a getter or setter is not yet supported', 3);
    }
    if (ts.isIndexSignatureDeclaration(member)) {
      return notYet('an index signature on a class is not yet supported', 3);
    }
    if (ts.isSemicolonClassElement(member)) {
      continue; // a stray `;` between members declares nothing
    }
    if (
      ts.canHaveModifiers(member) &&
      ts.getModifiers(member)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) === true
    ) {
      return notYet('a static class member is not yet supported', 3);
    }
    if (member.name !== undefined && ts.isPrivateIdentifier(member.name)) {
      return notYet('a #private class member is not yet supported', 3);
    }
    if (member.name !== undefined && !ts.isIdentifier(member.name)) {
      return notYet('a computed class member name is not yet supported', 3);
    }
    if (ts.isConstructorDeclaration(member)) {
      constructors++;
      // An overload signature has no body and declares nothing to emit; two BODIES would be two
      // constructors for one layout, which the checker rejects anyway.
      if (member.body === undefined) {
        return notYet('a constructor overload signature is not yet supported', 3);
      }
      continue;
    }
    if (ts.isMethodDeclaration(member)) {
      if (member.body === undefined) {
        return notYet('a method overload signature is not yet supported', 3);
      }
      if (member.asteriskToken !== undefined) {
        return notYet('a generator method is not yet supported', 4);
      }
      if (member.questionToken !== undefined) {
        return notYet('an optional method is not yet supported', 3);
      }
      continue;
    }
    if (ts.isPropertyDeclaration(member)) {
      if (member.questionToken !== undefined) {
        // `x?: number` is `number | undefined` with a distinction the slot cannot keep: an absent
        // property and one holding `undefined` read the same, but `in` and inspect tell them apart.
        return notYet('an optional class field is not yet supported', 3);
      }
      continue;
    }
    return notYet('this class member is not yet supported', 3);
  }
  if (constructors > 1) {
    return notYet('more than one constructor is not yet supported', 3);
  }
  return { kind: 'accept' };
}

/** `new C(…)`, admitted only when `C` resolves to a class this subset models. `new (pick())()` and
 * `new Date()` are the same syntax reaching something the emitter cannot name. */
function gateNew(node: ts.NewExpression, checker: ts.TypeChecker): GateResult {
  if (node.typeArguments !== undefined) {
    return notYet('explicit type arguments on a constructor call are not yet supported', 3);
  }
  if (!ts.isIdentifier(node.expression)) {
    return notYet('new on anything but a named class is not yet supported', 3);
  }
  if (classDeclarationOf(checker.getTypeAtLocation(node)) === undefined) {
    return notYet('new on this type is not yet supported', 3);
  }
  return { kind: 'accept' };
}

/** `this`, admitted only inside a class member — which is the only place the lowering has a
 * receiver to bind it to. At the top level of a module `this` is `undefined`, and in an ordinary
 * function it depends on how the function was CALLED, which is exactly the dynamic behaviour the
 * subset does not model. */
function gateThis(node: ts.Node): GateResult {
  for (let n: ts.Node | undefined = node.parent; n !== undefined; n = n.parent) {
    if (ts.isConstructorDeclaration(n) || ts.isMethodDeclaration(n)) {
      return { kind: 'accept' };
    }
    // An arrow does NOT stop the walk: it has no `this` of its own and sees the enclosing one,
    // which is the whole reason arrows are used inside methods. A `function` expression does stop
    // it -- its `this` is the caller's, not the class's.
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) {
      break;
    }
  }
  return notYet('this outside a class member is not yet supported', 3);
}

/** `o.x` and `o.m` on a class instance. A name the class does not declare cannot reach here — the
 * checker rejects it first — so the only question is whether the class itself is one this subset
 * lays out. */
function gateMemberAccess(
  access: ts.PropertyAccessExpression,
  checker: ts.TypeChecker,
): GateResult {
  const declaration = classDeclarationOf(checker.getTypeAtLocation(access.expression));
  if (declaration === undefined) {
    return notYet('property access is not yet supported', 3);
  }
  // A method used as a VALUE (`const f = o.m`) would have to build a bound closure, which is a
  // per-instance allocation this rung does not make. As the callee of a call it is fine, and that
  // is the shape gateCall sees.
  const isMethod = declaration.members.some(
    (m) =>
      ts.isMethodDeclaration(m) &&
      m.name !== undefined &&
      ts.isIdentifier(m.name) &&
      m.name.text === access.name.text,
  );
  if (isMethod && !(ts.isCallExpression(access.parent) && access.parent.expression === access)) {
    return notYet('using a method as a value is not yet supported', 3);
  }
  return { kind: 'accept' };
}

/** `a[i]`, admitted only when `a` is an array. Indexing a string (`s[0]`) or an object is the same
 * syntax reaching a different runtime operation, and neither has an HIR node yet. */
function gateElementAccess(
  access: ts.ElementAccessExpression,
  checker: ts.TypeChecker,
): GateResult {
  if (!checker.isArrayType(checker.getTypeAtLocation(access.expression))) {
    return notYet('index access on a non-array is not yet supported', 5);
  }
  return { kind: 'accept' };
}

/** `for (const x of a)`, admitted only over an array.
 *
 * A string, a Map, a Set, or any user iterable is the same syntax driving the iterator protocol,
 * which needs the object model. The binding must be a plain `let`/`const` name: `for (x of a)`
 * assigns to an existing binding, and destructuring needs a pattern the subset cannot lower. */
function gateForOf(statement: ts.ForOfStatement, checker: ts.TypeChecker): GateResult {
  if (statement.awaitModifier !== undefined) {
    return asyncNotYet();
  }
  if (!checker.isArrayType(checker.getTypeAtLocation(statement.expression))) {
    return notYet('for-of over a non-array is not yet supported', 5);
  }
  const initializer = statement.initializer;
  if (!ts.isVariableDeclarationList(initializer)) {
    return notYet('for-of over an existing binding is not yet supported', 5);
  }
  const [declaration] = initializer.declarations;
  if (declaration === undefined || !ts.isIdentifier(declaration.name)) {
    return notYet('destructuring in a for-of binding is not yet supported', 6);
  }
  return { kind: 'accept' };
}

function isConsoleLog(access: ts.PropertyAccessExpression): boolean {
  return (
    ts.isIdentifier(access.expression) &&
    access.expression.text === 'console' &&
    access.name.text === 'log'
  );
}

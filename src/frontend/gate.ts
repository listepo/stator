import * as ts from 'typescript';
import type { Diagnostic } from '../support/diagnostics.ts';
import { diagnosticFromFile, diagnosticFromNode } from '../support/diagnostics.ts';
import { genericCallInstantiation } from './generics.ts';
import {
  accessorDeclaringClass,
  baseClassOf,
  classDeclarationOf,
  hasExplicitAny,
  isImplicitAny,
  isStaticMember,
  methodDeclaringClass,
  staticMemberOf,
  tsTypeToHType,
} from './types.ts';

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
  //
  // THREE tokens are exempt, because they are not punctuation -- they are expressions that read
  // something, and the something differs by where they are written. `this`, `super` and an
  // identifier each have a case below, and each would be silently dead code without this list:
  // that is exactly what happened to `this` and `super`, whose cases never ran until the exemption
  // was widened past `Identifier`.
  if (
    kind <= ts.SyntaxKind.LastToken &&
    kind !== ts.SyntaxKind.Identifier &&
    kind !== ts.SyntaxKind.ThisKeyword &&
    kind !== ts.SyntaxKind.SuperKeyword
  ) {
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

    // `throw e;` and `try/catch/finally` are reserved for Task 3.10. The HIR carries their shape
    // while the unwinding emitter is being built, but accepting them here would let a valid source
    // file reach an emitter that cannot yet route landing pads (and would surface a compiler stack
    // trace instead of a user-facing not-yet diagnostic).
    case ts.SyntaxKind.ThrowStatement:
    case ts.SyntaxKind.TryStatement:
      return notYet('try/catch/finally and throw are not yet supported', 3);

    // `catch (e)` / `catch {`. The binding must be a plain name -- `catch ({ message })`
    // destructures, and the HIR has one name per binding, the same rule gateDeclaration applies.
    // The binding's TYPE needs no rule here: unannotated it is `unknown` (strict mode's
    // useUnknownInCatchVariables), `: unknown` is the same thing written out, and `: any` is
    // caught by the mode-wide STA1001 walk like any other explicit any.
    case ts.SyntaxKind.CatchClause: {
      const clause = node as ts.CatchClause;
      const binding = clause.variableDeclaration;
      return binding === undefined || ts.isIdentifier(binding.name)
        ? notYet('try/catch/finally and throw are not yet supported', 3)
        : notYet('destructuring a caught value is not yet supported', 3);
    }

    // The three function spellings share one HIR node (`FunctionExpr`), so they share one gate.
    case ts.SyntaxKind.FunctionDeclaration:
    case ts.SyntaxKind.FunctionExpression:
    case ts.SyntaxKind.ArrowFunction:
      return gateFunction(
        node as ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
      );

    case ts.SyntaxKind.Parameter:
      return gateParameter(node as ts.ParameterDeclaration);

    // `<T>` itself. It is not a type NODE -- it DECLARES one -- so it reaches this switch rather
    // than the annotation skip above. A constraint or a default is refused: `<T extends Shape>`
    // bounds what a specialization may be built for, and `<T = string>` supplies a tuple element no
    // call site wrote, and neither is anything monomorphization can honour by substitution alone.
    case ts.SyntaxKind.TypeParameter:
      return gateTypeParameter(node as ts.TypeParameterDeclaration);

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

    case ts.SyntaxKind.TypeOfExpression:
      return { kind: 'accept' };

    case ts.SyntaxKind.AsExpression:
      return { kind: 'accept' };

    case ts.SyntaxKind.CallExpression:
      return gateCall(node as ts.CallExpression, typeChecker);

    // `super` never denotes a value: it is a marker on the two forms that mention it. `super(...)`
    // is the base constructor run against this constructor's own receiver, and `super.m()` is a
    // call on this same receiver that skips the override. Anywhere else -- passed, returned,
    // compared -- there is no object for it to be.
    case ts.SyntaxKind.SuperKeyword:
      if (ts.isCallExpression(node.parent) && node.parent.expression === node) {
        return { kind: 'accept' };
      }
      return ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node
        ? { kind: 'accept' }
        : notYet('super as a value is not yet supported', 3);

    // `extends A` / `implements I`. gateClass vetted the whole clause -- that there is one base,
    // that it is a class declaration, and that nothing is overridden -- and these two nodes are
    // what the walker then descends through on its way to the base's NAME.
    case ts.SyntaxKind.HeritageClause:
    case ts.SyntaxKind.ExpressionWithTypeArguments:
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
      return gateClass(node as ts.ClassDeclaration, typeChecker);

    case ts.SyntaxKind.ObjectLiteralExpression:
      return gateObjectLiteral(node as ts.ObjectLiteralExpression, typeChecker);

    // A `name: value` pair of an accepted literal. gateObjectLiteral vetted the whole literal --
    // these are its children, reached on the way down, and the values are gated normally.
    case ts.SyntaxKind.PropertyAssignment:
    // A member of a TYPE literal (`let p: { x: number }`). The enclosing TypeLiteral is a type
    // node and skipped as one, but its members are not type nodes themselves, so the walk reaches
    // them; they carry no runtime construct, exactly as the annotation around them does not.
    case ts.SyntaxKind.PropertySignature:
      return { kind: 'accept' };

    // The members of an accepted class. gateClass already vetted the class as a whole -- these are
    // its children, reached on the way down, and their own children are gated normally.
    case ts.SyntaxKind.PropertyDeclaration:
    case ts.SyntaxKind.MethodDeclaration:
    case ts.SyntaxKind.GetAccessor:
    case ts.SyntaxKind.SetAccessor:
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
    case ts.SyntaxKind.ArrayLiteralExpression:
      return 'array literals';
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
  // A class NAME is not a value here. Five spellings are not uses of the value and must pass: the
  // declaration's own name, the callee of `new`, the right operand of `instanceof`, the base of an
  // `extends` clause (each consumes the whole construct, and the emitter names the descriptor), and
  // a type annotation -- `x: Point` mentions the class as a TYPE, which erases. What is left is a class being passed, stored or
  // compared, which needs the class object rung 6b allocates.
  if (
    decl !== undefined &&
    ts.isClassDeclaration(decl) &&
    ts.getNameOfDeclaration(decl) !== node &&
    !ts.isTypeNode(node.parent) &&
    !namesAClassInPlace(node, typeChecker)
  ) {
    return notYet('using a class as a value is not yet supported', 3);
  }
  // A generic function has no value: monomorphization replaces it with one specialization per
  // tuple, and `const f = box` names none of them. The declaration's own name is exempt, and so is
  // a callee, which is the one position where a tuple exists to pick a specialization by.
  if (
    decl !== undefined &&
    ts.isFunctionDeclaration(decl) &&
    decl.typeParameters !== undefined &&
    decl.typeParameters.length > 0 &&
    ts.getNameOfDeclaration(decl) !== node &&
    !(ts.isCallExpression(node.parent) && node.parent.expression === node)
  ) {
    return notYet('using a generic function as a value is not yet supported', 3);
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

/** `x as T` and `typeof x`.
 *
 * Both are accepted unconditionally, and the interesting one is `as`. A cast is the program
 * overruling the checker, so it is exactly where golden rule 4 applies — but "refuse what cannot be
 * checked" would be the wrong reading of that rule here. Where the asserted type is one a tag
 * settles, the lowering inserts a `jsrt_check_*` and the claim becomes true. Where it is not, the
 * lowering keeps the value `unknown`: the cast is DROPPED rather than believed, and every operation
 * downstream stays on the dynamic path it would have taken without the cast. Nothing trusts an
 * unproven type either way, which is what the rule actually asks for.
 *
 * Refusing instead would also be a regression: `m.get(k) ?? d` and every other narrowing the
 * compiler already handles dynamically would stop compiling in exchange for no soundness at all.
 *
 * `<T>x`, the older angle-bracket spelling, is a different node and is not accepted here: it is
 * ambiguous with JSX, banned in `.tsx`, and adds a second syntax for a construct that has one. */

/** The two expressions that name a class without reading it as a value: `new C(...)` and
 * `x instanceof C`. Each is one HIR node carrying the class NAME, so the emitter reaches the
 * `JSRTClass` descriptor directly and no class object has to exist. */
function namesAClassInPlace(node: ts.Identifier, checker: ts.TypeChecker): boolean {
  const parent = node.parent;
  if (ts.isNewExpression(parent)) {
    return parent.expression === node;
  }
  // `class B extends A` -- the base of a heritage clause, which names a layout rather than reading
  // a value. It is not a type NODE, so the type-position exemption does not cover it.
  if (ts.isExpressionWithTypeArguments(parent)) {
    return parent.expression === node;
  }
  // `C.count` -- the class NAME on the left of a static member access. It is not a value being
  // read: a static is one binding for the whole program, and the class name is half of its name.
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
    return staticMemberOf(parent, checker, undefined) !== undefined;
  }
  return (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
    parent.right === node
  );
}

/** Whether this identifier is a scope reference — a program actually READING the binding — as
 * opposed to a spelling that merely mentions the name. Three mentions reach the walker and none of
 * them is a use of the global they resolve to:
 *
 *   - a type position: `x: String` erases, and there is nothing to lower;
 *   - the NAME half of a property access: `s.length` and `p.x` are answered by the object's shape,
 *     never by scope, so the fact that `length` resolves to a lib declaration is an accident;
 *   - `console` in `console.log(x)`: the whole call is one HIR node that `gateCall` already vetted,
 *     and the walker descends into its children anyway;
 *   - the callee of `new`: `new Map()` is one HIR node naming a constructor, never a read of the
 *     binding. `gateNew` decides which constructors exist, and refuses the rest by itself — so
 *     answering "global" here would only add a second diagnostic to the same span.
 */
function isGlobalReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isTypeNode(parent)) {
    return false;
  }
  if (ts.isNewExpression(parent) && parent.expression === node) {
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
  // A catch binding is a VariableDeclaration too, and the loop's reasoning applies to it as well:
  // the CATCH assigns it, definitely, before its block runs.
  if (decl.initializer === undefined && !isForOfBinding(decl) && !ts.isCatchClause(decl.parent)) {
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

    // `x instanceof C`, and only where `C` is a class this compiler modelled. The right operand is
    // a class NAME, not a value: the emitter compares against a specific `JSRTClass` descriptor,
    // and `x instanceof (cond ? A : B)` has no descriptor to name. The left operand is anything at
    // all -- `1 instanceof C` is `false`, not an error.
    case ts.SyntaxKind.InstanceOfKeyword:
      return ts.isIdentifier(bin.right) &&
        classDeclarationOf(typeChecker.getTypeAtLocation(bin.right)) !== undefined
        ? { kind: 'accept' }
        : notYet('instanceof against anything but a class name is not yet supported', 3);

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
  // Asked first, because it is what decides whether the type arguments below are a feature or a
  // refusal: `box<string>('a')` and `box('a')` name the same specialization, and the difference
  // between them is a spelling the checker has already erased by the time it answers.
  const generic = genericCallInstantiation(call, typeChecker);
  if (generic.kind === 'unresolved') {
    return notYet(
      'a generic call whose type arguments no argument determines is not yet supported',
      3,
    );
  }
  if (generic.kind === 'not-generic' && call.typeArguments !== undefined) {
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
    // A Map or a Set: one runtime function per operation, and no user declaration anywhere, so
    // this is decided before anything that looks for a class.
    const collection = gateCollectionCall(call, callee, typeChecker);
    if (collection !== undefined) {
      return collection;
    }
    // `C.m(…)` -- a static method, which is an ordinary function with no receiver. It is decided
    // before the instance case because the receiver's type answers the same for both.
    if (staticMemberOf(callee, typeChecker, true) !== undefined) {
      return { kind: 'accept' };
    }
    const declaration = classDeclarationOf(typeChecker.getTypeAtLocation(callee.expression));
    if (declaration === undefined) {
      return notYet('method calls are not yet supported', 3);
    }
    return methodDeclaringClass(declaration, callee.name.text, typeChecker) !== undefined
      ? { kind: 'accept' }
      : notYet('calling a class field is not yet supported', 3);
  }

  // `super(...)`, which the gate reaches only after gateClass proved it is the first statement of a
  // derived constructor: it is the base constructor run against the receiver this one was handed.
  if (callee.kind === ts.SyntaxKind.SuperKeyword) {
    return { kind: 'accept' };
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
  // A generic is compiled by MONOMORPHIZATION: one specialization per concrete type tuple a call
  // asks for (Task 3.4). That needs a declaration to specialize -- a named, hoisted one the lowering
  // can lower again with a substitution in scope. A generic arrow or function expression is a value
  // built where it stands, and there is no second place to build it differently.
  if (
    fn.typeParameters !== undefined &&
    fn.typeParameters.length > 0 &&
    !ts.isFunctionDeclaration(fn)
  ) {
    return notYet('a generic function expression or arrow is not yet supported', 3);
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
function gateTypeParameter(parameter: ts.TypeParameterDeclaration): GateResult {
  if (parameter.constraint !== undefined) {
    return notYet('a constrained type parameter is not yet supported', 3);
  }
  if (parameter.default !== undefined) {
    return notYet('a type parameter with a default is not yet supported', 3);
  }
  return { kind: 'accept' };
}

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

/** `{ x: 1, y: f() }`, admitted only where the shape is a layout.
 *
 * The key set must be known and spellable: a computed key is not a name until there is a shape
 * table to look one up in, a spread copies a shape this one does not know, and a method or an
 * accessor in a literal has no class to hang a member function on. A key that is not an
 * identifier is refused for a printing reason as much as a layout one -- `util.inspect` quotes
 * `{ 'a-b': 1 }`, and a field name in the descriptor is an identifier by construction everywhere
 * else in the runtime.
 *
 * The TYPE has to be a shape too, and that is the load-bearing check: `tsTypeToHType` refuses an
 * optional property, an index signature and anything with a call signature, so accepting a literal
 * whose type it refuses would hand the lowering a literal with no layout to build. */
function gateObjectLiteral(
  literal: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
): GateResult {
  for (const property of literal.properties) {
    if (!ts.isPropertyAssignment(property)) {
      return notYet(
        'an object literal with a shorthand, spread, method or accessor member is not yet supported',
        3,
      );
    }
    if (!ts.isIdentifier(property.name)) {
      return notYet('an object literal key that is not an identifier is not yet supported', 3);
    }
  }
  return tsTypeToHType(checker.getTypeAtLocation(literal), checker).kind === 'object'
    ? { kind: 'accept' }
    : // Not a scheduling accident like the two above: an optional property or an index signature
      // has no fixed slot list at all, so it waits on the shape table Task 4.1 builds.
      notYet('an object literal whose shape is not a layout is not yet supported', 4);
}

/** `class C { … }`, minus every member kind whose semantics the fixed-slot layout cannot express.
 *
 * Each rejection below is a real property of the layout, not a scheduling accident: a static
 * initialization block and a static accessor need the class OBJECT, which a plain binding is not;
 * a re-declared FIELD would be two declarations of one slot; a `#private` name an ancestor also
 * declares would be two fields sharing one; and a computed member name is not a name at all until
 * there is a shape to look it up in. */
function gateClass(declaration: ts.ClassDeclaration, checker: ts.TypeChecker): GateResult {
  if (declaration.name === undefined) {
    return notYet('an anonymous class is not yet supported', 3);
  }
  if (declaration.typeParameters !== undefined) {
    return notYet('a generic class is not yet supported', 3);
  }
  const heritage = gateHeritage(declaration, checker);
  if (heritage.kind !== 'accept') {
    return heritage;
  }
  const inheritedInstance = ancestorMembers(declaration, checker, false);
  const inheritedStatic = ancestorMembers(declaration, checker, true);
  const inheritedPrivates = ancestorPrivates(declaration, checker);

  let constructors = 0;
  for (const member of declaration.members) {
    // An accessor is a pair of METHODS under a name no source can spell, so it needs nothing the
    // layout does not already have -- which is why the limits below are about the class object and
    // the name, not about accessors as such.
    if (ts.isGetAccessor(member) || ts.isSetAccessor(member)) {
      if (isStaticMember(member)) {
        return notYet('a static getter or setter is not yet supported', 3);
      }
      if (member.body === undefined) {
        return notYet('an accessor with no body is not yet supported', 3);
      }
      if (!ts.isIdentifier(member.name)) {
        return notYet('a computed or #private accessor name is not yet supported', 3);
      }
      // An accessor re-declaring an inherited name is overriding, and an accessor is dispatched
      // directly -- the method table is indexed only where the lowering proved a method is
      // declared twice, which it asks of method DECLARATIONS.
      if (inheritedInstance.has(member.name.text)) {
        return notYet(
          `overriding the inherited member '${member.name.text}' is not yet supported`,
          3,
        );
      }
      continue;
    }
    if (ts.isIndexSignatureDeclaration(member)) {
      return notYet('an index signature on a class is not yet supported', 3);
    }
    if (ts.isSemicolonClassElement(member)) {
      continue; // a stray `;` between members declares nothing
    }
    // A static initialization block runs arbitrary statements against the class object, in a scope
    // where `this` is the class. There is no class object here -- a static is one plain binding --
    // so there is nothing for the block's `this` to be.
    if (ts.isClassStaticBlockDeclaration(member)) {
      return notYet('a static initialization block is not yet supported', 3);
    }
    if (
      member.name !== undefined &&
      !ts.isIdentifier(member.name) &&
      !ts.isPrivateIdentifier(member.name)
    ) {
      return notYet('a computed class member name is not yet supported', 3);
    }
    // Two `#x` in one chain are TWO fields in JavaScript -- a private name is scoped to the class
    // body that writes it, so a subclass's `#x` does not override its base's, and an instance
    // carries both. The slot list is keyed by NAME, so it would give them one slot and let each
    // write clobber the other. A name is a fact about a layout here, which is what makes this a
    // real limit rather than a scheduling one.
    if (
      member.name !== undefined &&
      ts.isPrivateIdentifier(member.name) &&
      inheritedPrivates.has(member.name.text)
    ) {
      return notYet(
        `a #private member named '${member.name.text}' that an ancestor also declares is not yet supported`,
        3,
      );
    }
    if (ts.isConstructorDeclaration(member)) {
      constructors++;
      // An overload signature has no body and declares nothing to emit; two BODIES would be two
      // constructors for one layout, which the checker rejects anyway.
      if (member.body === undefined) {
        return notYet('a constructor overload signature is not yet supported', 3);
      }
      // A derived constructor must open with `super(...)`. JavaScript already forbids touching
      // `this` before it, and requiring the CALL to be the first statement is what lets the
      // lowering place the inherited field initializers: they run after the base constructor and
      // before this body, which is only a fixed position if the call is in a fixed position.
      if (baseClassOf(declaration, checker) !== undefined && !opensWithSuperCall(member)) {
        return notYet(
          'a derived constructor that does not open with super(...) is not yet supported',
          3,
        );
      }
      continue;
    }
    // Re-declaring an inherited name. A METHOD over a method is overriding, which the method table
    // handles: same name, same slot, a different entry per class. Anything else is not.
    //
    // A FIELD over a field would be two declarations of one slot, and the initializers would race
    // for it in an order the layout does not express. A static over a static is refused for a
    // parallel reason: `D.count` and `C.count` must name ONE binding, and two declarations of the
    // name would need two.
    if (
      member.name !== undefined &&
      ts.isIdentifier(member.name) &&
      (isStaticMember(member) ? inheritedStatic : inheritedInstance).has(member.name.text)
    ) {
      const base = baseClassOf(declaration, checker);
      const overridesMethod =
        !isStaticMember(member) &&
        ts.isMethodDeclaration(member) &&
        base !== undefined &&
        methodDeclaringClass(base, member.name.text, checker) !== undefined;
      if (!overridesMethod) {
        return notYet(
          `overriding the inherited member '${member.name.text}' is not yet supported`,
          3,
        );
      }
      // A method table is one file-scope constant per class, so no method in an overriding family
      // may capture. A class at module scope has nothing to capture; a class inside a function may,
      // and there is no per-instantiation table to hold what it captured.
      if (!ts.isSourceFile(declaration.parent)) {
        return notYet(
          'overriding a method in a class declared inside a function is not yet supported',
          3,
        );
      }
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

/** The `extends`/`implements` clauses. `implements` is type-only and erases, so it contributes
 * nothing to a layout and is simply allowed. `extends` must name a class this compiler lays out:
 * extending an expression, a built-in, or an ambient declaration reaches a layout that was never
 * emitted. */
function gateHeritage(declaration: ts.ClassDeclaration, checker: ts.TypeChecker): GateResult {
  for (const clause of declaration.heritageClauses ?? []) {
    if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
      continue;
    }
    if (clause.types.length !== 1) {
      return notYet('extending other than exactly one class is not yet supported', 3);
    }
    if (baseClassOf(declaration, checker) === undefined) {
      return notYet('extending anything but a class declaration is not yet supported', 3);
    }
  }
  return { kind: 'accept' };
}

/** Every member name declared by any ANCESTOR -- fields and methods alike, because the two collide
 * with each other: a subclass field shadowing an inherited field would need two slots for one name,
 * and a subclass method shadowing an inherited field would need a slot and no slot at once. */
function ancestorMembers(
  declaration: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  wantStatic: boolean,
): Set<string> {
  const names = new Set<string>();
  const seen = new Set<ts.ClassDeclaration>([declaration]);
  for (
    let base = baseClassOf(declaration, checker);
    base !== undefined && !seen.has(base);
    base = baseClassOf(base, checker)
  ) {
    seen.add(base);
    for (const member of base.members) {
      // Statics and instance members are separate namespaces: `C.count` and `c.count` can coexist
      // and name different things, so a shadowing check that merged them would refuse legal code.
      if (
        member.name !== undefined &&
        ts.isIdentifier(member.name) &&
        isStaticMember(member) === wantStatic
      ) {
        names.add(member.name.text);
      }
    }
  }
  return names;
}

/** Every `#private` name declared ANYWHERE in `declaration`'s ancestry.
 *
 * Separate from `ancestorMembers` because private names do not shadow: `#x` in a subclass and `#x`
 * in its base are two distinct fields, both present on one instance. That is precisely why a repeat
 * is refused rather than merged -- the slot list is keyed by name and has room for one. */
function ancestorPrivates(declaration: ts.ClassDeclaration, checker: ts.TypeChecker): Set<string> {
  const names = new Set<string>();
  const seen = new Set<ts.ClassDeclaration>([declaration]);
  for (
    let base = baseClassOf(declaration, checker);
    base !== undefined && !seen.has(base);
    base = baseClassOf(base, checker)
  ) {
    seen.add(base);
    for (const member of base.members) {
      if (member.name !== undefined && ts.isPrivateIdentifier(member.name)) {
        names.add(member.name.text);
      }
    }
  }
  return names;
}

/** Whether a constructor's first statement is `super(...)`. Not "contains a super call": a call
 * inside an `if` runs conditionally, and the base's fields would then be initialized on some paths
 * only. */
function opensWithSuperCall(ctor: ts.ConstructorDeclaration): boolean {
  const first = ctor.body?.statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isCallExpression(first.expression) &&
    first.expression.expression.kind === ts.SyntaxKind.SuperKeyword
  );
}

/** `new C(…)`, admitted only when `C` resolves to a class this subset models. `new (pick())()` and
 * `new Date()` are the same syntax reaching something the emitter cannot name. */
/** The Map and Set surface the subset compiles, with the argument count each operation takes.
 *
 * A closed list, not a lookup on the lib declarations: everything here is one runtime function, and
 * an operation that is NOT here (`forEach`, `keys`, `entries`, `union`) is either an iterator or a
 * callback over one, which is the Symbol.iterator protocol the subset has no node for. Reading the
 * list off the lib would turn each of those into an internal error instead of a `not-yet`. */
const COLLECTION_OPS: Readonly<Record<'map' | 'set', Readonly<Record<string, number>>>> = {
  map: { get: 1, set: 2, has: 1, delete: 1, clear: 0 },
  set: { add: 1, has: 1, delete: 1, clear: 0 },
};

/** `'map'`, `'set'`, or undefined for anything that is not one — the receiver test every rule
 * below shares. It asks the TYPE, so a `Map` the checker resolved through an alias or a type
 * parameter answers the same as one written out. */
function collectionOf(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): 'map' | 'set' | undefined {
  const type = tsTypeToHType(checker.getTypeAtLocation(expression), checker);
  return type.kind === 'map' || type.kind === 'set' ? type.kind : undefined;
}

/** The name as the source spells it, for a message a reader can match to their own code. */
function collectionName(collection: 'map' | 'set'): string {
  return collection === 'map' ? 'Map' : 'Set';
}

/** `m.get(k)`, `s.add(v)` and the rest: a call on a Map or a Set, or undefined if this is not one.
 *
 * The argument count IS checked here, unlike an ordinary call, and for a reason that does not apply
 * there: a user function tolerates extra and missing arguments because JavaScript does, but these
 * lower to a runtime function with a fixed C signature. `m.set(k)` with the value missing has no
 * `undefined` to pass — there is no argv to pad. */
function gateCollectionCall(
  call: ts.CallExpression,
  callee: ts.PropertyAccessExpression,
  checker: ts.TypeChecker,
): GateResult | undefined {
  const collection = collectionOf(callee.expression, checker);
  if (collection === undefined) {
    return undefined;
  }
  const arity = COLLECTION_OPS[collection][callee.name.text];
  if (arity === undefined) {
    return notYet(`${callee.name.text} on a ${collectionName(collection)} is not yet supported`, 4);
  }
  return call.arguments.length === arity
    ? { kind: 'accept' }
    : notYet(
        `${collectionName(collection)}.${callee.name.text} with ${String(call.arguments.length)} arguments is not yet supported`,
        4,
      );
}

function gateNew(node: ts.NewExpression, checker: ts.TypeChecker): GateResult {
  // Checked before the type-argument rejection below, because `new Map<string, number>()` is how a
  // typed Map is spelled: the arguments fill K and V, which the checker resolves and the HType
  // carries, rather than asking for the generic instantiation the rejection is about.
  const collection = collectionOf(node, checker);
  if (collection !== undefined) {
    // An argument is an ITERABLE of entries -- `new Map([['a', 1]])` -- and iterating one is the
    // Symbol.iterator protocol, not a constructor detail.
    return node.arguments === undefined || node.arguments.length === 0
      ? { kind: 'accept' }
      : notYet(
          `constructing a ${collectionName(collection)} from an iterable is not yet supported`,
          4,
        );
  }
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
    // A field INITIALIZER is a `this` position too, though it is lexically inside no function:
    // the lowering moves it into the constructor, where the receiver is a parameter. A STATIC
    // member's `this` is the class object instead, and there is no class object here -- a static is
    // a plain binding -- so there is nothing for it to read.
    if (
      ts.isConstructorDeclaration(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isGetAccessorDeclaration(n) ||
      ts.isSetAccessorDeclaration(n) ||
      ts.isPropertyDeclaration(n)
    ) {
      return isStaticMember(n)
        ? notYet('this in a static class member is not yet supported', 3)
        : { kind: 'accept' };
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
  // `super.m` is only ever a callee: it names the base's function, and reading it as a value would
  // need a bound method object, which nothing here builds. `super.x` on a FIELD is refused for a
  // sharper reason -- a field has one slot per name, so `super.x` and `this.x` are the same slot
  // and the spelling would promise a distinction the layout cannot make.
  if (access.expression.kind === ts.SyntaxKind.SuperKeyword) {
    if (!(ts.isCallExpression(access.parent) && access.parent.expression === access)) {
      return notYet('super as a value is not yet supported', 3);
    }
    const base = classDeclarationOf(checker.getTypeAtLocation(access.expression));
    return base !== undefined &&
      ts.isIdentifier(access.name) &&
      methodDeclaringClass(base, access.name.text, checker) !== undefined
      ? { kind: 'accept' }
      : notYet('super on anything but an inherited method is not yet supported', 3);
  }
  // `C.count` -- the receiver is a class NAME, so this reads a static, not an instance field.
  // `classDeclarationOf` cannot tell the two apart: the type of the expression `C` is the class's
  // STATIC side, whose symbol is still the class declaration, so a value read and a static read
  // would both answer with the same declaration. Asking whether the receiver resolves to a class
  // declaration is what separates them.
  const asStatic = staticMemberOf(access, checker, undefined);
  if (asStatic !== undefined) {
    return ts.isMethodDeclaration(asStatic.member) &&
      !(ts.isCallExpression(access.parent) && access.parent.expression === access)
      ? notYet('using a method as a value is not yet supported', 3)
      : { kind: 'accept' };
  }
  // `m.size`, and the method names that are only ever callees. `size` is a READ of a count the
  // structure keeps, so it is accepted as a value; a method is not, for the reason a class method is
  // not -- `const f = m.get` needs a bound closure nothing here builds.
  const collection = collectionOf(access.expression, checker);
  if (collection !== undefined) {
    if (access.name.text === 'size') {
      return { kind: 'accept' };
    }
    return ts.isCallExpression(access.parent) && access.parent.expression === access
      ? { kind: 'accept' } // gateCall decides it; reaching here means it already did
      : notYet(
          `${collectionName(collection)}.${access.name.text} as a value is not yet supported`,
          4,
        );
  }
  const declaration = classDeclarationOf(checker.getTypeAtLocation(access.expression));
  if (declaration === undefined) {
    // `p.x` on an object literal's shape. A shape has fields and nothing else -- no methods, no
    // accessors, no statics -- so the whole rule is that the name is one of them.
    const shape = tsTypeToHType(checker.getTypeAtLocation(access.expression), checker);
    if (shape.kind === 'object') {
      return shape.fields.some((f) => f.name === access.name.text)
        ? { kind: 'accept' }
        : notYet('a property that is not a field of the shape is not yet supported', 3);
    }
    return notYet('property access is not yet supported', 3);
  }
  // A class name reaching here with no static of that name is a member the subset cannot resolve
  // -- `C.prototype`, `C.name` and the rest of the class object, which does not exist here.
  if (
    ts.isIdentifier(access.expression) &&
    checker.getSymbolAtLocation(access.expression)?.valueDeclaration === declaration
  ) {
    return notYet('using a class as a value is not yet supported', 3);
  }
  // `o.x` on an accessor is a CALL, so a read is fine and a read-modify-write is not: `o.x += 1`
  // is a get and a set of one property, and the machinery that evaluates a receiver exactly once
  // across the pair hoists a SLOT, which an accessor is not.
  if (accessorDeclaringClass(declaration, access.name.text, checker) !== undefined) {
    return isReadModifyWrite(access)
      ? notYet('a compound assignment to an accessor is not yet supported', 3)
      : { kind: 'accept' };
  }
  // A method used as a VALUE (`const f = o.m`) would have to build a bound closure, which is a
  // per-instance allocation this rung does not make. As the callee of a call it is fine, and that
  // is the shape gateCall sees. The search runs up the chain: an inherited method is a method.
  const isMethod = methodDeclaringClass(declaration, access.name.text, checker) !== undefined;
  if (isMethod && !(ts.isCallExpression(access.parent) && access.parent.expression === access)) {
    return notYet('using a method as a value is not yet supported', 3);
  }
  return { kind: 'accept' };
}

/** Is this place both read and written by one expression -- `p += e`, `p++`, `--p`? */
function isReadModifyWrite(place: ts.Expression): boolean {
  const parent = place.parent;
  if (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) {
    return (
      parent.operator === ts.SyntaxKind.PlusPlusToken ||
      parent.operator === ts.SyntaxKind.MinusMinusToken
    );
  }
  return (
    ts.isBinaryExpression(parent) &&
    parent.left === place &&
    parent.operatorToken.kind !== ts.SyntaxKind.EqualsToken &&
    parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  );
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

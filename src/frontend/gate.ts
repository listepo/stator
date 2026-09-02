import * as ts from 'typescript';
import type { ConsoleMethod, DateOperation, DateStatic, RegExpOperation } from '../hir/nodes.ts';
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
import type { Diagnostic } from '../support/diagnostics.ts';
import { diagnosticFromFile, diagnosticFromNode } from '../support/diagnostics.ts';
import { intlEnabled } from '../support/features.ts';
import { genericCallInstantiation } from './generics.ts';
import {
  accessorDeclaringClass,
  baseClassOf,
  classDeclarationOf,
  hasExplicitAny,
  isDynamicShape,
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
  /** Outside the current subset but scheduled -- STA12xx, and the phase is part of the message.
   *
   * `phase` is OPTIONAL because some blockers are not phases: a build flag is not a release to
   * wait for, it is a flag to turn on (src/support/phases.ts). Omit it there rather than writing a
   * number the user cannot act on. */
  | { kind: 'not-yet'; code: string; message: string; phase?: number };

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

    // Task 3.10: `throw e;` and `try/catch/finally` lower to landing pads in the emitter.
    case ts.SyntaxKind.ThrowStatement:
    case ts.SyntaxKind.TryStatement:
      return { kind: 'accept' };

    // Task 3.11: modules, whole-program v0. The merged program has ONE namespace and an import
    // binds nothing -- the importer's identifier resolves to the exporting file's own top-level
    // binding BY NAME (src/frontend/graph.ts). Everything accepted here must preserve that
    // resolution, which is why every renaming shape (`x as y`) is refused: it would make a name
    // resolve to a binding that does not carry it.
    case ts.SyntaxKind.ImportDeclaration:
      return gateImport(node as ts.ImportDeclaration);
    case ts.SyntaxKind.ImportClause:
    case ts.SyntaxKind.NamedImports:
    case ts.SyntaxKind.NamedExports:
      return { kind: 'accept' };
    case ts.SyntaxKind.ImportSpecifier: {
      const spec = node as ts.ImportSpecifier;
      // A type-only alias is erased whole, so renaming one changes nothing at runtime.
      return spec.propertyName === undefined || importIsTypeOnly(spec)
        ? { kind: 'accept' }
        : notYet("renaming an import ('x as y') is not yet supported", 5);
    }
    // `export { x }` (no specifier). The re-export form carries a specifier and is an ALIAS: the
    // local file never binds the name, so name-resolution through the merge cannot find it.
    case ts.SyntaxKind.ExportDeclaration: {
      const decl = node as ts.ExportDeclaration;
      return decl.moduleSpecifier === undefined
        ? { kind: 'accept' }
        : notYet("re-exports (export { x } from '...') are not yet supported", 5);
    }
    case ts.SyntaxKind.ExportSpecifier: {
      const spec = node as ts.ExportSpecifier;
      const parent = spec.parent.parent;
      const typeOnly = spec.isTypeOnly || (ts.isExportDeclaration(parent) && parent.isTypeOnly);
      return spec.propertyName === undefined || typeOnly
        ? { kind: 'accept' }
        : notYet("renaming an export ('x as y') is not yet supported", 5);
    }
    // `export default <literal>`. Nothing can import a default in v0 (default imports are
    // refused below), so the only thing at stake is the expression's side effects -- which a
    // literal has none of, letting the lowering skip the statement entirely.
    case ts.SyntaxKind.ExportAssignment: {
      const assignment = node as ts.ExportAssignment;
      if (assignment.isExportEquals) {
        return notYet('export = is not yet supported', 5);
      }
      return isLiteralValue(assignment.expression)
        ? { kind: 'accept' }
        : notYet('a default export with a computed value is not yet supported', 5);
    }

    // `catch (e)` / `catch {`. The binding must be a plain name -- `catch ({ message })`
    // destructures, and the HIR has one name per binding, the same rule gateDeclaration applies.
    // The binding's TYPE needs no rule here: unannotated it is `unknown` (strict mode's
    // useUnknownInCatchVariables), `: unknown` is the same thing written out, and `: any` is
    // caught by the mode-wide STA1001 walk like any other explicit any.
    case ts.SyntaxKind.CatchClause: {
      const clause = node as ts.CatchClause;
      const binding = clause.variableDeclaration;
      return binding === undefined || ts.isIdentifier(binding.name)
        ? { kind: 'accept' }
        : notYet('destructuring a caught value is not yet supported', 5);
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
        : notYet('a label on anything but a loop or switch is not yet supported', 5);
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
      return gateIdentifier(node as ts.Identifier, typeChecker, mode);

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
      return gateCall(node as ts.CallExpression, typeChecker, mode);

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
        : notYet('super as a value is not yet supported', 5);

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
      // `globalThis.eval` / `globalThis.Function` as VALUES — the call/`new` forms are decided
      // on those nodes, but aliasing (`const e = globalThis.eval`) is the same construct and
      // must not fall through to "property access is not yet supported".
      const dynamic = dynamicCodeGeneration(access, typeChecker);
      if (dynamic === 'eval') {
        return evalResult(mode);
      }
      if (dynamic === 'function') {
        return functionCtorResult(mode);
      }
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

    // `/ab+c/gi` -- pattern and flags travel to the runtime as TEXT, so nothing here parses them
    // and nothing here can disagree with the vendored engine about what they mean. An invalid
    // pattern is settled where it is compiled: at run time, loudly (STA2005 pattern).
    case ts.SyntaxKind.RegularExpressionLiteral:
      return { kind: 'accept' };

    case ts.SyntaxKind.NewExpression:
      return gateNew(node as ts.NewExpression, typeChecker, mode);

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
      return gateAwait(node);
    case ts.SyntaxKind.YieldExpression:
      return generatorNotYet();

    default:
      return notYet(`${describeKind(kind)} is not yet supported`, 5);
  }
}

/** A named or side-effect-only import. `import './x'` contributes an edge to the module graph
 * and nothing else; `import type` is erased whole. What is refused binds a NAME the exporting
 * file does not own under that spelling: a default import (the export is anonymous) and a
 * namespace import (`ns.x` would need an object no module is). */
function gateImport(node: ts.ImportDeclaration): GateResult {
  const spec = node.moduleSpecifier;
  if (ts.isStringLiteral(spec) && node.importClause?.isTypeOnly !== true) {
    // Bare specifier: a package. Compiling one means compiling someone else's whole module graph.
    if (!spec.text.startsWith('./') && !spec.text.startsWith('../')) {
      return notYet('importing a package is not yet supported', 7);
    }
    // Node ESM never resolves an extensionless relative specifier, and Node is the ground truth
    // the golden tests hold this compiler to. The Bundler-style resolution the checker runs
    // WOULD resolve it, which is exactly why the gate has to say no here.
    if (!/\.[cm]?[tj]s$/.test(spec.text)) {
      return {
        kind: 'never',
        code: 'STA1113',
        message:
          "a relative import must name the file's extension (./x.ts, ./x.js) — " +
          'Node ESM does not resolve extensionless specifiers',
      };
    }
  }
  const clause = node.importClause;
  if (clause === undefined || clause.isTypeOnly) {
    return { kind: 'accept' };
  }
  if (clause.name !== undefined) {
    return notYet('default imports are not yet supported', 5);
  }
  if (clause.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings)) {
    return notYet('namespace imports (import * as ns) are not yet supported', 5);
  }
  return { kind: 'accept' };
}

function importIsTypeOnly(spec: ts.ImportSpecifier): boolean {
  return spec.isTypeOnly || spec.parent.parent.isTypeOnly;
}

function isLiteralValue(expr: ts.Expression): boolean {
  return (
    ts.isStringLiteral(expr) ||
    ts.isNumericLiteral(expr) ||
    expr.kind === ts.SyntaxKind.TrueKeyword ||
    expr.kind === ts.SyntaxKind.FalseKeyword ||
    expr.kind === ts.SyntaxKind.NullKeyword
  );
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

/** One not-yet for both dynamic-code-generation constructs — they land together in Phase 8. */
function jsDynamicCode(): GateResult {
  return {
    kind: 'not-yet',
    code: 'STA1206',
    message:
      'eval() and new Function() are not yet supported in js mode; planned for Phase 8 (dynamic tier)',
    phase: 8,
  };
}

/** `eval` in ts mode is a permanent never; in js mode it waits on Phase 8's interpreter tier. */
function evalResult(mode: Mode): GateResult {
  return mode === 'ts'
    ? {
        kind: 'never',
        code: 'STA1101',
        message:
          'eval() is not allowed in ts mode — it prevents static analysis and is a permanent design choice',
      }
    : jsDynamicCode();
}

/** `new Function` / `Function(...)` — same split, different ts-mode code. */
function functionCtorResult(mode: Mode): GateResult {
  return mode === 'ts'
    ? {
        kind: 'never',
        code: 'STA1103',
        message: 'new Function() is not allowed in ts mode — code generation is not supported',
      }
    : jsDynamicCode();
}

/** The two spellings of dynamic code generation: a bare/`globalThis` `eval`, or the `Function` ctor.
 *
 * `Function` is identified through the same declaration-file test `Date` uses, so a user
 * `class Function` stays on the ordinary class path. `eval` is the same test; it is also recognized
 * as `globalThis.eval`, which is the other form DIAGNOSTICS.md names. A user method named `eval`
 * is not this — only `globalThis` as the receiver. */
function dynamicCodeGeneration(
  expression: ts.Expression,
  checker: ts.TypeChecker,
): 'eval' | 'function' | undefined {
  if (isGlobalNamed(expression, checker, 'eval')) {
    return 'eval';
  }
  if (isGlobalNamed(expression, checker, 'Function')) {
    return 'function';
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'globalThis'
  ) {
    if (expression.name.text === 'eval') {
      return 'eval';
    }
    if (expression.name.text === 'Function') {
      return 'function';
    }
  }
  return undefined;
}

/** `Date`'s residue code, as `STA1211` is `RegExp`'s: a Date member outside the landed tables is
 * refused under its own number rather than the generic `STA1214`, so a program can tell "this
 * builtin is partly here" from "this construct is not".
 *
 * Slices A and B landed the whole surface Phase 4 owns, so the ten sites that reach here split two
 * ways and the helper takes the phase rather than hardcoding one (plan-notes 136). ARITY and
 * SPREAD refusals are ordinary lowering work and name Phase 5; the MEMBER catch-all is now exactly
 * the ICU-dependent family -- `toString`/`toTimeString`, whose output carries the zone's long
 * display name, and the three `toLocale*` -- whose blocker is the FEATURE BUILD and therefore no
 * phase at all (src/support/phases.ts), so it omits `phase` and names the flag. */
function dateNotYet(message: string, phase?: number): GateResult {
  return phase === undefined
    ? {
        kind: 'not-yet',
        code: 'STA1210',
        message:
          `${message} needs the ICU feature build: rebuild with ` +
          '`make -C runtime intl` and compile with STATOR_RUNTIME=intl',
      }
    : {
        kind: 'not-yet',
        code: 'STA1210',
        message: `${message} is not yet supported; planned for Phase ${String(phase)}`,
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
function gateIdentifier(node: ts.Identifier, typeChecker: ts.TypeChecker, mode: Mode): GateResult {
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
    return notYet('using a class as a value is not yet supported', 5);
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
    return notYet('using a generic function as a value is not yet supported', 5);
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
  // `NaN` and `Infinity` join `undefined` in the by-name exemption: the lowering answers each
  // with a number literal, and cDoubleLiteral already spells both in C.
  if (
    symbol !== undefined &&
    node.text !== 'undefined' &&
    node.text !== 'NaN' &&
    node.text !== 'Infinity' &&
    isGlobalReference(node)
  ) {
    // Declared in a declaration file (`lib.es5.d.ts`, `stator.globals.d.ts`) -- an ambient value
    // with no body to lower -- or declared nowhere at all, which is how the checker models
    // `globalThis`. `every` rather than `some`: a name that IS declared in user code is a
    // user binding, whatever else merges into it.
    const declarations = symbol.declarations ?? [];
    if (declarations.every((d) => d.getSourceFile().isDeclarationFile)) {
      // `eval` and `Function` as VALUES are the same constructs as the call/`new` forms — aliasing
      // them (`const e = eval`) is how a program hides a dynamic-code site from a callee check.
      if (node.text === 'eval') {
        return evalResult(mode);
      }
      if (node.text === 'Function') {
        return functionCtorResult(mode);
      }
      // A catch-all keeps the phase that owns MOST of what it refuses (plan §7 Task 4.7 step 5).
      // What is left of the global surface is `Symbol` and the iterator protocol around it, which
      // is Phase 5 step 8; `globalThis` and `Reflect` are Phase 8's, and `Proxy` is a `never` the
      // ts-mode table answers before this arm is reached, so neither moves the majority.
      return notYet(`the global '${node.text}' is not yet supported`, 5);
    }
  }
  if (decl === undefined || enclosingFunction(decl) === enclosingFunction(node)) {
    return { kind: 'accept' };
  }
  return loopScopeOf(decl) === undefined
    ? { kind: 'accept' }
    : notYet('capturing a variable declared inside a loop is not yet supported', 5);
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
    // `Math` on the LEFT of a member access is exempt the way `console` is in `console.log`:
    // gateMemberAccess and gateCall judge the member itself, with a sharper message than a
    // blanket "the global 'Math'" — and the declaration-file test in isGlobalMath keeps a user
    // binding named Math on the ordinary identifier path.
    return !(
      parent.name === node ||
      (parent.expression === node &&
        (isConsoleLog(parent) ||
          node.text === 'Date' ||
          node.text === 'Math' ||
          node.text === 'Object' ||
          node.text === 'Promise' ||
          node.text === 'JSON'))
    );
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
    return notYet('a declaration without an initializer is not yet supported', 5);
  }
  // Destructuring binds several names from one value; the HIR has one name per Declaration.
  if (!ts.isIdentifier(decl.name)) {
    return notYet('destructuring declarations are not yet supported', 5);
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
        : notYet('instanceof against anything but a class name is not yet supported', 5);

    case ts.SyntaxKind.EqualsToken:
      // A bare name is HIR Assignment, `a[i] = v` is IndexAssignment, `o.x = v` is FieldAssignment.
      // Neither member form is re-checked here for what it is a member OF: this node's child is
      // gated in its own right, and gateElementAccess and gateMemberAccess are where that lives.
      // A dynamic-shape member is a fourth target, plain `=` only: the compound forms fold to a
      // read of the place, and the read-once machinery hoists SLOTS, which a shape-table entry
      // is not -- so they stay refused below, not admitted here.
      return isAssignableTarget(bin.left, typeChecker) ||
        (ts.isPropertyAccessExpression(bin.left) &&
          isDynamicShape(typeChecker.getTypeAtLocation(bin.left.expression), typeChecker))
        ? { kind: 'accept' }
        : notYet('assignment to anything but a variable is not yet supported', 5);

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
        return notYet('compound assignment to anything but a variable is not yet supported', 5);
      }
      return gateUpdate(bin);

    default:
      return notYet('this operator is not yet supported', 5);
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
        return notYet('++ and -- on anything but a variable are not yet supported', 5);
      }
      return gateUpdate(unary);

    default:
      return notYet('this unary operator is not yet supported', 5);
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
    return notYet('++, -- and compound assignment are not yet supported here', 5);
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
  return notYet('using the value of ++, -- or a compound assignment is not yet supported', 5);
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

function gateCall(call: ts.CallExpression, typeChecker: ts.TypeChecker, mode: Mode): GateResult {
  // Dynamic code generation — `eval(...)` and `Function(...)` — own dedicated codes that split by
  // mode (STA1101/STA1103 never in ts, STA1206 not-yet Phase 8 in js). Asked before anything else
  // because the identifier `eval` is also a GLOBAL, and the global catch-all would otherwise
  // swallow it as STA1214 "the global 'eval'" (plan.md §8 step 2, plan-notes 141).
  const dynamicCode = dynamicCodeGeneration(call.expression, typeChecker);
  if (dynamicCode !== undefined) {
    return dynamicCode === 'eval' ? evalResult(mode) : functionCtorResult(mode);
  }

  // Asked first, because it is what decides whether the type arguments below are a feature or a
  // refusal: `box<string>('a')` and `box('a')` name the same specialization, and the difference
  // between them is a spelling the checker has already erased by the time it answers.
  const generic = genericCallInstantiation(call, typeChecker);
  if (generic.kind === 'unresolved') {
    return notYet(
      'a generic call whose type arguments no argument determines is not yet supported',
      5,
    );
  }
  if (generic.kind === 'not-generic' && call.typeArguments !== undefined) {
    return notYet('explicit type arguments on a call are not yet supported', 5);
  }
  const callee = skipParens(call.expression);

  // Two property-access callees, each its own HIR node: `console.log`, and a method of a class
  // this subset lays out. Anything else -- a method on a built-in, on an object literal, on an
  // interface-typed value -- needs the shape lookup the dynamic path will bring.
  if (ts.isPropertyAccessExpression(callee)) {
    if (isConsoleLog(callee)) {
      const method = callee.name.text as ConsoleMethod;
      const shape = CONSOLE_METHODS[method];
      const given = call.arguments.length;
      // A spread argument is refused here rather than counted: the lowering pads and the emitter
      // picks an entry point by COUNT, and a spread's count is not its arity.
      if (call.arguments.some((a) => ts.isSpreadElement(a))) {
        return notYet(`a spread argument to console.${method} is not yet supported`, 5);
      }
      if (given > shape.arity || given < shape.arity - shape.optional) {
        return notYet(`console.${method} with ${String(given)} arguments is not yet supported`, 5);
      }
      // `console.table` is the one console method whose ARGUMENT changes the output shape. Node
      // draws a Map or a Set with an `(iteration index)` column -- and a Map with a second `Key`
      // column -- which is a different table, not a wider one. Refusing it keeps the runtime from
      // drawing something Node does not; the array and object forms are what landed.
      const first = call.arguments[0];
      return method !== 'table' ||
        first === undefined ||
        collectionOf(first, typeChecker) === undefined
        ? { kind: 'accept' }
        : notYet('console.table on a Map or a Set is not yet supported', 5);
    }
    // A Math method: one runtime function per operation, like a collection op. Spread arguments
    // are refused here rather than lowered wrong -- `Math.min(...xs)` has no fixed arity to fold.
    if (isGlobalMath(callee.expression, typeChecker)) {
      if (!MATH_METHODS.has(callee.name.text)) {
        return notYet(`Math.${callee.name.text} is not yet supported`, 5);
      }
      if (call.arguments.some((a) => ts.isSpreadElement(a))) {
        return notYet('a spread argument to a Math method is not yet supported', 5);
      }
      // hypot is the one variadic Math method the lowering CANNOT fold, because it is not
      // associative: V8 computes the three-argument form with a Kahan compensation term, so
      // folding it into nested binary calls would agree with Node on easy inputs and disagree
      // exactly where the compensation is doing work. Refused rather than approximated.
      if (callee.name.text === 'hypot' && call.arguments.length > 2) {
        return notYet('Math.hypot with more than two arguments is not yet supported', 5);
      }
      return { kind: 'accept' };
    }
    // JSON.stringify and JSON.parse, single-argument forms. A replacer, an indent, or a reviver
    // changes the whole shape of the operation and stays deferred.
    if (isGlobalJson(callee.expression, typeChecker)) {
      const method = callee.name.text;
      if (method !== 'stringify' && method !== 'parse') {
        return notYet(`JSON.${method} is not yet supported`, 5);
      }
      const [argument] = call.arguments;
      if (call.arguments.length !== 1 || argument === undefined) {
        return notYet(`JSON.${method} with other than one argument is not yet supported`, 5);
      }
      if (ts.isSpreadElement(argument)) {
        return notYet(`a spread argument to JSON.${method} is not yet supported`, 5);
      }
      // parse reads TEXT. A value the checker types as something OTHER than a string is the
      // program leaning on ToString, a conversion the runtime parser does not do, and the
      // compiler can say so here rather than at run time. An untyped value is the js-mode norm
      // and is accepted: the tag check the runtime performs is the honest place to settle it,
      // and it aborts loudly rather than reading a non-string as text.
      if (method === 'parse') {
        const argumentType = typeChecker.getTypeAtLocation(argument);
        const untyped = (argumentType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
        return untyped || isStringReceiver(argument, typeChecker)
          ? { kind: 'accept' }
          : notYet('JSON.parse of a value that is not a string is not yet supported', 5);
      }
      return admitsUnserializable(typeChecker.getTypeAtLocation(argument), typeChecker)
        ? notYet(
            'JSON.stringify of a value that may be undefined or a function is not yet supported',
            5,
          )
        : { kind: 'accept' };
    }
    // The Object namespace calls. A walking method's argument must be something whose keys the
    // runtime CAN walk — a fixed shape (its class descriptor lists the fields) or a dynamic shape
    // (its shape chain does). An array, a Map, or a primitive at that position answers
    // differently in Node than either walk would, so each stays deferred rather than
    // approximated. `fromEntries` is the mirror: it iterates, so it wants the array.
    if (isGlobalObject(callee.expression, typeChecker)) {
      const method = callee.name.text;
      if (!Object.hasOwn(OBJECT_STATICS, method)) {
        return notYet(`Object.${method} is not yet supported`, OBJECT_STATIC_OWNER[method] ?? 5);
      }
      const shape = OBJECT_STATICS[method as keyof typeof OBJECT_STATICS];
      const [argument, second] = call.arguments;
      if (call.arguments.length !== shape.arity || argument === undefined) {
        return notYet(
          `Object.${method} with other than ${String(shape.arity)} arguments is not yet supported`,
          5,
        );
      }
      if (call.arguments.some((a) => ts.isSpreadElement(a))) {
        return notYet('a spread argument to an Object method is not yet supported', 5);
      }
      if (!acceptsObjectArgument(shape.receiver, argument, typeChecker)) {
        return notYet(`Object.${method} on this argument type is not yet supported`, 5);
      }
      if (shape.second === 'none') {
        return { kind: 'accept' };
      }
      if (second === undefined) {
        return notYet(`Object.${method} without a second argument is not yet supported`, 5);
      }
      // The key is a runtime string: a symbol or a number reads a property neither layout holds,
      // and converting one is the ToPropertyKey the object model owns.
      if (shape.second === 'key') {
        return isStringReceiver(second, typeChecker)
          ? { kind: 'accept' }
          : notYet(`Object.${method} with a key that is not a string is not yet supported`, 5);
      }
      return acceptsObjectArgument('shaped', second, typeChecker)
        ? { kind: 'accept' }
        : notYet(`Object.${method} from this source type is not yet supported`, 5);
    }
    // The `Date` namespace calls slice A lands: `Date.UTC` and `Date.parse`. `now` reads the
    // clock and is refused here by name -- it proves through Task 4.2's determinism carve-out,
    // not a golden test. Trailing components may be omitted (the lowering pads them); an argument
    // count ABOVE the table's arity is the spec's own "extra arguments are ignored", which this
    // compiler does not silently perform.
    if (isGlobalDate(callee.expression, typeChecker)) {
      const method = callee.name.text;
      if (!Object.hasOwn(DATE_STATICS, method)) {
        return dateNotYet(`Date.${method}`, 5);
      }
      const shape = DATE_STATICS[method as DateStatic];
      if (call.arguments.some((a) => ts.isSpreadElement(a))) {
        return dateNotYet('a spread argument to a Date method', 5);
      }
      return call.arguments.length > shape.arity ||
        call.arguments.length < shape.arity - shape.optional
        ? dateNotYet(`Date.${method} with ${String(call.arguments.length)} arguments`, 5)
        : { kind: 'accept' };
    }
    // The Promise namespace calls. `all` wants an ARRAY specifically -- the runtime walks one,
    // and every other iterable is the Symbol.iterator protocol -- while `resolve` and `reject`
    // take any value at all, which is why neither checks the argument's type.
    if (isGlobalPromise(callee.expression, typeChecker)) {
      const method = callee.name.text;
      if (!Object.hasOwn(PROMISE_STATICS, method)) {
        return notYet(`Promise.${method} is not yet supported`, 5);
      }
      if (call.arguments.length !== 1) {
        return notYet(`Promise.${method} with other than one argument is not yet supported`, 5);
      }
      const [argument] = call.arguments;
      if (argument === undefined || ts.isSpreadElement(argument)) {
        return notYet('a spread argument to a Promise method is not yet supported', 5);
      }
      if (
        PROMISE_STATICS[method as keyof typeof PROMISE_STATICS].array &&
        !isArrayOrTuple(typeChecker.getTypeAtLocation(argument), typeChecker)
      ) {
        return notYet('Promise.all over a non-array is not yet supported', 5);
      }
      return { kind: 'accept' };
    }
    // A method ON a promise -- `.then`, `.catch`, `.finally` -- runs a JS callback whose own throw
    // must become a rejection of the derived promise. That is a runtime-level catch, and the
    // pending-exception protocol gives one to generated code, not to a builtin. An async function
    // needs none of them: its landing pad rejects its own promise in emitted C.
    if (
      tsTypeToHType(typeChecker.getTypeAtLocation(callee.expression), typeChecker).kind ===
      'promise'
    ) {
      return {
        kind: 'not-yet',
        code: 'STA1216',
        message:
          `Promise.prototype.${callee.name.text} is not yet supported: use an async function, ` +
          'whose await and return do the same work',
        phase: 5,
      };
    }
    // The landed String.prototype surface. The extra argument checks close the two union-typed
    // holes the closed set cannot see: a RegExp pattern (Task 4.3) and a replacer FUNCTION are
    // both legal TypeScript at these positions, and each needs machinery no string op has.
    if (isStringReceiver(callee.expression, typeChecker)) {
      const op = callee.name.text;
      if (!Object.hasOwn(STRING_OPS, op)) {
        return notYet(`String.prototype.${op} is not yet supported`, 5);
      }
      if (call.arguments.some((a) => ts.isSpreadElement(a))) {
        return notYet('a spread argument to a string method is not yet supported', 5);
      }
      if (op === 'concat' && call.arguments.length !== 1) {
        // Variadic concat has no node to fold into (the array-concat rule), and the
        // zero-argument copy is pointless on an immutable string.
        return notYet('concat with other than one argument is not yet supported', 5);
      }
      if (op === 'split' && call.arguments.length > 1) {
        return notYet('split with a limit is not yet supported', 5);
      }
      // The two argument shapes a closed op set cannot express, both of which are legal
      // TypeScript at these positions. A PATTERN may be a string or a regexp -- the runtime
      // dispatches on the tag, because a regexp pattern is a scan and a string one is a substring
      // search. Everything else in an argument position must be a string: a replacer FUNCTION runs
      // user code per match, which is machinery no string op has.
      if (op === 'split' || op === 'replace' || op === 'replaceAll' || op === 'search') {
        for (const [index, argument] of call.arguments.entries()) {
          const kind = tsTypeToHType(typeChecker.getTypeAtLocation(argument), typeChecker).kind;
          const patternPosition = index === 0;
          if (kind === 'regexp' ? !patternPosition : kind !== 'string') {
            return notYet(`${op} with this argument type is not yet supported`, 5);
          }
        }
        // `search` has no string form at all: the spec builds a RegExp out of whatever it is
        // given, and `new RegExp(...)` is a constructor this compiler does not have.
        const pattern = call.arguments[0];
        if (op === 'search' && (pattern === undefined || !isRegExpReceiver(pattern, typeChecker))) {
          return notYet('search with anything but a regular expression is not yet supported', 5);
        }
      }
      // The locale-sensitive trio is the one part of this surface that Unicode's own tables cannot
      // answer: collation is a per-locale ORDER and tailored casing a per-locale EXCEPTION, both
      // of them CLDR data. They land only in the ICU feature build (Task 4.4), and only with an
      // EXPLICIT locale -- the spec's absent-locales form reads the HOST's default, which would
      // make a compiled program's output depend on the machine that runs it rather than on its
      // source, and every golden test in this repo rests on that not being true.
      if (op === 'localeCompare' || op === 'toLocaleLowerCase' || op === 'toLocaleUpperCase') {
        if (!intlEnabled()) {
          // No `phase`: the blocker is a BUILD FLAG, not a release (src/support/phases.ts). The
          // feature is available right now to anyone who rebuilds; a phase number here would tell
          // the user to wait for something that has already shipped.
          return {
            kind: 'not-yet',
            code: 'STA1215',
            message:
              `String.prototype.${op} needs the ICU feature build: rebuild with ` +
              '`make -C runtime intl` and compile with STATOR_RUNTIME=intl',
          };
        }
        if (call.arguments.length !== STRING_OPS[op].arity) {
          // No padding here, unlike every other op in the table: an absent locale is not the same
          // request with a default filled in, it is the host-dependent form refused above.
          return notYet(`${op} without an explicit locale is not yet supported`, 5);
        }
        for (const argument of call.arguments) {
          const kind = tsTypeToHType(typeChecker.getTypeAtLocation(argument), typeChecker).kind;
          if (kind !== 'string') {
            // `locales` is also legally a string[] and `options` an object; both are Intl
            // negotiation this compiler does not model.
            return notYet(`${op} with this argument type is not yet supported`, 5);
          }
        }
      }
      return { kind: 'accept' };
    }
    // The landed Array.prototype surface — the non-callback methods. The refusals close what the
    // closed set cannot express: variadic `push`/`unshift` have no node to fold into,
    // `lastIndexOf` gives an explicit position a DIFFERENT meaning than an absent one (so the
    // padding that is sound everywhere else would change the answer), and `concat` lands as
    // exactly one spread array argument.
    if (isArrayReceiver(callee.expression, typeChecker)) {
      const op = callee.name.text;
      if (!Object.hasOwn(ARRAY_OPS, op)) {
        return notYet(`Array.prototype.${op} is not yet supported`, 5);
      }
      if (call.arguments.some((a) => ts.isSpreadElement(a))) {
        return notYet('a spread argument to an array method is not yet supported', 5);
      }
      if ((op === 'push' || op === 'unshift') && call.arguments.length !== 1) {
        return notYet(`${op} with other than one argument is not yet supported`, 5);
      }
      if (op === 'lastIndexOf' && call.arguments.length > 1) {
        return notYet('lastIndexOf with a position is not yet supported', 5);
      }
      if ((op === 'splice' || op === 'toSpliced') && call.arguments.length !== 2) {
        // splice(start) deletes to the END while an explicit undefined deleteCount deletes
        // nothing (the lastIndexOf rule), and the insertion form is variadic.
        return notYet(`${op} with other than two arguments is not yet supported`, 5);
      }
      if ((op === 'sort' || op === 'toSorted') && call.arguments.length === 0) {
        return { kind: 'accept' }; // the ToString default; an explicit undefined means the same
      }
      if (op === 'reduce' || op === 'reduceRight') {
        // The zero-initial form seeds from the first element and cannot share the padded
        // signature: an explicit `undefined` initial IS an initial.
        if (call.arguments.length !== 2) {
          return notYet(`${op} without an initial value is not yet supported`, 5);
        }
      } else if (Object.hasOwn(CALLBACK_ARRAY_OPS, op) && call.arguments.length !== 1) {
        return notYet(`${op} with a thisArg is not yet supported`, 5);
      }
      if (Object.hasOwn(CALLBACK_ARRAY_OPS, op)) {
        const cb = call.arguments[0];
        // A callback the checker cannot type as callable would reach jsrt_call as a non-closure
        // and die there; in js mode an `any`-typed callback lands here too, and refusing it is
        // the honest answer until the dynamic tier can carry it.
        if (
          cb === undefined ||
          typeChecker.getSignaturesOfType(typeChecker.getTypeAtLocation(cb), ts.SignatureKind.Call)
            .length === 0
        ) {
          return notYet(`${op} with a non-function callback is not yet supported`, 5);
        }
      }
      if (op === 'concat') {
        const arg = call.arguments[0];
        if (
          call.arguments.length !== 1 ||
          arg === undefined ||
          !typeChecker.isArrayType(typeChecker.getTypeAtLocation(arg))
        ) {
          return notYet('concat with anything but one array is not yet supported', 5);
        }
      }
      return { kind: 'accept' };
    }
    // `RegExp.prototype`'s METHODS -- `test`, `exec`, `toString`. The one member left under
    // STA1211 is `compile`: Annex B B.2.4 legacy that RE-INITIALIZES an existing RegExp in place,
    // which is the mutate-a-built-object surface Phase 8 owns with STA1204, not a builtin this
    // phase declined to write (plan-notes 121, 136).
    if (isRegExpReceiver(callee.expression, typeChecker)) {
      const op = callee.name.text;
      if (!Object.hasOwn(REGEXP_OPS, op)) {
        return {
          kind: 'not-yet',
          code: 'STA1211',
          message: `RegExp.prototype.${op} is not yet supported; planned for Phase 8`,
          phase: 8,
        };
      }
      if (call.arguments.some((a) => ts.isSpreadElement(a))) {
        return notYet('a spread argument to a RegExp method is not yet supported', 5);
      }
      const arity = REGEXP_OPS[op as RegExpOperation].arity;
      if (call.arguments.length !== arity) {
        return notYet(`${op} with other than ${String(arity)} arguments is not yet supported`, 5);
      }
      const subject = call.arguments[0];
      if (subject === undefined) {
        return { kind: 'accept' }; // `toString`, the one nullary method: no subject to vet
      }
      // The JSON.parse rule: a value the checker types as something OTHER than a string is the
      // program leaning on ToString, which the bridge does not perform, and the compiler can say
      // so here. An untyped one is the js-mode norm and is accepted -- the runtime's tag check is
      // the honest place to settle it, and it aborts loudly rather than reading a non-string.
      const subjectType = typeChecker.getTypeAtLocation(subject);
      const untyped = (subjectType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
      return untyped || isStringReceiver(subject, typeChecker)
        ? { kind: 'accept' }
        : notYet(`${op} of a value that is not a string is not yet supported`, 5);
    }
    // `Date.prototype`'s methods. Slice A is the TZ-independent core: the UTC getters and setters,
    // the three string forms, and the two time-value reads. Every LOCAL-time member (getFullYear,
    // toString, getTimezoneOffset, ...) is refused by name here and lands in slice B, where the
    // golden runner's TZ pin makes it provable.
    if (isDateReceiver(callee.expression, typeChecker)) {
      const op = callee.name.text;
      if (!Object.hasOwn(DATE_OPS, op)) {
        return dateNotYet(`Date.prototype.${op}`);
      }
      if (call.arguments.some((a) => ts.isSpreadElement(a))) {
        return dateNotYet('a spread argument to a Date method', 5);
      }
      const shape = DATE_OPS[op as DateOperation];
      return call.arguments.length > shape.arity ||
        call.arguments.length < shape.arity - shape.optional
        ? dateNotYet(`${op} with ${String(call.arguments.length)} arguments`, 5)
        : { kind: 'accept' };
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
      return notYet('method calls are not yet supported', 5);
    }
    return methodDeclaringClass(declaration, callee.name.text, typeChecker) !== undefined
      ? { kind: 'accept' }
      : notYet('calling a class field is not yet supported', 5);
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
    return { kind: 'accept' };
  }
  if (ts.isFunctionExpression(callee) || ts.isArrowFunction(callee)) {
    return { kind: 'accept' };
  }
  return notYet('calling an arbitrary expression is not yet supported', 5);
}

/** Rung 4a: functions with no captured environment. Each rejection below is a feature whose
 * binding form the HIR has no node for, not a judgement about the function itself. */
function gateFunction(
  fn: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
): GateResult {
  // A generator's asterisk is checked here as well as at YieldExpression, because a generator
  // with no `yield` in it is still a generator and still returns an iterator.
  if (!ts.isArrowFunction(fn) && fn.asteriskToken !== undefined) {
    return generatorNotYet();
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
    return notYet('a generic function expression or arrow is not yet supported', 5);
  }
  if (fn.body === undefined) {
    return notYet('overload signatures are not yet supported', 5);
  }
  // An arrow's expression body (`(x) => x * 2`) is a Block in the HIR with a single return; the
  // lowering synthesises it, so nothing is gated here beyond what the expression itself gates.
  if (ts.isFunctionExpression(fn) && fn.name !== undefined) {
    return notYet('named function expressions are not yet supported', 5);
  }
  if (ts.isFunctionDeclaration(fn) && !isBodyTopLevel(fn.parent)) {
    return notYet('a function declaration inside a block, loop or branch is not yet supported', 5);
  }
  return { kind: 'accept' };
}

/** Shared by every generator spelling: the asterisk, `yield`, and `for await`. Async landed in
 * Phase 4 and generators did not, so this code now names only what is still missing -- one code,
 * one feature, which is what makes `stator explain` legible. */
function generatorNotYet(): GateResult {
  return {
    kind: 'not-yet',
    code: 'STA1201',
    message: 'generators are not yet supported; planned for Phase 5 (the iterator protocol)',
    phase: 5,
  };
}

/** `await e`, admitted only inside an async function's body.
 *
 * An await compiles into the resume machinery of the function that contains it -- a state number,
 * a suspension point, a label -- and a module body has none of that: it runs once, on the way to
 * `main`'s return, with no promise to settle and nothing to re-enter. Top-level await is therefore
 * a separate feature rather than the same one in another place, and it gets its own code. */
function gateAwait(node: ts.Node): GateResult {
  for (let n: ts.Node | undefined = node.parent; n !== undefined; n = n.parent) {
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isConstructorDeclaration(n) ||
      ts.isGetAccessorDeclaration(n) ||
      ts.isSetAccessorDeclaration(n)
    ) {
      return n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) === true
        ? { kind: 'accept' }
        : notYet('await outside an async function is not yet supported', 5);
    }
  }
  return {
    kind: 'not-yet',
    code: 'STA1208',
    message:
      'top-level await is not yet supported: a module body has no resume point to suspend into',
    // Phase 5 step 9, not 4: Task 4.6 built resume points for FUNCTIONS, and making the module
    // init function an async unit is lowering work (plan-notes 116).
    phase: 5,
  };
}

/** A parameter the HIR can bind: one plain name, always present, never defaulted. Everything
 * else is a binding form (patterns, rest) or a control-flow one (defaults run code at call
 * time), and each arrives with the feature it belongs to. */
function gateTypeParameter(parameter: ts.TypeParameterDeclaration): GateResult {
  if (parameter.constraint !== undefined) {
    return notYet('a constrained type parameter is not yet supported', 5);
  }
  if (parameter.default !== undefined) {
    return notYet('a type parameter with a default is not yet supported', 5);
  }
  return { kind: 'accept' };
}

function gateParameter(param: ts.ParameterDeclaration): GateResult {
  if (param.dotDotDotToken !== undefined) {
    return notYet('rest parameters are not yet supported', 5);
  }
  if (param.initializer !== undefined) {
    return notYet('default parameter values are not yet supported', 5);
  }
  if (param.questionToken !== undefined) {
    return notYet('optional parameters are not yet supported', 5);
  }
  if (!ts.isIdentifier(param.name)) {
    return notYet('destructuring parameters are not yet supported', 5);
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

/** The checker says the receiver is a string — literal types and unions of literals included,
 * exactly the test isStringLength uses. */
export function isStringReceiver(expression: ts.Expression, checker: ts.TypeChecker): boolean {
  return (checker.getTypeAtLocation(expression).flags & ts.TypeFlags.StringLike) !== 0;
}

/** The checker says the receiver is an array — the test isArrayLength uses, shared with the
 * lowering so both decide "array method" identically. A tuple answers false, with everything
 * else. */
export function isArrayReceiver(expression: ts.Expression, checker: ts.TypeChecker): boolean {
  return checker.isArrayType(checker.getTypeAtLocation(expression));
}

/** The checker says the receiver is a RegExp — the same shape as isArrayReceiver, decided through
 * the HType mapping so the gate and the lowering agree on what a regexp receiver is. */
export function isRegExpReceiver(expression: ts.Expression, checker: ts.TypeChecker): boolean {
  return tsTypeToHType(checker.getTypeAtLocation(expression), checker).kind === 'regexp';
}

/** Is this the MATCH ARRAY `exec` or a non-global `match` answered?
 *
 * The checker is the only thing that can say so: the value's HIR type is Unknown, because the call
 * answers a match OR null and the HIR has no union — so a `RegExpExecArray` here is a narrowing the
 * checker performed and this compiler trusts, exactly as it trusts `isStringReceiver`. The lib
 * declares two names for one runtime shape: `exec` answers the first, `String.prototype.match` the
 * second, and they differ only in whether `index`/`input` are optional. */
export function isMatchReceiver(expression: ts.Expression, checker: ts.TypeChecker): boolean {
  const type = checker.getTypeAtLocation(expression);
  const name = type.getSymbol()?.getName();
  if (name !== 'RegExpExecArray' && name !== 'RegExpMatchArray') {
    return false;
  }
  const declarations = type.getSymbol()?.getDeclarations() ?? [];
  return declarations.length > 0 && declarations.every((d) => d.getSourceFile().isDeclarationFile);
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
        5,
      );
    }
    if (!ts.isIdentifier(property.name)) {
      return notYet('an object literal key that is not an identifier is not yet supported', 5);
    }
  }
  // The CONTEXTUAL type decides the dynamic question, and the order matters: in
  // `const o: { x?: number } = { x: 1 }` the literal's own type is `{ x: number }` -- a perfectly
  // good layout -- but the binding's type is the annotation, and every later read of `o` sees THAT.
  // Building a fixed object here would make each of those reads a runtime not-yet; honoring the
  // annotation builds the dynamic object the reads expect (docs/VALUE.md §4.10).
  const decisive = checker.getContextualType(literal) ?? checker.getTypeAtLocation(literal);
  if (isDynamicShape(decisive, checker)) {
    return { kind: 'accept' };
  }
  return tsTypeToHType(checker.getTypeAtLocation(literal), checker).kind === 'object'
    ? { kind: 'accept' }
    : // What remains is a shape neither path takes: an interface, or an anonymous shape with a
      // method or accessor member. Both need calling through the shape table, which is Phase 5.
      notYet('an object literal whose shape is not a layout is not yet supported', 5);
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
    return notYet('an anonymous class is not yet supported', 5);
  }
  if (declaration.typeParameters !== undefined) {
    return notYet('a generic class is not yet supported', 5);
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
        return notYet('a static getter or setter is not yet supported', 5);
      }
      if (member.body === undefined) {
        return notYet('an accessor with no body is not yet supported', 5);
      }
      if (!ts.isIdentifier(member.name)) {
        return notYet('a computed or #private accessor name is not yet supported', 5);
      }
      // An accessor re-declaring an inherited name is overriding, and an accessor is dispatched
      // directly -- the method table is indexed only where the lowering proved a method is
      // declared twice, which it asks of method DECLARATIONS.
      if (inheritedInstance.has(member.name.text)) {
        return notYet(
          `overriding the inherited member '${member.name.text}' is not yet supported`,
          5,
        );
      }
      continue;
    }
    if (ts.isIndexSignatureDeclaration(member)) {
      return notYet('an index signature on a class is not yet supported', 5);
    }
    if (ts.isSemicolonClassElement(member)) {
      continue; // a stray `;` between members declares nothing
    }
    // A static initialization block runs arbitrary statements against the class object, in a scope
    // where `this` is the class. There is no class object here -- a static is one plain binding --
    // so there is nothing for the block's `this` to be.
    if (ts.isClassStaticBlockDeclaration(member)) {
      return notYet('a static initialization block is not yet supported', 5);
    }
    if (
      member.name !== undefined &&
      !ts.isIdentifier(member.name) &&
      !ts.isPrivateIdentifier(member.name)
    ) {
      return notYet('a computed class member name is not yet supported', 5);
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
        5,
      );
    }
    if (ts.isConstructorDeclaration(member)) {
      constructors++;
      // An overload signature has no body and declares nothing to emit; two BODIES would be two
      // constructors for one layout, which the checker rejects anyway.
      if (member.body === undefined) {
        return notYet('a constructor overload signature is not yet supported', 5);
      }
      // A derived constructor must open with `super(...)`. JavaScript already forbids touching
      // `this` before it, and requiring the CALL to be the first statement is what lets the
      // lowering place the inherited field initializers: they run after the base constructor and
      // before this body, which is only a fixed position if the call is in a fixed position.
      if (baseClassOf(declaration, checker) !== undefined && !opensWithSuperCall(member)) {
        return notYet(
          'a derived constructor that does not open with super(...) is not yet supported',
          5,
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
          5,
        );
      }
      // A method table is one file-scope constant per class, so no method in an overriding family
      // may capture. A class at module scope has nothing to capture; a class inside a function may,
      // and there is no per-instantiation table to hold what it captured.
      if (!ts.isSourceFile(declaration.parent)) {
        return notYet(
          'overriding a method in a class declared inside a function is not yet supported',
          5,
        );
      }
    }
    if (ts.isMethodDeclaration(member)) {
      if (member.body === undefined) {
        return notYet('a method overload signature is not yet supported', 5);
      }
      if (member.asteriskToken !== undefined) {
        return generatorNotYet();
      }
      if (member.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) === true) {
        // The async lowering gives a function one heap environment holding every binding it has.
        // A method also has a receiver, which arrives as a parameter and would have to join them;
        // that is a second question, and it lands with the second slice rather than by accident.
        return notYet('an async method is not yet supported', 5);
      }
      if (member.questionToken !== undefined) {
        return notYet('an optional method is not yet supported', 5);
      }
      continue;
    }
    if (ts.isPropertyDeclaration(member)) {
      if (member.questionToken !== undefined) {
        // `x?: number` is `number | undefined` with a distinction the slot cannot keep: an absent
        // property and one holding `undefined` read the same, but `in` and inspect tell them apart.
        return notYet('an optional class field is not yet supported', 5);
      }
      continue;
    }
    return notYet('this class member is not yet supported', 5);
  }
  if (constructors > 1) {
    return notYet('more than one constructor is not yet supported', 5);
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
      return notYet('extending other than exactly one class is not yet supported', 5);
    }
    if (baseClassOf(declaration, checker) === undefined) {
      return notYet('extending anything but a class declaration is not yet supported', 5);
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
 * an operation that is NOT here (`keys`, `entries`, `values`, `union`) hands back an ITERATOR,
 * which is the Symbol.iterator protocol the subset has no node for. Reading the list off the lib
 * would turn each of those into an internal error instead of a `not-yet`.
 *
 * `forEach` IS here, and was previously grouped with them by mistake: it takes a callback, not an
 * iterator, and the runtime calls it through `jsrt_call` exactly as the `Array.prototype` callback
 * methods already do — no protocol the subset lacks (plan-notes 97). */
const COLLECTION_OPS: Readonly<Record<'map' | 'set', Readonly<Record<string, number>>>> = {
  map: { get: 1, set: 2, has: 1, delete: 1, clear: 0, forEach: 1 },
  set: {
    add: 1,
    has: 1,
    delete: 1,
    clear: 0,
    forEach: 1,
    union: 1,
    intersection: 1,
    difference: 1,
    symmetricDifference: 1,
    isSubsetOf: 1,
    isSupersetOf: 1,
    isDisjointFrom: 1,
  },
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
    return notYet(`${callee.name.text} on a ${collectionName(collection)} is not yet supported`, 5);
  }
  if (call.arguments.length !== arity) {
    return notYet(
      `${collectionName(collection)}.${callee.name.text} with ${String(call.arguments.length)} arguments is not yet supported`,
      5,
    );
  }
  if (isSetOperation(callee.name.text)) {
    // The spec takes a SET-LIKE object here -- anything with a `size`, a `has` and a `keys` -- and
    // reads it by calling `keys()`, which is the iterator protocol the subset has no node for. A
    // real Set is read straight out of the table instead, so that is the whole of what is accepted:
    // the runtime reads this argument as a JSRTMap, and a wrong one is not a wrong answer.
    const other = call.arguments[0];
    if (other === undefined || collectionOf(other, checker) !== 'set') {
      return notYet(
        `Set.${callee.name.text} with an argument that is not a Set is not yet supported`,
        5,
      );
    }
    return { kind: 'accept' };
  }
  if (callee.name.text === 'forEach') {
    // The same rule the array callback ops follow: a callback the checker cannot type as callable
    // would reach jsrt_call as a non-closure and die there, and an `any` callback in js mode lands
    // here too. Refusing it is the honest answer until the dynamic tier can carry one.
    const cb = call.arguments[0];
    if (
      cb === undefined ||
      checker.getSignaturesOfType(checker.getTypeAtLocation(cb), ts.SignatureKind.Call).length === 0
    ) {
      return notYet(
        `${collectionName(collection)}.forEach with a non-function callback is not yet supported`,
        5,
      );
    }
  }
  return { kind: 'accept' };
}

function gateNew(node: ts.NewExpression, checker: ts.TypeChecker, mode: Mode): GateResult {
  if (dynamicCodeGeneration(node.expression, checker) === 'function') {
    return functionCtorResult(mode);
  }
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
          5,
        );
  }
  if (isGlobalPromise(node.expression, checker)) {
    return {
      kind: 'not-yet',
      code: 'STA1216',
      message:
        'new Promise(executor) is not yet supported: the executor is a JS callback whose throw ' +
        'must become a rejection, which needs a runtime-level catch',
      phase: 5,
    };
  }
  // `new Date(...)` in each of its three forms: the zero-argument clock read, the one-argument time
  // value / ISO string / Date copy (slice A), and the component list read as LOCAL time (slice B).
  // Every one of them is accepted; the arity ceiling is the spec's own seven.
  if (isGlobalDate(node.expression, checker)) {
    const args = node.arguments ?? [];
    // The zero-argument form is ACCEPTED: it reads a clock, and nondeterminism is a proof problem
    // rather than an acceptance problem (plan §7's determinism carve-out). It proves through a
    // monotonicity unit test instead of a golden fixture.
    if (args.length === 0) {
      return { kind: 'accept' };
    }
    if (args.some((argument) => ts.isSpreadElement(argument))) {
      return dateNotYet('a spread argument to new Date', 5);
    }
    // Seven is the whole component list (§21.4.2.1); the checker's own overloads already reject
    // more, so this only guards against a lib that does not.
    if (args.length > 7) {
      return dateNotYet(`new Date with ${String(args.length)} arguments`, 5);
    }
    return { kind: 'accept' };
  }
  if (node.typeArguments !== undefined) {
    return notYet('explicit type arguments on a constructor call are not yet supported', 5);
  }
  if (!ts.isIdentifier(node.expression)) {
    return notYet('new on anything but a named class is not yet supported', 5);
  }
  if (classDeclarationOf(checker.getTypeAtLocation(node)) === undefined) {
    return notYet('new on this type is not yet supported', 5);
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
        ? notYet('this in a static class member is not yet supported', 5)
        : { kind: 'accept' };
    }
    // An arrow does NOT stop the walk: it has no `this` of its own and sees the enclosing one,
    // which is the whole reason arrows are used inside methods. A `function` expression does stop
    // it -- its `this` is the caller's, not the class's.
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) {
      break;
    }
  }
  return notYet('this outside a class member is not yet supported', 5);
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
      return notYet('super as a value is not yet supported', 5);
    }
    const base = classDeclarationOf(checker.getTypeAtLocation(access.expression));
    return base !== undefined &&
      ts.isIdentifier(access.name) &&
      methodDeclaringClass(base, access.name.text, checker) !== undefined
      ? { kind: 'accept' }
      : notYet('super on anything but an inherited method is not yet supported', 5);
  }
  // `Math.floor` and `Math.PI` -- decided before anything that looks for a class, because Math
  // resolves to no declaration this compiler models. A constant is a plain read the lowering
  // folds to a literal; a method exists only as a callee (there is no function VALUE to bind);
  // anything else on Math is a real member of the real global that has not landed.
  if (isGlobalMath(access.expression, checker)) {
    const member = access.name.text;
    if (MATH_CONSTANTS.has(member)) {
      return { kind: 'accept' };
    }
    if (MATH_METHODS.has(member)) {
      return ts.isCallExpression(access.parent) && access.parent.expression === access
        ? { kind: 'accept' }
        : notYet('using a Math method as a value is not yet supported', 5);
    }
    return notYet(`Math.${member} is not yet supported`, 5);
  }

  // Object namespace members follow Math's rules: a method exists only as a callee, and a member
  // outside the landed set is deferred by name.
  if (isGlobalObject(access.expression, checker)) {
    const member = access.name.text;
    if (Object.hasOwn(OBJECT_STATICS, member)) {
      return ts.isCallExpression(access.parent) && access.parent.expression === access
        ? { kind: 'accept' }
        : notYet('using an Object method as a value is not yet supported', 5);
    }
    return notYet(`Object.${member} is not yet supported`, OBJECT_STATIC_OWNER[member] ?? 5);
  }

  // The Date namespace, by Math's rules. `now` is named separately from an unlanded member
  // because its blocker is a proof method, not an implementation (Task 4.2's carve-out).
  if (isGlobalDate(access.expression, checker)) {
    const member = access.name.text;
    if (Object.hasOwn(DATE_STATICS, member)) {
      return ts.isCallExpression(access.parent) && access.parent.expression === access
        ? { kind: 'accept' }
        : notYet('using a Date method as a value is not yet supported', 5);
    }
    return dateNotYet(`Date.${member}`, 5);
  }

  // A Date.prototype method exists only as a callee, the rule every builtin receiver follows.
  // `Date` has no data properties at all -- its time value is internal -- so a non-method member
  // read here is a member of the real prototype that has not landed.
  if (isDateReceiver(access.expression, checker)) {
    const member = access.name.text;
    if (Object.hasOwn(DATE_OPS, member)) {
      return ts.isCallExpression(access.parent) && access.parent.expression === access
        ? { kind: 'accept' }
        : notYet('using a Date method as a value is not yet supported', 5);
    }
    return dateNotYet(`Date.prototype.${member}`);
  }

  // The Promise namespace, same rules again. `.then`/`.catch`/`.finally` are NOT here: they are
  // members of a promise VALUE, not of the namespace, and are refused where a method call on a
  // promise receiver is decided.
  if (isGlobalPromise(access.expression, checker)) {
    const member = access.name.text;
    if (Object.hasOwn(PROMISE_STATICS, member)) {
      return ts.isCallExpression(access.parent) && access.parent.expression === access
        ? { kind: 'accept' }
        : notYet('using a Promise method as a value is not yet supported', 5);
    }
    return notYet(`Promise.${member} is not yet supported`, 5);
  }

  // JSON follows the same rules: stringify and parse exist only as callees; the rest are
  // deferred by name.
  if (isGlobalJson(access.expression, checker)) {
    const member = access.name.text;
    if (member === 'stringify' || member === 'parse') {
      return ts.isCallExpression(access.parent) && access.parent.expression === access
        ? { kind: 'accept' }
        : notYet(`using JSON.${member} as a value is not yet supported`, 5);
    }
    return notYet(`JSON.${member} is not yet supported`, 5);
  }

  // A String.prototype method exists only as a callee -- there is no function value to bind, the
  // same rule a collection method follows. `.length` is handled by its own node and never gets
  // here; any other string member is a real property of the real String.prototype that has not
  // landed.
  if (
    isStringReceiver(access.expression, checker) &&
    access.name.text !== 'length' &&
    !ts.isCallExpression(access.parent)
  ) {
    return Object.hasOwn(STRING_OPS, access.name.text)
      ? notYet('using a string method as a value is not yet supported', 5)
      : notYet(`String.prototype.${access.name.text} is not yet supported`, 5);
  }
  if (
    isStringReceiver(access.expression, checker) &&
    ts.isCallExpression(access.parent) &&
    access.parent.expression === access
  ) {
    return { kind: 'accept' }; // gateCall vets the operation itself
  }

  // Array.prototype members follow the same two rules as String's: a method exists only as a
  // callee, and a member outside the landed set is deferred by name. `.length` has its own node
  // and never gets here.
  if (
    isArrayReceiver(access.expression, checker) &&
    access.name.text !== 'length' &&
    !(ts.isCallExpression(access.parent) && access.parent.expression === access)
  ) {
    return Object.hasOwn(ARRAY_OPS, access.name.text)
      ? notYet('using an array method as a value is not yet supported', 5)
      : notYet(`Array.prototype.${access.name.text} is not yet supported`, 5);
  }
  if (
    isArrayReceiver(access.expression, checker) &&
    ts.isCallExpression(access.parent) &&
    access.parent.expression === access
  ) {
    return { kind: 'accept' }; // gateCall vets the operation itself
  }

  // RegExp.prototype follows String's and Array's rule for its METHODS: one is a CALLEE and
  // nothing else. Its DATA properties are the other half of the surface -- `REGEXP_FIELDS` is the
  // closed set of them -- and they are reads, so they are admitted here and nowhere else.
  if (isRegExpReceiver(access.expression, checker)) {
    if (ts.isCallExpression(access.parent) && access.parent.expression === access) {
      return { kind: 'accept' }; // gateCall vets the operation itself
    }
    // A READ. `re.lastIndex = 0` is a write into a builtin -- not a read spelled backwards -- and
    // is refused by the assignment gate above, which admits a field of a CLASS and nothing else
    // (plan-notes 121).
    if (Object.hasOwn(REGEXP_FIELDS, access.name.text)) {
      return { kind: 'accept' };
    }
    // The data properties are closed, so what reaches here is the rest of the prototype object --
    // Phase 8's surface, the same as `compile` above. `unicodeSets` is the one name a user might
    // reasonably write, and it never gets this far: it is declared in lib.es2024 and this project
    // pins `lib: ["es2023"]`, so the checker refuses the read first (plan-notes 136).
    return {
      kind: 'not-yet',
      code: 'STA1211',
      message: `RegExp.prototype.${access.name.text} is not yet supported; planned for Phase 8`,
      phase: 8,
    };
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
      ? notYet('using a method as a value is not yet supported', 5)
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
          5,
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
        : notYet('a property that is not a field of the shape is not yet supported', 5);
    }
    // `p.x` on a DYNAMIC shape -- one with an optional property or an index signature -- resolves
    // through the shape table at run time (docs/VALUE.md §4.10). Reads and writes only: a name the
    // type does not admit is a checker error before it is a gate question, and a CALL through the
    // table needs a bound method object nothing here builds yet.
    const receiver = checker.getTypeAtLocation(access.expression);
    if (isDynamicShape(receiver, checker)) {
      if (ts.isCallExpression(access.parent) && access.parent.expression === access) {
        return notYet('calling a method through a dynamic shape is not yet supported', 5);
      }
      return checker.getPropertyOfType(receiver, access.name.text) !== undefined ||
        checker.getIndexInfosOfType(receiver).length > 0
        ? { kind: 'accept' }
        : notYet('a property the dynamic shape does not declare is not yet supported', 5);
    }
    // `m.index` and its siblings. A match array is not an HIR array — its HIR type is Unknown —
    // so it reaches here rather than the array arms above, and the four names below are the whole
    // of what it exposes. Anything else on it (`m.map`, `m.slice`) waits for the match array to
    // have an HIR type of its own, which is Phase 5's union work.
    if (isMatchReceiver(access.expression, checker)) {
      return Object.hasOwn(MATCH_FIELDS, access.name.text)
        ? { kind: 'accept' }
        : notYet(`${access.name.text} on a RegExp match is not yet supported`, 5);
    }
    return notYet('property access is not yet supported', 5);
  }
  // A class name reaching here with no static of that name is a member the subset cannot resolve
  // -- `C.prototype`, `C.name` and the rest of the class object, which does not exist here.
  if (
    ts.isIdentifier(access.expression) &&
    checker.getSymbolAtLocation(access.expression)?.valueDeclaration === declaration
  ) {
    return notYet('using a class as a value is not yet supported', 5);
  }
  // `o.x` on an accessor is a CALL, so a read is fine and a read-modify-write is not: `o.x += 1`
  // is a get and a set of one property, and the machinery that evaluates a receiver exactly once
  // across the pair hoists a SLOT, which an accessor is not.
  if (accessorDeclaringClass(declaration, access.name.text, checker) !== undefined) {
    return isReadModifyWrite(access)
      ? notYet('a compound assignment to an accessor is not yet supported', 5)
      : { kind: 'accept' };
  }
  // A method used as a VALUE (`const f = o.m`) would have to build a bound closure, which is a
  // per-instance allocation this rung does not make. As the callee of a call it is fine, and that
  // is the shape gateCall sees. The search runs up the chain: an inherited method is a method.
  const isMethod = methodDeclaringClass(declaration, access.name.text, checker) !== undefined;
  if (isMethod && !(ts.isCallExpression(access.parent) && access.parent.expression === access)) {
    return notYet('using a method as a value is not yet supported', 5);
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
  if (
    !checker.isArrayType(checker.getTypeAtLocation(access.expression)) &&
    !isMatchReceiver(access.expression, checker)
  ) {
    // A match array indexes like any array at run time -- it IS a dense jsrt array, carrying a
    // property table beside its elements -- so `m[0]` is admitted even though its HIR type is the
    // Unknown a match-or-null has to be. The verifier already accepts an Unknown index target.
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
    // `for await` drives the ASYNC iterator protocol, which is the generator machinery under
    // another name -- not the await that landed with async functions.
    return generatorNotYet();
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

/** The whole Math surface (§21.3.2), complete as of plan-notes 119. The approximated
 * transcendentals used to be absent because the host libm disagrees with Node in the last ulp;
 * they now come from the vendored fdlibm — the same code V8 runs — so the agreement is structural.
 * `random` is here too, under plan.md §7 Task 4.2's determinism carve-out: it is proved by
 * range/distribution assertions rather than by a golden test, because no golden test can pin it. */
export const MATH_METHODS: ReadonlySet<string> = new Set([
  'abs',
  'acos',
  'acosh',
  'asin',
  'asinh',
  'atan',
  'atan2',
  'atanh',
  'cbrt',
  'ceil',
  'clz32',
  'cos',
  'cosh',
  'exp',
  'expm1',
  'floor',
  'fround',
  'hypot',
  'imul',
  'log',
  'log10',
  'log1p',
  'log2',
  'max',
  'min',
  'pow',
  'random',
  'round',
  'sign',
  'sin',
  'sinh',
  'sqrt',
  'tan',
  'tanh',
  'trunc',
]);

/** Folded to number literals by the lowering — the compiler runs on the pinned Node, so these are
 * bit-for-bit the doubles the golden tests diff against. */
export const MATH_CONSTANTS: ReadonlySet<string> = new Set([
  'E',
  'LN10',
  'LN2',
  'LOG10E',
  'LOG2E',
  'PI',
  'SQRT1_2',
  'SQRT2',
]);

/** `Math` the GLOBAL, not a user binding that borrowed the name: every declaration behind the
 * symbol is ambient. A local `const Math = …` shadows the global at runtime and must win here
 * too, which is what the declaration-file test buys over matching the text alone. */
export function isGlobalMath(node: ts.Expression, checker: ts.TypeChecker): boolean {
  return isGlobalNamed(node, checker, 'Math');
}

/** The `Object` namespace, by the same test. */
export function isGlobalObject(node: ts.Expression, checker: ts.TypeChecker): boolean {
  return isGlobalNamed(node, checker, 'Object');
}

/** The `Date` CONSTRUCTOR read as a namespace -- `Date.UTC`, `Date.parse`, `Date.now`. The same
 * declaration-file test, which is what keeps a user `class Date` on the ordinary class path. */
export function isGlobalDate(node: ts.Expression, checker: ts.TypeChecker): boolean {
  return isGlobalNamed(node, checker, 'Date');
}

/** The checker says the receiver is a Date -- decided through the HType mapping, so the gate and
 * the lowering agree on what a date receiver is, exactly as they do for a regexp. */
export function isDateReceiver(expression: ts.Expression, checker: ts.TypeChecker): boolean {
  return tsTypeToHType(checker.getTypeAtLocation(expression), checker).kind === 'date';
}

function isGlobalNamed(node: ts.Expression, checker: ts.TypeChecker, name: string): boolean {
  if (!ts.isIdentifier(node) || node.text !== name) {
    return false;
  }
  const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
  return declarations.length > 0 && declarations.every((d) => d.getSourceFile().isDeclarationFile);
}

/** The Object namespace calls that lower, and what each takes.
 *
 * `arity` is exact — none of these is variadic in the landed form. `receiver` says what the FIRST
 * argument must be: `shaped` is an object whose keys a walk can enumerate (a fixed shape, whose
 * class descriptor lists its fields, or a dynamic shape, whose chain does), `pairs` is an array,
 * which is the only `fromEntries` input the runtime iterates, and `dynamic` is the strictest --
 * a shape that looks keys up through its shape table, which is the only kind `assign` may WRITE
 * to, because a fixed shape's reads are slot indices decided at build time. `second` says the same
 * about the second argument, `none` meaning there is not one.
 *
 * Everything else on `Object` stays deferred, and each for a reason rather than a backlog:
 * `freeze`/`isFrozen` cannot be honest until the RUNTIME can throw -- a write to a frozen object
 * is a TypeError in strict mode, which every module here is, and `jsrt_throw` is reachable only
 * from generated code holding a landing pad (plan-notes 125); `create`, `defineProperty`,
 * `getPrototypeOf` and `setPrototypeOf` are prototype machinery, which ts mode bans by design and
 * js mode leaves to the object model. */
/** Whether an argument matches an `OBJECT_STATICS` receiver kind. `dynamic` is not a subset of
 * `shaped` by accident: a fixed shape enumerates fine but cannot be WRITTEN to, which is the whole
 * difference between reading a shape and growing one. */
function acceptsObjectArgument(
  want: 'dynamic' | 'pairs' | 'shaped',
  argument: ts.Expression,
  checker: ts.TypeChecker,
): boolean {
  const type = checker.getTypeAtLocation(argument);
  if (want === 'pairs') {
    return tsTypeToHType(type, checker).kind === 'array';
  }
  if (want === 'dynamic') {
    return isDynamicShape(type, checker);
  }
  return tsTypeToHType(type, checker).kind === 'object' || isDynamicShape(type, checker);
}

export const OBJECT_STATICS = {
  assign: { arity: 2, receiver: 'dynamic', second: 'shaped' },
  entries: { arity: 1, receiver: 'shaped', second: 'none' },
  fromEntries: { arity: 1, receiver: 'pairs', second: 'none' },
  getOwnPropertyNames: { arity: 1, receiver: 'shaped', second: 'none' },
  hasOwn: { arity: 2, receiver: 'shaped', second: 'key' },
  keys: { arity: 1, receiver: 'shaped', second: 'none' },
  values: { arity: 1, receiver: 'shaped', second: 'none' },
} as const satisfies Record<
  string,
  {
    readonly arity: number;
    readonly receiver: 'dynamic' | 'pairs' | 'shaped';
    readonly second: 'key' | 'none' | 'shaped';
  }
>;

/** Which phase owns each `Object` static that has NOT landed. One hardcoded number cannot be right
 * for this namespace: the six unlanded members wait on two different mechanisms in two different
 * phases (plan §7 Task 4.7 step 5, plan-notes 125 and 136).
 *
 * `freeze`/`isFrozen` wait on a RUNTIME-RAISED exception -- a write to a frozen object is a
 * TypeError in strict mode, and `jsrt_throw` sets a pending cell only generated code reads, which
 * is Phase 5 step 11's mechanism. The prototype/descriptor four are STA1204's surface, in Phase 8.
 * A name in neither list is one `lib.es5.d.ts` declares and nothing here models yet, and member
 * growth lands with the language surface, so Phase 5 is the honest default. */
const OBJECT_STATIC_OWNER: Readonly<Record<string, number>> = {
  create: 8,
  defineProperties: 8,
  defineProperty: 8,
  freeze: 5,
  getOwnPropertyDescriptor: 8,
  getOwnPropertyDescriptors: 8,
  getPrototypeOf: 8,
  isFrozen: 5,
  seal: 5,
  isSealed: 5,
  setPrototypeOf: 8,
};

/** The `Promise` namespace calls that lower. Each takes exactly one argument -- the combinators
 * that take two or more are the ones that need `.then`, and the executor form needs a callback
 * whose throw has to become a rejection, which only generated code can do (see PromiseStaticCall
 * in src/hir/nodes.ts). `all` additionally requires an ARRAY: the runtime walks one, and any other
 * iterable is the Symbol.iterator protocol. */
export const PROMISE_STATICS = {
  all: { array: true },
  reject: { array: false },
  resolve: { array: false },
} as const satisfies Record<string, { readonly array: boolean }>;

/** An array literal written straight into `Promise.all([...])` types as a TUPLE, not an array --
 * the contextual parameter is an iterable, and the checker keeps the more precise answer. Both
 * are one contiguous run of elements at run time, which is the only property this asks about. */
function isArrayOrTuple(type: ts.Type, checker: ts.TypeChecker): boolean {
  return checker.isArrayType(type) || checker.isTupleType(type);
}

/** `Promise` the GLOBAL, by the same declaration-file test `Math` and `Object` use. */
export function isGlobalPromise(node: ts.Expression, checker: ts.TypeChecker): boolean {
  return isGlobalNamed(node, checker, 'Promise');
}

/** The `ARRAY_OPS` entries whose FIRST argument is a callback: the gate holds that argument to a
 * function type, refuses the thisArg form of the single-callback methods, and requires
 * `reduce`/`reduceRight`'s explicit initial value. */
export const CALLBACK_ARRAY_OPS = {
  every: true,
  sort: true,
  reduce: true,
  reduceRight: true,
  filter: true,
  flatMap: true,
  find: true,
  findIndex: true,
  findLast: true,
  findLastIndex: true,
  toSorted: true,
  forEach: true,
  map: true,
  some: true,
} as const;

/** The `JSON` namespace, by the same test. */
export function isGlobalJson(node: ts.Expression, checker: ts.TypeChecker): boolean {
  return isGlobalNamed(node, checker, 'JSON');
}

/** True when `type` (or any union arm of it) admits `undefined` or a function — the values
 * JSON.stringify answers `undefined` FOR at the top level, where the call's type promises a
 * string. Checked at the gate so the runtime's loud abort is a compiler bug, not a user path. */
function admitsUnserializable(type: ts.Type, checker: ts.TypeChecker): boolean {
  const arms = type.isUnion() ? type.types : [type];
  return arms.some(
    (arm) =>
      (arm.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0 ||
      checker.getSignaturesOfType(arm, ts.SignatureKind.Call).length > 0,
  );
}

/** A console call the HIR can spell. The method table lives with the node it configures
 * (`CONSOLE_METHODS` in `src/hir/nodes.ts`); what stays deferred is deferred for a reason rather
 * than a backlog: `time`/`timeEnd` print an ELAPSED DURATION and `trace` a stack, neither of
 * which a golden test can hold to Node byte-for-byte, and `table` is a column-layout algorithm
 * of its own. */
function isConsoleLog(access: ts.PropertyAccessExpression): boolean {
  return (
    ts.isIdentifier(access.expression) &&
    access.expression.text === 'console' &&
    Object.hasOwn(CONSOLE_METHODS, access.name.text)
  );
}

/* Capture analysis — which variables a nested function reads from an enclosing one (rung 4b).
 *
 * Runs on the TypeScript AST rather than on HIR, because the question is about DECLARATION SITES
 * and the checker already answers that exactly: two variables named `x` in sibling scopes are
 * different symbols, and no amount of name matching on lowered HIR would tell them apart.
 *
 * The output is the two facts the emitter needs, per function:
 *   - `envVars`  — this function's own bindings that something nested reads, so they must live in
 *                  a heap environment instead of its frame (docs/VALUE.md §4.3).
 *   - `captures` — the names this function reads from an enclosing environment, each resolved to
 *                  (levels-up, index): the chain walk is over ENV-BEARING scopes only, so a
 *                  function that captures nothing adds no level to it.
 *
 * `needsEnv` is transitive on purpose. A function that captures nothing itself still has to carry
 * the incoming environment when something nested reads through it — otherwise the chain has a hole
 * exactly where the intermediate function sits. */

import * as ts from 'typescript';

/** Every node that opens a new `var`/parameter scope in this subset. A method and a constructor
 * are on the list because they ARE functions -- the lowering gives each an explicit receiver
 * parameter and emits it like any other function, so a local declared in a method and read by an
 * arrow inside it is an ordinary capture, owned by the method. */
export type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration;

/** One free variable, resolved against the environment chain the referencing function receives.
 * `levels` counts from that incoming environment: 0 is the nearest enclosing env-bearing scope. */
export interface EnvCapture {
  readonly name: string;
  readonly levels: number;
  readonly index: number;
}

export interface CaptureInfo {
  /** Own bindings held in this function's environment; the array position IS the slot index. */
  readonly envVars: readonly string[];
  readonly captures: readonly EnvCapture[];
  /** This function, or something nested inside it, reads an enclosing environment. */
  readonly needsEnv: boolean;
}

export type CaptureMap = ReadonlyMap<FunctionLike, CaptureInfo>;

export function isFunctionLike(node: ts.Node): node is FunctionLike {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

/** The nearest function-like ancestor, or undefined when the node lives at module level. */
export function enclosingFunction(node: ts.Node): FunctionLike | undefined {
  for (let current: ts.Node | undefined = node.parent; current !== undefined; ) {
    if (isFunctionLike(current)) {
      return current;
    }
    if (ts.isSourceFile(current)) {
      return undefined;
    }
    current = current.parent;
  }
  return undefined;
}

/** A declaration whose storage a capture can move into an environment. Anything else — a class, an
 * import, a property — is either not a binding or not yet in the subset, and is left alone. */
function isCapturableDeclaration(decl: ts.Declaration): boolean {
  return ts.isVariableDeclaration(decl) || ts.isParameter(decl) || ts.isFunctionDeclaration(decl);
}

/** The binding name a capturable declaration introduces, or undefined when it is destructured
 * (which the gate rejects before this runs). */
function declarationName(decl: ts.Declaration): string | undefined {
  if (ts.isFunctionDeclaration(decl)) {
    return decl.name?.text;
  }
  if (ts.isVariableDeclaration(decl) || ts.isParameter(decl)) {
    return ts.isIdentifier(decl.name) ? decl.name.text : undefined;
  }
  return undefined;
}

/** The identifier a declaration is NAMED by is not a reference to it. This matters for a nested
 * `function f`: its name sits inside `f`'s own subtree, so read as a reference it looks like `f`
 * capturing itself from the scope around it -- which would put every nested function declaration
 * in its parent's environment and cost it the static-closure path for nothing. */
function isDeclarationNameOf(node: ts.Identifier, decl: ts.Declaration): boolean {
  return ts.getNameOfDeclaration(decl) === node;
}

export function analyzeCaptures(sourceFile: ts.SourceFile, checker: ts.TypeChecker): CaptureMap {
  /* Pass 1: find every cross-function reference. A declaration is captured when some reference to
   * it sits in a different function than the one that declares it -- however it is spelled, and
   * regardless of how many scopes separate them. */
  const capturedByOwner = new Map<FunctionLike, Set<string>>();
  const references: { ref: ts.Identifier; declFn: FunctionLike; name: string }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const decl = checker.getSymbolAtLocation(node)?.valueDeclaration;
      if (decl !== undefined && isCapturableDeclaration(decl) && !isDeclarationNameOf(node, decl)) {
        const declFn = enclosingFunction(decl);
        const name = declarationName(decl);
        // `declFn === undefined` is a module-level binding: it lives in the globals array, which
        // every function can already reach, so it is never a capture.
        if (declFn !== undefined && name !== undefined && enclosingFunction(node) !== declFn) {
          let owned = capturedByOwner.get(declFn);
          if (owned === undefined) {
            owned = new Set();
            capturedByOwner.set(declFn, owned);
          }
          owned.add(name);
          references.push({ ref: node, declFn, name });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  /* Pass 2: fix each environment's slot order. Sorted, so the layout depends only on the source
   * and not on the order the walk happened to encounter references in. */
  const envVarsOf = new Map<FunctionLike, string[]>();
  for (const [fn, names] of capturedByOwner) {
    envVarsOf.set(fn, [...names].sort());
  }
  const hasEnv = (fn: FunctionLike): boolean => (envVarsOf.get(fn)?.length ?? 0) > 0;

  /* Pass 3: resolve every reference to (levels, index) against the chain its function receives,
   * and collect them per referencing function. */
  const capturesOf = new Map<FunctionLike, Map<string, EnvCapture>>();
  for (const { ref, declFn, name } of references) {
    const refFn = enclosingFunction(ref);
    if (refFn === undefined) {
      // A module-level reference to a function-local cannot occur in well-formed source; the
      // checker would not have resolved it. Nothing to record.
      continue;
    }
    const index = envVarsOf.get(declFn)?.indexOf(name) ?? -1;
    if (index < 0) {
      continue;
    }
    let levels = 0;
    for (let a = enclosingFunction(refFn); a !== undefined; a = enclosingFunction(a)) {
      if (a === declFn) {
        break;
      }
      if (hasEnv(a)) {
        levels++;
      }
    }
    let own = capturesOf.get(refFn);
    if (own === undefined) {
      own = new Map();
      capturesOf.set(refFn, own);
    }
    own.set(name, { name, levels, index });
  }

  /* Pass 4: propagate `needsEnv` outward. An intermediate function that captures nothing still
   * carries the environment when something nested reads through it. */
  const needsEnv = new Set<FunctionLike>();
  for (const { ref, declFn } of references) {
    const refFn = enclosingFunction(ref);
    if (refFn === undefined) {
      continue;
    }
    // Stop AT the declaring function: it reaches the variable through its own environment, so it
    // needs no incoming one on this account. Everything strictly inside it is on the chain.
    for (
      let f: FunctionLike | undefined = refFn;
      f !== undefined && f !== declFn;
      f = enclosingFunction(f)
    ) {
      needsEnv.add(f);
    }
  }

  const result = new Map<FunctionLike, CaptureInfo>();
  const record = (fn: FunctionLike): void => {
    result.set(fn, {
      envVars: envVarsOf.get(fn) ?? [],
      captures: [...(capturesOf.get(fn)?.values() ?? [])],
      needsEnv: needsEnv.has(fn),
    });
  };
  const collect = (node: ts.Node): void => {
    if (isFunctionLike(node)) {
      record(node);
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  return result;
}

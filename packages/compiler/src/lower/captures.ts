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

/** Every node that opens a new `var`/parameter scope in this subset. A method, a constructor and
 * an accessor are on the list because they ARE functions -- the lowering gives each an explicit
 * receiver parameter and emits it like any other function, so a local declared in one and read by
 * an arrow inside it is an ordinary capture, owned by that member. */
export type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration;

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

/** What can own a heap environment. Almost always a function — but the MODULE owns one too, for
 * the one kind of module-level binding the globals array cannot hold: see `isPerIterationBinding`.
 * The source file sits at the outer end of every environment chain, so a capture resolved against
 * it needs no special case in the `levels` walk — it is simply the last scope reached. */
export type EnvOwner = FunctionLike | ts.SourceFile;

export type CaptureMap = ReadonlyMap<EnvOwner, CaptureInfo>;

export function isFunctionLike(node: ts.Node): node is FunctionLike {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
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

/** Whether a MODULE-level declaration gets a fresh binding on every iteration of a loop, and so
 * cannot live in the globals array.
 *
 * The globals array gives a name one slot for the life of the program, which is exactly right for
 * a module-level binding — every function can reach it and there is only ever one of it. A
 * `let`/`const` declared inside a loop breaks that assumption: JavaScript gives each iteration its
 * own binding, so three closures made in three iterations must see three values. One global slot
 * holds the last one, and every closure reads it (`0 10 20` printed as `20 20 20`). Those bindings
 * therefore move into a module environment, where the loop's existing per-iteration clone/commit
 * (docs/VALUE.md §4.3) gives each iteration its own copy — the same machinery, and the same
 * layout rules, a function scope has always used.
 *
 * `var` is excluded because it is function-scoped even when spelled inside a loop: one binding
 * shared by every iteration IS its semantics, and the globals array already implements that. */
function isPerIterationBinding(decl: ts.Declaration): boolean {
  if (!ts.isVariableDeclaration(decl) || !ts.isVariableDeclarationList(decl.parent)) {
    return false;
  }
  const blockScoped = (decl.parent.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0;
  return blockScoped && loopScopeOf(decl) !== undefined;
}

/** The loop that gives `decl` a fresh binding each iteration, searched no further out than the
 * function owning the declaration — a loop outside that function re-runs the call, not the
 * binding. Mirrors `loopScopeOf` in the gate, which asks the same question of the same nodes. */
function loopScopeOf(decl: ts.Node): ts.Node | undefined {
  for (let n = decl.parent as ts.Node | undefined; n !== undefined; n = n.parent) {
    if (isFunctionLike(n)) {
      return undefined;
    }
    if (ts.isIterationStatement(n, false)) {
      return n;
    }
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
  const capturedByOwner = new Map<EnvOwner, Set<string>>();
  const references: { ref: ts.Identifier; declFn: EnvOwner; name: string }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const decl = checker.getSymbolAtLocation(node)?.valueDeclaration;
      if (decl !== undefined && isCapturableDeclaration(decl) && !isDeclarationNameOf(node, decl)) {
        const enclosing = enclosingFunction(decl);
        const name = declarationName(decl);
        // A module-level binding normally lives in the globals array, which every function can
        // already reach, so it is never a capture. The exception is the per-iteration one: it
        // needs an environment for the same reason a function-local capture does, and the module
        // is what owns it (`isPerIterationBinding`).
        const declFn: EnvOwner | undefined =
          enclosing ?? (isPerIterationBinding(decl) ? sourceFile : undefined);
        if (declFn !== undefined && name !== undefined && enclosingFunction(node) !== enclosing) {
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
  const envVarsOf = new Map<EnvOwner, string[]>();
  for (const [fn, names] of capturedByOwner) {
    envVarsOf.set(fn, [...names].sort());
  }
  const hasEnv = (fn: FunctionLike): boolean => (envVarsOf.get(fn)?.length ?? 0) > 0;

  /* Pass 3: resolve every reference to (levels, index) against the chain its function receives,
   * and collect them per referencing function. */
  const capturesOf = new Map<EnvOwner, Map<string, EnvCapture>>();
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
  const needsEnv = new Set<EnvOwner>();
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

  const result = new Map<EnvOwner, CaptureInfo>();
  const record = (fn: EnvOwner): void => {
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
  // The module is recorded too, and unconditionally: its entry is what the emitter reads to size
  // the module environment, and "no per-iteration binding was captured" has to be answerable as an
  // empty list rather than as a missing key.
  record(sourceFile);
  collect(sourceFile);
  return result;
}

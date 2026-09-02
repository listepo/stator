/* Dead-code elimination and tree-shaking (plan.md §5 Task 3.7) — remove what cannot run, and what
 * nothing can reach.
 *
 * Three eliminations, and what unites them is that each rests on a fact about CONTROL FLOW, never
 * on a fact about values. Nothing here reasons about whether a variable is used, whether a call is
 * pure, or whether two expressions are equal: those are value questions, and getting one wrong
 * deletes an observable effect. The questions asked here — "what follows a `return`", "which branch
 * does a literal `true` take", "what can reach this function" — have answers the tree already
 * contains.
 *
 * Const-fold runs first, and that ordering is the whole reason branch elimination pays: `if (1 < 2)`
 * is not a literal condition until folding makes it one.
 *
 * The pass preserves `Unknown` trivially, since it introduces no expressions at all — every
 * expression it keeps is one the lowering built.
 */

import type {
  Expression,
  FunctionDeclaration,
  Module,
  Parameter,
  Statement,
} from '../hir/nodes.ts';
import { rewriteExpression, rewriteModule, rewriteStatements } from './rewrite.ts';

export function eliminateDeadCode(module: Module): Module {
  return shakeFunctions(rewriteModule(module, { statement: prune, statements: dropUnreachable }));
}

/** True when control cannot fall out of this statement into the next one.
 *
 * Only the three direct jumps count. An `if` whose branches both `return` also terminates, and is
 * deliberately not recognised: it is the first step onto a lattice — then `switch` with a
 * `default`, then a loop with no `break` — and each step buys a rarer program while widening what
 * a bug here could delete. The unreachable code that actually occurs in a source file sits
 * immediately after a jump, which is the case below. */
function terminates(stmt: Statement): boolean {
  return (
    stmt.kind === 'return-statement' ||
    stmt.kind === 'break-statement' ||
    stmt.kind === 'continue-statement'
  );
}

/** Drop the statements a jump makes unreachable — except function declarations, which are HOISTED
 * and so are live from the moment the scope is entered, however far below the `return` they are
 * written. `function f(){} ` after a `return` still holds its binding for the code above it.
 * Nothing else in this subset is hoisted: `let`, `const` and `class` all have a temporal dead zone
 * that starts where they are written, so an unreachable one binds nothing. */
function dropUnreachable(statements: readonly Statement[]): readonly Statement[] {
  const cut = statements.findIndex(terminates);
  if (cut === -1 || cut === statements.length - 1) {
    return statements;
  }
  const kept = [
    ...statements.slice(0, cut + 1),
    ...statements.slice(cut + 1).filter((s) => s.kind === 'function-declaration'),
  ];
  return kept.length === statements.length ? statements : kept;
}

/** The value a literal condition tests to, or `undefined` when the condition is not a literal.
 *
 * Only literal NODES qualify, for the reason const-fold gives: a literal cannot have had a side
 * effect that removing it would lose. `if (f())` is not decidable here even if `f` always returns
 * true, because deleting the branch would delete the call. */
function literalTruth(condition: Expression): boolean | undefined {
  switch (condition.kind) {
    case 'number-literal':
    case 'string-literal':
    case 'boolean-literal':
      return Boolean(condition.value);
    case 'null-literal':
    case 'undefined-literal':
      return false;
    default:
      return undefined;
  }
}

function prune(stmt: Statement): readonly Statement[] {
  switch (stmt.kind) {
    // The untaken branch goes; the taken one stays as a BLOCK rather than being spliced into the
    // parent list. That is not tidiness — a branch is its own scope, and splicing would promote its
    // `let` bindings into the enclosing one, where a later declaration of the same name becomes a
    // redeclaration the verifier is right to reject.
    case 'if-statement': {
      const truth = literalTruth(stmt.condition);
      if (truth === undefined) {
        return [stmt];
      }
      const taken = truth ? stmt.consequent : stmt.alternate;
      return taken === undefined ? [] : [taken];
    }

    // `while (false)` never runs its body. `while (true)` is left alone: rewriting it to its body
    // would be wrong (the body repeats), and stripping the test buys nothing the C compiler will
    // not do itself.
    case 'while-statement':
      return literalTruth(stmt.condition) === false ? [] : [stmt];

    // A `do/while` runs its body once before the first test, so a false test removes the LOOP but
    // not the body -- and the body keeps its own scope, exactly as in the `if` case above.
    case 'do-while-statement':
      return literalTruth(stmt.condition) === false ? [stmt.body] : [stmt];

    default:
      return [stmt];
  }
}

/** Every name read as an identifier anywhere below these statements.
 *
 * The rewriter is used as a visitor: each expression is returned unchanged, so the walk is the one
 * in rewrite.ts rather than a second traversal that could fall behind it when a node kind is added.
 *
 * It over-approximates on purpose. A local `const f = 1` inside some function contributes the name
 * `f` and so keeps a module-level `f` alive that nothing calls — the pass has no scope information
 * and is not going to guess at one. Over-approximating keeps dead code; under-approximating deletes
 * live code, and only one of those is a compiler bug. */
function referencedNames(statements: readonly Statement[]): ReadonlySet<string> {
  const names = new Set<string>();
  rewriteStatements(statements, {
    expression: (expr) => {
      if (expr.kind === 'identifier') {
        names.add(expr.name);
      }
      return expr;
    },
  });
  return names;
}

function referencedInDefaults(params: readonly Parameter[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const param of params) {
    if (param.default === undefined) {
      continue;
    }
    rewriteExpression(param.default, {
      expression: (expr) => {
        if (expr.kind === 'identifier') {
          names.add(expr.name);
        }
        return expr;
      },
    });
  }
  return names;
}

/** Drop module-level functions nothing can reach.
 *
 * Reachability starts from the statements that are not function declarations — the code that
 * actually runs — and closes over calls transitively, so a chain of functions that only ever call
 * each other dies as a group. That transitivity is why this is a fixpoint and not one filter pass:
 * `f` calling `g` keeps `g` alive only while something keeps `f` alive.
 *
 * Only module level, and only functions. A nested function is part of its parent's body and dies
 * with it; a class is left alone because `new C()` names its class by string rather than by an
 * identifier the walk above would see, and a shake that cannot see a reference is a shake that
 * deletes live code. */
function shakeFunctions(module: Module): Module {
  const declared = new Map<string, FunctionDeclaration>();
  for (const stmt of module.statements) {
    if (stmt.kind === 'function-declaration') {
      declared.set(stmt.name, stmt);
    }
  }
  if (declared.size === 0) {
    return module;
  }

  const live = new Set<string>();
  const pending = [
    ...referencedNames(module.statements.filter((s) => s.kind !== 'function-declaration')),
  ];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    const declaration = declared.get(name);
    if (declaration === undefined || live.has(name)) {
      continue;
    }
    live.add(name);
    // The body is a Block, which is itself a Statement -- so the same walk serves both levels.
    pending.push(...referencedNames([declaration.fn.body]));
    pending.push(...referencedInDefaults(declaration.fn.params));
  }

  const statements = module.statements.filter(
    (s) => s.kind !== 'function-declaration' || live.has(s.name),
  );
  return statements.length === module.statements.length ? module : { ...module, statements };
}

/** `stator explain` — the verdict for one file: what will the compiler DO with this program?
 *
 * This is the interface the decision tests in `tests/subset/` assert against (plan.md §5 Task 2.6),
 * which is why it reports a verdict and a code rather than prose: a test that matched on message
 * text would break every time the wording improved.
 *
 * Four verdicts, and their precedence when a file earns more than one:
 *   error    a `never` diagnostic — rejected by design, and no phase will change that
 *   not-yet  a `STA12xx` diagnostic — outside today's subset, but scheduled
 *   dynamic  compiles, but some value is Unknown and goes through the dynamic representation
 *   static   compiles fully typed, which is where the speed comes from
 * `error` outranks `not-yet` because a permanent rejection is a fact about the program, while a
 * not-yet is a fact about the compiler's current progress.
 */

import { existsSync } from 'node:fs';
import { gateProgram } from '../frontend/gate.ts';
import { createProgram } from '../frontend/program.ts';
import type { Expression, Module, Statement } from '../hir/nodes.ts';
import { hTypeHasUnknown } from '../hir/types.ts';
import { lowerSourceFile } from '../lower/index.ts';
import type { Diagnostic } from '../support/diagnostics.ts';
import { renderDiagnostic } from '../support/diagnostics.ts';
import { BuildError } from './build.ts';

type Mode = 'ts' | 'js';

export type Verdict = 'static' | 'dynamic' | 'error' | 'not-yet';

export interface Explanation {
  readonly verdict: Verdict;
  readonly code?: string;
}

/** Returns the process exit code. A rejected program is still a SUCCESSFUL explain: the user asked
 * what would happen and got a true answer, so exit 0 unless explain itself could not run. */
export function explain(entry: string, mode: Mode, json: boolean): number {
  const result = explainFile(entry, mode);

  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(
      result.code === undefined
        ? `${entry}: ${result.verdict}\n`
        : `${entry}: ${result.verdict} (${result.code})\n`,
    );
  }
  return 0;
}

export function explainFile(entry: string, mode: Mode): Explanation {
  if (!existsSync(entry)) {
    throw new BuildError('STA0007', `entry file "${entry}" does not exist`);
  }

  const { program, diagnostics: programDiagnostics } = createProgram(entry, mode);
  const verdictFromDiagnostics = classify([...programDiagnostics, ...gateProgram(program, mode)]);
  if (verdictFromDiagnostics !== null) {
    return verdictFromDiagnostics;
  }

  const entryFile = program.getSourceFile(entry);
  if (entryFile === undefined) {
    throw new BuildError('STA0007', `entry file "${entry}" does not exist`);
  }

  const { module, diagnostics } = lowerSourceFile(entryFile, program.getTypeChecker());
  const verdictFromLowering = classify(diagnostics);
  if (verdictFromLowering !== null) {
    return verdictFromLowering;
  }
  if (module === null) {
    // Lowering gave up without saying why. That is a bug, and reporting `static` here would be a
    // false claim about a program that does not compile.
    for (const d of diagnostics) {
      process.stderr.write(`${renderDiagnostic(d)}\n`);
    }
    return { verdict: 'error', code: 'STA4021' };
  }

  return { verdict: hasUnknown(module) ? 'dynamic' : 'static' };
}

/** null means "nothing here decides the verdict" — carry on to the typed answer. */
function classify(diagnostics: readonly Diagnostic[]): Explanation | null {
  const never = diagnostics.find((d) => d.class === 'never');
  if (never !== undefined) {
    return { verdict: 'error', code: never.code };
  }
  const notYet = diagnostics.find((d) => d.class === 'not-yet');
  if (notYet !== undefined) {
    return { verdict: 'not-yet', code: notYet.code };
  }
  const error = diagnostics.find((d) => d.class === 'error' || d.class === 'internal');
  if (error !== undefined) {
    return { verdict: 'error', code: error.code };
  }
  return null;
}

/** One Unknown anywhere makes the whole file dynamic. Phase 2's verdict is per-file; per-function
 * granularity arrives with functions themselves in Phase 3. */
function hasUnknown(module: Module): boolean {
  return module.statements.some(statementHasUnknown);
}

function statementHasUnknown(stmt: Statement): boolean {
  if (stmt.type.kind === 'unknown') {
    return true;
  }
  switch (stmt.kind) {
    case 'declaration':
    case 'assignment':
      return expressionHasUnknown(stmt.value);
    case 'expression-statement':
      return expressionHasUnknown(stmt.expression);
    case 'if-statement':
      return (
        expressionHasUnknown(stmt.condition) ||
        statementHasUnknown(stmt.consequent) ||
        (stmt.alternate !== undefined && statementHasUnknown(stmt.alternate))
      );
    case 'while-statement':
    case 'do-while-statement':
      return expressionHasUnknown(stmt.condition) || statementHasUnknown(stmt.body);
    case 'for-statement':
      return (
        (stmt.init !== undefined && statementHasUnknown(stmt.init)) ||
        (stmt.condition !== undefined && expressionHasUnknown(stmt.condition)) ||
        (stmt.update !== undefined && statementHasUnknown(stmt.update)) ||
        statementHasUnknown(stmt.body)
      );
    case 'switch-statement':
      return (
        expressionHasUnknown(stmt.discriminant) ||
        stmt.clauses.some(
          (c) =>
            (c.test !== undefined && expressionHasUnknown(c.test)) ||
            c.statements.some(statementHasUnknown),
        )
      );
    // A jump carries no value, so it can never be the reason a file is dynamic.
    case 'break-statement':
    case 'continue-statement':
      return false;
    case 'block':
      return stmt.statements.some(statementHasUnknown);
    // A function's body is part of the file, so an Unknown inside it makes the file dynamic even
    // when the signature is fully typed.
    case 'function-declaration':
      return expressionHasUnknown(stmt.fn);
    case 'return-statement':
      return stmt.value !== undefined && expressionHasUnknown(stmt.value);
    case 'index-assignment':
      return (
        expressionHasUnknown(stmt.target) ||
        expressionHasUnknown(stmt.index) ||
        expressionHasUnknown(stmt.value)
      );
    // The loop binding is not an Expression, so its type is not reached by recursion. It is the
    // ELEMENT type of the iterable -- TypeScript models iteration as yielding `T`, not
    // `T | undefined` -- and `expressionHasUnknown(iterable)` already covers it via the deep
    // check, so the iterable and the body are the whole question.
    case 'for-of-statement':
      return expressionHasUnknown(stmt.iterable) || statementHasUnknown(stmt.body);
    case 'field-assignment':
      return expressionHasUnknown(stmt.target) || expressionHasUnknown(stmt.value);
    // A field's type is not reached by recursion -- fields are Parameters, not Expressions -- so a
    // class holding an `any` field is dynamic at its DECLARATION, not only where it is read.
    case 'class-declaration':
      return (
        stmt.fields.some((f) => hTypeHasUnknown(f.type)) ||
        (stmt.ctor !== undefined && expressionHasUnknown(stmt.ctor.fn)) ||
        stmt.methods.some((m) => expressionHasUnknown(m.fn))
      );
    default: {
      const exhaustive: never = stmt;
      return exhaustive;
    }
  }
}

function expressionHasUnknown(expr: Expression): boolean {
  if (hTypeHasUnknown(expr.type)) {
    return true;
  }
  switch (expr.kind) {
    case 'number-literal':
    case 'string-literal':
    case 'boolean-literal':
    case 'null-literal':
    case 'undefined-literal':
    case 'identifier':
      return false;
    case 'binary-op':
    case 'logical-op':
      return expressionHasUnknown(expr.left) || expressionHasUnknown(expr.right);
    case 'unary-op':
    case 'string-length':
    case 'array-length':
      return expressionHasUnknown(expr.operand);
    // The literal's own type came from the checker, so a `number[]` stays static even though each
    // element is inspected here -- what this catches is an element whose *subexpression* is
    // dynamic, e.g. `[f()]` where `f` returns `any`.
    case 'array-literal':
      return expr.elements.some(expressionHasUnknown);
    // Unreachable in practice: under `noUncheckedIndexedAccess` an indexed read is `T | undefined`,
    // so the type check above already returned true (plan-notes 53). Written out anyway, because
    // Task 3.5's narrowing is what makes it reachable.
    case 'index-access':
      return expressionHasUnknown(expr.target) || expressionHasUnknown(expr.index);
    case 'template-literal':
      return expr.expressions.some(expressionHasUnknown);
    case 'console-log':
      return expr.args.some(expressionHasUnknown);
    // A parameter is not an Expression, so its type is checked here rather than by recursion.
    case 'function':
      return expr.params.some((p) => p.type.kind === 'unknown') || statementHasUnknown(expr.body);
    case 'call':
      return expressionHasUnknown(expr.callee) || expr.args.some(expressionHasUnknown);
    case 'new':
      return expr.args.some(expressionHasUnknown);
    // The object's own type stops the deep walk (hTypeHasUnknown does not recurse into a class,
    // since it can be cyclic), so the READ is where a dynamic field surfaces -- and the type check
    // at the top of this function has already answered it for this node.
    case 'field-access':
      return expressionHasUnknown(expr.target);
    case 'method-call':
      return expressionHasUnknown(expr.target) || expr.args.some(expressionHasUnknown);
    default: {
      const exhaustive: never = expr;
      return exhaustive;
    }
  }
}

/* The module graph (plan.md §5 Task 3.11): which files the program is, and in what order their
 * top-level code runs.
 *
 * Whole-program v0. The compiled artifact is ONE merged module: each file's statements, in
 * topological order (dependencies first), sharing one binding namespace. An import therefore
 * binds nothing -- `import { x } from './b.ts'` makes the importer's `x` resolve to b's own
 * top-level binding, BY NAME, which is why the gate refuses every module shape that renames
 * (`x as y`) and why this walk refuses two files declaring the same top-level name.
 *
 * Cycles are STA3001 with the cycle spelled out, never a silently-picked order (plan.md Task
 * 3.11): ESM gives a cyclic graph well-defined semantics only via live bindings and TDZ checks,
 * neither of which a merged namespace can express honestly.
 */

import * as ts from 'typescript';
import type { Diagnostic } from '../support/diagnostics.ts';
import { diagnosticFromNode } from '../support/diagnostics.ts';

type Mode = 'ts' | 'js';

export interface ModuleOrder {
  /** Every reachable source file, dependencies before dependents; the entry is last. */
  readonly order: readonly ts.SourceFile[];
  readonly diagnostics: readonly Diagnostic[];
}

export function moduleOrder(program: ts.Program, entry: ts.SourceFile, mode: Mode): ModuleOrder {
  const diagnostics: Diagnostic[] = [];
  const order: ts.SourceFile[] = [];
  const done = new Set<ts.SourceFile>();
  // Files on the CURRENT DFS path: an edge back into this set is a cycle, and the array is the
  // cycle's spelling.
  const path: ts.SourceFile[] = [];
  const onPath = new Set<ts.SourceFile>();

  const visit = (file: ts.SourceFile): void => {
    if (done.has(file)) {
      return;
    }
    onPath.add(file);
    path.push(file);
    for (const { target, at } of valueImports(program, file)) {
      if (onPath.has(target)) {
        const names = [...path.slice(path.indexOf(target)), target].map((f) => f.fileName);
        diagnostics.push(
          diagnosticFromNode(
            at,
            file,
            'STA3001',
            'error',
            mode,
            `import cycle detected: ${names.join(' → ')}`,
          ),
        );
        continue;
      }
      visit(target);
    }
    onPath.delete(file);
    path.pop();
    done.add(file);
    order.push(file);
  };
  visit(entry);

  checkCollisions(order, mode, diagnostics);
  return { order, diagnostics };
}

/** The files whose top-level code must run before this one's: every non-type-only import edge.
 * `import type` is erased and constrains nothing at runtime. A specifier that does not resolve is
 * not reported here -- TypeScript already errored on it during program construction, and this walk
 * only runs on a program that survived that. */
function valueImports(
  program: ts.Program,
  file: ts.SourceFile,
): { readonly target: ts.SourceFile; readonly at: ts.Node }[] {
  const edges: { target: ts.SourceFile; at: ts.Node }[] = [];
  for (const stmt of file.statements) {
    if (!ts.isImportDeclaration(stmt) || stmt.importClause?.isTypeOnly === true) {
      continue;
    }
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) {
      continue;
    }
    const resolved = ts.resolveModuleName(
      stmt.moduleSpecifier.text,
      file.fileName,
      program.getCompilerOptions(),
      ts.sys,
    ).resolvedModule;
    if (resolved === undefined) {
      continue;
    }
    const target = program.getSourceFile(resolved.resolvedFileName);
    if (target !== undefined && !target.isDeclarationFile) {
      edges.push({ target, at: stmt });
    }
  }
  return edges;
}

/** One namespace for the whole program means one owner per name. Two files declaring the same
 * top-level name -- exported or not; module scopes that TypeScript keeps apart -- collide in the
 * merge, so the collision is refused rather than silently letting the later file's initializer
 * overwrite the earlier one's binding. */
function checkCollisions(
  order: readonly ts.SourceFile[],
  mode: Mode,
  diagnostics: Diagnostic[],
): void {
  const owners = new Map<string, string>();
  for (const file of order) {
    for (const { name, at } of topLevelNames(file)) {
      const owner = owners.get(name);
      if (owner === undefined) {
        owners.set(name, file.fileName);
      } else if (owner !== file.fileName) {
        diagnostics.push(
          diagnosticFromNode(
            at,
            file,
            'STA1214',
            'not-yet',
            mode,
            `'${name}' is declared at the top level of both ${owner} and ${file.fileName}; ` +
              'modules share one namespace in whole-program v0 -- rename one; ' +
              'planned for Phase 4',
            4,
          ),
        );
      }
    }
  }
}

function topLevelNames(file: ts.SourceFile): { readonly name: string; readonly at: ts.Node }[] {
  const names: { name: string; at: ts.Node }[] = [];
  for (const stmt of file.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          names.push({ name: decl.name.text, at: decl.name });
        }
      }
    } else if (
      (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) &&
      stmt.name !== undefined
    ) {
      names.push({ name: stmt.name.text, at: stmt.name });
    }
  }
  return names;
}

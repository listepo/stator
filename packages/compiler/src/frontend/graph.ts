/* The module graph (plan.md §5 Task 3.11): which files the program is, and in what order their
 * top-level code runs.
 *
 * Whole-program. The compiled artifact is ONE module: each file's statements, in topological
 * order (dependencies first). Every module keeps its own top-level namespace (plan.md §11c
 * T11.5a): the lowering gives each file a scope of its own, and an import binds its local name to
 * the exporting file's binding, so two files may declare the same name and a file's unexported
 * names are invisible to the others.
 *
 * Cycles are STA3001 with the cycle spelled out, never a silently-picked order (plan.md Task
 * 3.11): ESM gives a cyclic graph well-defined semantics only via live bindings and TDZ checks,
 * and an order picked here would run some importer before the module it reads.
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
  return { order, diagnostics };
}

/** The files whose top-level code must run before this one's: every non-type-only import edge,
 * and every re-export (`export … from`), which links the target module exactly as an import does.
 * `import type` and `export type … from` are erased and constrain nothing at runtime. A specifier that does not resolve is
 * not reported here -- TypeScript already errored on it during program construction, and this walk
 * only runs on a program that survived that. */
function valueImports(
  program: ts.Program,
  file: ts.SourceFile,
): { readonly target: ts.SourceFile; readonly at: ts.Node }[] {
  const edges: { target: ts.SourceFile; at: ts.Node }[] = [];
  for (const stmt of file.statements) {
    if (ts.isImportDeclaration(stmt)) {
      if (stmt.importClause?.isTypeOnly === true) {
        continue;
      }
      if (!ts.isStringLiteral(stmt.moduleSpecifier)) {
        continue;
      }
      pushResolved(program, stmt.moduleSpecifier, stmt, edges);
      continue;
    }
    if (ts.isExportDeclaration(stmt)) {
      if (
        !stmt.isTypeOnly &&
        stmt.moduleSpecifier !== undefined &&
        ts.isStringLiteral(stmt.moduleSpecifier)
      ) {
        pushResolved(program, stmt.moduleSpecifier, stmt, edges);
      }
      continue;
    }
    collectImportCallEdges(program, stmt, edges);
  }
  return edges;
}

function collectImportCallEdges(
  program: ts.Program,
  node: ts.Node,
  edges: { target: ts.SourceFile; at: ts.Node }[],
): void {
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments[0] !== undefined &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    pushResolved(program, node.arguments[0], node, edges);
  }
  ts.forEachChild(node, (child) => {
    collectImportCallEdges(program, child, edges);
  });
}

/** The edge a specifier names, resolved by the checker rather than by a fresh `ts.sys` lookup: the
 * checker resolved it through the program's own host, which also serves files that exist nowhere
 * on disk (the vendor module, plan.md §11d T12.1 step 3). */
function pushResolved(
  program: ts.Program,
  specifier: ts.StringLiteral,
  at: ts.Node,
  edges: { target: ts.SourceFile; at: ts.Node }[],
): void {
  const target = program.getTypeChecker().getSymbolAtLocation(specifier)?.valueDeclaration;
  if (target !== undefined && ts.isSourceFile(target) && !target.isDeclarationFile) {
    edges.push({ target, at });
  }
}

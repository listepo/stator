/* What a module's exported name IS (plan.md §11c T11.5a): the binding behind an import, a
 * re-export or a namespace member, found by walking the checker's alias chain.
 *
 * Every module keeps its own top-level namespace, so a name crossing a module boundary cannot
 * be resolved by its spelling: `import { x as y }` names `x`, `export { a as b } from` renames
 * twice, and `export default <expression>` names no declaration at all. This module answers the
 * one question all of those share -- which module, and which of its own top-level spellings --
 * and leaves the binding itself (its HIR name and type) to the lowering, which owns the scopes.
 *
 * `ts.Type` never leaves this file; callers get source files and spellings. */

import * as ts from 'typescript';

/** The local name ES gives the binding `export default <expression>` creates (§16.2.3.7): an
 * anonymous default function or class binds it too. No identifier can spell it, so it never
 * collides with a source binding. */
export const DEFAULT_EXPORT_BINDING = '*default*';

/** An exported name's target: a top-level binding of `file` spelled `name` there, or a whole
 * module (`import * as ns`, `export * as ns from`), whose value is its namespace object. */
export type ExportTarget =
  | { readonly kind: 'binding'; readonly file: ts.SourceFile; readonly name: string }
  | { readonly kind: 'namespace'; readonly file: ts.SourceFile };

/** Whether `node` is the `export default function`/`export default class` form. */
export function isDefaultExportDeclaration(
  node: ts.FunctionDeclaration | ts.ClassDeclaration,
): boolean {
  const flags = ts.getCombinedModifierFlags(node);
  return (flags & ts.ModifierFlags.Export) !== 0 && (flags & ts.ModifierFlags.Default) !== 0;
}

/** The name a top-level function or class declaration binds: its own, or `*default*` for the
 * anonymous `export default function () {}` / `export default class {}`. */
export function declaredBindingName(
  node: ts.FunctionDeclaration | ts.ClassDeclaration,
): string | undefined {
  if (node.name !== undefined) {
    return node.name.text;
  }
  return isDefaultExportDeclaration(node) ? DEFAULT_EXPORT_BINDING : undefined;
}

/** Follow `symbol` (an import, an export specifier, a module export) to the binding it names.
 *
 * The walk is one alias at a time, never `getAliasedSymbol`'s jump to the end, because one hop
 * must stop early: `export default foo` is an alias to `foo` for the checker, but ES evaluates the
 * expression ONCE into the module's `*default*` binding -- a later `foo = 2` is not seen through
 * the default import. Answers `undefined` for anything with no runtime binding (a type, an
 * ambient declaration) and for a cycle. */
export function exportTarget(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
): ExportTarget | undefined {
  const seen = new Set<ts.Symbol>();
  let current = symbol;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const assignment = current.declarations?.find(ts.isExportAssignment);
    if (assignment !== undefined) {
      return assignment.isExportEquals
        ? undefined
        : { kind: 'binding', file: assignment.getSourceFile(), name: DEFAULT_EXPORT_BINDING };
    }
    if ((current.flags & ts.SymbolFlags.Alias) === 0) {
      return declarationTarget(current);
    }
    current = checker.getImmediateAliasedSymbol(current);
  }
  return undefined;
}

function declarationTarget(symbol: ts.Symbol): ExportTarget | undefined {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (declaration === undefined) {
    return undefined;
  }
  if (ts.isSourceFile(declaration)) {
    return { kind: 'namespace', file: declaration };
  }
  const file = declaration.getSourceFile();
  if (file.isDeclarationFile || (symbol.flags & ts.SymbolFlags.Value) === 0) {
    return undefined;
  }
  if (ts.isFunctionDeclaration(declaration) || ts.isClassDeclaration(declaration)) {
    const name = declaredBindingName(declaration);
    return name === undefined ? undefined : { kind: 'binding', file, name };
  }
  const name = ts.getNameOfDeclaration(declaration);
  return name !== undefined && ts.isIdentifier(name)
    ? { kind: 'binding', file, name: name.text }
    : undefined;
}

/** The module a namespace-typed expression stands for, when `type` is a module namespace:
 * `typeof import("./m.ts")`, the type of `import * as ns` and of an awaited `import()`. */
export function namespaceModule(type: ts.Type): ts.SourceFile | undefined {
  const symbol = type.getSymbol();
  if (
    symbol === undefined ||
    (symbol.flags & ts.SymbolFlags.Module) === 0 ||
    (symbol.flags & ts.SymbolFlags.Variable) !== 0
  ) {
    return undefined;
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  return declaration !== undefined && ts.isSourceFile(declaration) ? declaration : undefined;
}

/** The names `export *` makes ambiguous in `file`: exported by two of its star re-exports from
 * two DIFFERENT bindings, and not exported by `file` itself. ES drops such a name from the
 * namespace and makes importing it by name a SyntaxError (§16.2.1.6.3 ResolveExport, and
 * GetModuleNamespace's "ambiguous" exclusion); TypeScript reports TS2308 at the second
 * `export *` instead, which js mode drops so the ES answer can stand (plan-notes 302). */
export function ambiguousStarExports(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
  visiting: Set<ts.SourceFile> = new Set(),
): ReadonlySet<string> {
  const ambiguous = new Set<string>();
  const moduleSymbol = checker.getSymbolAtLocation(file);
  // A star cycle is STA3001 already; the guard only keeps this walk finite until it is reported.
  if (moduleSymbol === undefined || visiting.has(file)) {
    return ambiguous;
  }
  visiting.add(file);
  const own = moduleSymbol.exports;
  const seen = new Map<string, string>();
  for (const statement of file.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.exportClause !== undefined ||
      statement.isTypeOnly ||
      statement.moduleSpecifier === undefined
    ) {
      continue;
    }
    const target = checker.getSymbolAtLocation(statement.moduleSpecifier);
    if (target === undefined) {
      continue;
    }
    for (const exported of checker.getExportsOfModule(target)) {
      const name = exported.name;
      if (name === 'default' || own?.has(exported.escapedName) === true) {
        continue;
      }
      const resolved = exportTarget(exported, checker);
      const key =
        resolved === undefined
          ? name
          : resolved.kind === 'namespace'
            ? `${resolved.file.fileName}\0*`
            : `${resolved.file.fileName}\0${resolved.name}`;
      const previous = seen.get(name);
      if (previous === undefined) {
        seen.set(name, key);
      } else if (previous !== key) {
        ambiguous.add(name);
      }
    }
  }
  // A name one of the targets itself found ambiguous is no export of it, so it is not one here.
  for (const statement of file.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause === undefined &&
      statement.moduleSpecifier !== undefined
    ) {
      const target = checker.getSymbolAtLocation(statement.moduleSpecifier)?.valueDeclaration;
      if (target !== undefined && ts.isSourceFile(target)) {
        for (const name of ambiguousStarExports(target, checker, visiting)) {
          if (own?.has(ts.escapeLeadingUnderscores(name)) !== true) {
            ambiguous.add(name);
          }
        }
      }
    }
  }
  visiting.delete(file);
  return ambiguous;
}

/** The bindings an import declaration of `file` names `eval` or `arguments`. A module is strict
 * code, where either name as a binding identifier is an early SyntaxError (§13.1.1); TypeScript's
 * binder checks every other declaration for it but not an ImportedBinding, so Stator does. A
 * type-only import binds no value and is erased. */
export function strictReservedImports(file: ts.SourceFile): readonly ts.Identifier[] {
  const found: ts.Identifier[] = [];
  const check = (name: ts.Identifier | undefined): void => {
    if (name !== undefined && (name.text === 'eval' || name.text === 'arguments')) {
      found.push(name);
    }
  };
  for (const statement of file.statements) {
    const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined;
    if (clause === undefined || clause.isTypeOnly) continue;
    check(clause.name);
    const bindings = clause.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) {
      check(bindings.name);
      continue;
    }
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) check(element.name);
    }
  }
  return found;
}

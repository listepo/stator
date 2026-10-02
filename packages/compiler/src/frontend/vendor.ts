/* The vendor entry (plan.md §11d T12.1 steps 2–3, docs/BUNDLER.md §0, §4, §5): in `js` mode the
 * bundler bundles the DEPENDENCIES, not the project. This module finds them in a loaded program
 * and says how the project reaches them once they are one module.
 *
 * Two kinds of input go to the bundler:
 * - every import of a package: a bare specifier that is not `node:*`, a Node built-in or `std/*`;
 * - every CommonJS project file, whole (its `require` closure is the bundler's to follow).
 *
 * Both become one generated ESM entry. The adapter bundles it into one module, which joins the
 * graph as the virtual file `__stator_vendor__.js` next to the entry, and each project import of
 * a package is rewritten in place into an import of that module. The rewrite keeps every line
 * where it was, so project diagnostics and `#line` still point at the user's lines; only code
 * that shares a line with a rewritten import, after it, can move columns.
 *
 * Pure: a program in, text out. Loading an adapter and running it is `src/cli/bundle.ts`.
 */

import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative } from 'node:path';
import * as ts from 'typescript';
import { classifyStdSpecifier, isStdSourceFile } from './std.ts';

/** The virtual module's basename. It sits in the entry's directory, so the rewritten imports are
 * ordinary relative specifiers and the gate's extension rule (STA1113) holds for them. */
export const VENDOR_MODULE_NAME = '__stator_vendor__.js';

/** What the bundler gets (docs/BUNDLER.md §5). */
export interface VendorEntry {
  /** Generated ESM: `export { pad } from "leftpad";` … */
  readonly code: string;
  /** Where package resolution starts: the entry's directory. `sources` in the bundle's map are
   * relative to it unless absolute. */
  readonly resolveDir: string;
}

export interface VendorPlan {
  readonly entry: VendorEntry;
  /** Absolute, forward-slash path of the virtual module the bundle becomes. */
  readonly modulePath: string;
  /** Project files whose package imports now name the vendor module: path → rewritten text. */
  readonly rewrites: ReadonlyMap<string, string>;
}

const BUILTINS: ReadonlySet<string> = new Set(builtinModules);

/** A bare specifier the bundler resolves: not relative, not absolute, not a URL, not `node:*`, a
 * built-in (`fs`, `fs/promises`) or `std/*` (docs/BUNDLER.md §3). `#x` subpath imports resolve
 * through the project's own `package.json`, which is the bundler's job too. */
export function isPackageSpecifier(specifier: string): boolean {
  if (specifier === '' || specifier.startsWith('.') || specifier.startsWith('/')) return false;
  // A scheme: `node:`, `file:`, `data:`. A Windows drive letter is one letter, never a scheme.
  if (/^[a-z][a-z0-9+.-]+:/i.test(specifier)) return false;
  if (/^[a-z]:[\\/]/i.test(specifier)) return false;
  if (BUILTINS.has(specifier)) return false;
  return classifyStdSpecifier(specifier) === undefined;
}

/** The nearest `package.json`'s `"type"`, per directory, as Node reads it: the first file found
 * walking up decides, even when it has no `"type"`. */
const packageTypes = new Map<string, string | undefined>();

function packageType(dir: string): string | undefined {
  if (packageTypes.has(dir)) return packageTypes.get(dir);
  let found: string | undefined;
  let text: string | undefined;
  try {
    text = readFileSync(join(dir, 'package.json'), 'utf8');
  } catch {
    text = undefined;
  }
  if (text === undefined) {
    const parent = dirname(dir);
    found = parent === dir ? undefined : packageType(parent);
  } else {
    try {
      const parsed: unknown = JSON.parse(text);
      found =
        typeof parsed === 'object' &&
        parsed !== null &&
        'type' in parsed &&
        typeof parsed.type === 'string'
          ? parsed.type
          : undefined;
    } catch {
      found = undefined;
    }
  }
  packageTypes.set(dir, found);
  return found;
}

/** ES-module syntax by Node's detection rule: an import or export statement, `import.meta`, or a
 * top-level `await`. A dynamic `import()` is legal in CommonJS and does not count. */
function hasModuleSyntax(file: ts.SourceFile): boolean {
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) ||
      ts.isExportDeclaration(statement) ||
      ts.isExportAssignment(statement) ||
      (ts.canHaveModifiers(statement) &&
        (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
    ) {
      return true;
    }
  }
  let found = false;
  const visit = (node: ts.Node, topLevel: boolean): void => {
    if (found) return;
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      found = true;
      return;
    }
    if (
      topLevel &&
      (ts.isAwaitExpression(node) ||
        (ts.isForOfStatement(node) && node.awaitModifier !== undefined))
    ) {
      found = true;
      return;
    }
    const inner = topLevel && !ts.isFunctionLike(node) && !ts.isClassStaticBlockDeclaration(node);
    ts.forEachChild(node, (child) => {
      visit(child, inner);
    });
  };
  visit(file, true);
  return found;
}

/** A read of one of Node's CommonJS bindings that nothing in the program declares. Scope is asked
 * by name at the read (`resolveName`), because `getSymbolAtLocation` answers TypeScript's CommonJS
 * model even under a parameter named `exports`. What the checker then finds is nothing, an ambient
 * declaration from a declaration file, or that model itself: in a `.js` file TypeScript declares
 * `module` and `exports` at the file, an identifier, or the assignments that use them. A user's own
 * binding (`function require`, a parameter `exports`) is a real declaration, and not Node's. */
export function isFreeGlobal(node: ts.Expression, name: string, checker: ts.TypeChecker): boolean {
  if (!ts.isIdentifier(node) || node.text !== name) return false;
  const symbol = checker.resolveName(name, node, ts.SymbolFlags.Value, false);
  return (symbol?.declarations ?? []).every(
    (d) =>
      d.getSourceFile().isDeclarationFile ||
      ts.isSourceFile(d) ||
      ts.isIdentifier(d) ||
      ts.isBinaryExpression(d) ||
      ts.isPropertyAccessExpression(d) ||
      ts.isElementAccessExpression(d) ||
      ts.isCallExpression(d),
  );
}

/** Whether the file reads Node's CommonJS bindings: `require(…)`, `module.exports`, `exports.x`. */
function usesCommonJsBindings(file: ts.SourceFile, checker: ts.TypeChecker): boolean {
  const free = (node: ts.Expression, name: string): boolean => isFreeGlobal(node, name, checker);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      (ts.isCallExpression(node) && free(node.expression, 'require')) ||
      (ts.isPropertyAccessExpression(node) &&
        ((free(node.expression, 'module') && node.name.text === 'exports') ||
          free(node.expression, 'exports'))) ||
      (ts.isElementAccessExpression(node) && free(node.expression, 'exports'))
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Node's rule for a CommonJS file (https://nodejs.org/api/packages.html, v26.10.0): `.cjs`
 * always; `.js` under `"type": "commonjs"`; a `.js` with no `"type"` and no ES-module syntax.
 * The last case is narrowed to a file that reads `require`, `module` or `exports` (plan-notes
 * 320): a script that touches none of them means the same thing either way, and routing it would
 * make every plain script need a bundler. */
export function isCommonJsFile(file: ts.SourceFile, checker: ts.TypeChecker): boolean {
  const name = file.fileName;
  if (name.endsWith('.cjs')) return true;
  if (!name.endsWith('.js')) return false;
  const type = packageType(dirname(name));
  if (type === 'commonjs') return true;
  if (type === 'module') return false;
  return !hasModuleSyntax(file) && usesCommonJsBindings(file, checker);
}

/** A file the project wrote: not a declaration, not a lib, not a std source, not a dependency. */
function isProjectFile(program: ts.Program, file: ts.SourceFile): boolean {
  return (
    !file.isDeclarationFile &&
    !program.isSourceFileDefaultLibrary(file) &&
    !isStdSourceFile(file.fileName) &&
    !file.fileName.includes('/node_modules/')
  );
}

type RequestKind = 'side-effect' | 'named' | 'default' | 'namespace';

/** One thing the vendor entry must export (or import, for a side effect). `source` is the
 * specifier as the vendor entry spells it: the package, or a CommonJS file relative to the
 * entry's directory. */
interface Request {
  readonly source: string;
  readonly kind: RequestKind;
  /** The exported name asked for; `named` only. */
  readonly name: string;
}

function requestId(request: Request): string {
  return `${request.kind}\0${request.source}\0${request.name}`;
}

/** One binding a rewritten declaration makes: the request it reads and the name it binds. */
interface Binding {
  readonly request: Request;
  /** The local name (import) or the exported name (re-export). */
  readonly as: string;
}

/** One declaration to rewrite. `typeOnly` keeps the type-only names of a mixed clause on a
 * declaration of their own, still naming the original module (the bundle has no types). */
interface Site {
  readonly file: ts.SourceFile;
  readonly statement: ts.ImportDeclaration | ts.ExportDeclaration;
  readonly kind: 'import' | 'export';
  readonly source: string;
  readonly bindings: readonly Binding[];
  readonly typeOnly: readonly string[];
}

function moduleNameText(name: ts.ModuleExportName): string {
  return name.text;
}

/** Whether `name` spells an IdentifierName (keywords included: they are valid export names). */
function isIdentifierName(name: string): boolean {
  const first = name.codePointAt(0);
  if (first === undefined || !ts.isIdentifierStart(first, ts.ScriptTarget.ESNext)) return false;
  for (const char of name.slice(String.fromCodePoint(first).length)) {
    const code = char.codePointAt(0);
    if (code === undefined || !ts.isIdentifierPart(code, ts.ScriptTarget.ESNext)) return false;
  }
  return true;
}

/** An export name as the entry or a rewrite spells it: an identifier name, or a string literal
 * (ES2022's arbitrary module namespace names). */
function spellName(name: string): string {
  return isIdentifierName(name) ? name : JSON.stringify(name);
}

/** The source a declaration's specifier routes to the bundler, or `undefined` when it stays
 * Stator's: a package, or a relative import of a CommonJS project file. */
function vendorSource(
  literal: ts.StringLiteral,
  checker: ts.TypeChecker,
  commonJs: ReadonlySet<ts.SourceFile>,
  resolveDir: string,
): string | undefined {
  if (isPackageSpecifier(literal.text)) return literal.text;
  const target = checker.getSymbolAtLocation(literal)?.valueDeclaration;
  if (target !== undefined && ts.isSourceFile(target) && commonJs.has(target)) {
    return relativeSpecifier(resolveDir, target.fileName);
  }
  return undefined;
}

function relativeSpecifier(fromDir: string, to: string): string {
  const rel = relative(fromDir, to).replace(/\\/g, '/');
  return rel.startsWith('../') ? rel : `./${rel}`;
}

function importSite(
  file: ts.SourceFile,
  statement: ts.ImportDeclaration,
  source: string,
): Site | undefined {
  const clause = statement.importClause;
  if (clause === undefined) {
    return {
      file,
      statement,
      kind: 'import',
      source,
      bindings: [{ request: { source, kind: 'side-effect', name: '' }, as: '' }],
      typeOnly: [],
    };
  }
  if (clause.isTypeOnly) return undefined;
  const bindings: Binding[] = [];
  const typeOnly: string[] = [];
  if (clause.name !== undefined) {
    bindings.push({ request: { source, kind: 'default', name: '' }, as: clause.name.text });
  }
  const named = clause.namedBindings;
  if (named !== undefined && ts.isNamespaceImport(named)) {
    bindings.push({ request: { source, kind: 'namespace', name: '' }, as: named.name.text });
  } else if (named !== undefined) {
    for (const element of named.elements) {
      const imported = moduleNameText(element.propertyName ?? element.name);
      if (element.isTypeOnly) {
        typeOnly.push(
          element.propertyName === undefined
            ? element.name.text
            : `${spellName(imported)} as ${element.name.text}`,
        );
        continue;
      }
      bindings.push({
        request:
          imported === 'default'
            ? { source, kind: 'default', name: '' }
            : { source, kind: 'named', name: imported },
        as: element.name.text,
      });
    }
  }
  if (bindings.length === 0) {
    // `import { type A } from 'p'` alone binds no value and runs the module: a side effect.
    bindings.push({ request: { source, kind: 'side-effect', name: '' }, as: '' });
  }
  return { file, statement, kind: 'import', source, bindings, typeOnly };
}

function exportSite(
  file: ts.SourceFile,
  statement: ts.ExportDeclaration,
  source: string,
): Site | undefined {
  if (statement.isTypeOnly) return undefined;
  const clause = statement.exportClause;
  // `export * from 'p'` needs every name `p` exports, which only the bundler knows; it stays
  // unrewritten and the gate refuses it.
  if (clause === undefined) return undefined;
  if (ts.isNamespaceExport(clause)) {
    return {
      file,
      statement,
      kind: 'export',
      source,
      bindings: [
        { request: { source, kind: 'namespace', name: '' }, as: moduleNameText(clause.name) },
      ],
      typeOnly: [],
    };
  }
  const bindings: Binding[] = [];
  const typeOnly: string[] = [];
  for (const element of clause.elements) {
    const imported = moduleNameText(element.propertyName ?? element.name);
    const exported = moduleNameText(element.name);
    if (element.isTypeOnly) {
      typeOnly.push(
        imported === exported
          ? spellName(exported)
          : `${spellName(imported)} as ${spellName(exported)}`,
      );
      continue;
    }
    bindings.push({
      request:
        imported === 'default'
          ? { source, kind: 'default', name: '' }
          : { source, kind: 'named', name: imported },
      as: exported,
    });
  }
  if (bindings.length === 0) return undefined;
  return { file, statement, kind: 'export', source, bindings, typeOnly };
}

/** A mangled name's stem: the source spelled as an identifier (`@scope/pkg` → `_scope_pkg`). */
function stem(source: string): string {
  const cleaned = source.replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

/** Every request's export name. A named export keeps its own name unless two sources ask for it
 * (Rolldown then emits `export { a as b }`, which lowers since T11.5a), or it cannot be a binding
 * name. Default and namespace imports are always mangled: `p$default`, `p$ns`. */
function assignNames(requests: readonly Request[]): Map<string, string> {
  const owners = new Map<string, Set<string>>();
  for (const request of requests) {
    if (request.kind !== 'named') continue;
    const sources = owners.get(request.name) ?? new Set<string>();
    sources.add(request.source);
    owners.set(request.name, sources);
  }
  const names = new Map<string, string>();
  const taken = new Set<string>();
  const mangled: Request[] = [];
  for (const request of requests) {
    if (request.kind === 'side-effect') continue;
    const plain =
      request.kind === 'named' &&
      owners.get(request.name)?.size === 1 &&
      isIdentifierName(request.name);
    if (plain) {
      names.set(requestId(request), request.name);
      taken.add(request.name);
    } else {
      mangled.push(request);
    }
  }
  for (const request of mangled) {
    const tail =
      request.kind === 'default'
        ? 'default'
        : request.kind === 'namespace'
          ? 'ns'
          : request.name.replace(/[^A-Za-z0-9_$]/g, '_');
    const base = `${stem(request.source)}$${tail}`;
    let name = base;
    for (let n = 2; taken.has(name); n += 1) name = `${base}$${String(n)}`;
    names.set(requestId(request), name);
    taken.add(name);
  }
  return names;
}

function entryLine(request: Request, exportName: string | undefined): string {
  const from = JSON.stringify(request.source);
  switch (request.kind) {
    case 'side-effect':
      return `import ${from};`;
    case 'default':
      return `export { default as ${exportName ?? ''} } from ${from};`;
    case 'namespace':
      return `export * as ${exportName ?? ''} from ${from};`;
    case 'named':
      return exportName === request.name
        ? `export { ${exportName} } from ${from};`
        : `export { ${spellName(request.name)} as ${exportName ?? ''} } from ${from};`;
  }
}

/** The replacement for one declaration. */
function rewriteSite(site: Site, names: ReadonlyMap<string, string>, vendorSpec: string): string {
  const from = JSON.stringify(vendorSpec);
  const original = JSON.stringify(site.source);
  const values = site.bindings.filter((b) => b.request.kind !== 'side-effect');
  const pairs = values.map((binding) => {
    const exported = names.get(requestId(binding.request)) ?? '';
    const as = site.kind === 'export' ? spellName(binding.as) : binding.as;
    return exported === binding.as ? exported : `${exported} as ${as}`;
  });
  const types =
    site.typeOnly.length === 0
      ? ''
      : ` ${site.kind} type { ${site.typeOnly.join(', ')} } from ${original};`;
  const value =
    pairs.length === 0 ? `import ${from};` : `${site.kind} { ${pairs.join(', ')} } from ${from};`;
  return value + types;
}

/** `replacement` in place of `original`, keeping every line break where it was: the rest of the
 * original turns into spaces, so the lines after it, and the columns after it on its last line,
 * do not move. */
export function sameLines(original: string, replacement: string): string {
  const firstBreak = original.search(/[\r\n]/);
  const firstLine = firstBreak === -1 ? original.length : firstBreak;
  const rest = original.slice(firstLine).replace(/[^\r\n]/g, ' ');
  const pad = ' '.repeat(Math.max(0, firstLine - replacement.length));
  return replacement + pad + rest;
}

function rewriteFile(
  file: ts.SourceFile,
  sites: readonly Site[],
  names: ReadonlyMap<string, string>,
  modulePath: string,
): string {
  const vendorSpec = relativeSpecifier(dirname(file.fileName), modulePath);
  let out = '';
  let at = 0;
  for (const site of [...sites].sort((a, b) => a.statement.pos - b.statement.pos)) {
    const start = site.statement.getStart(file);
    const end = site.statement.getEnd();
    out +=
      file.text.slice(at, start) +
      sameLines(file.text.slice(start, end), rewriteSite(site, names, vendorSpec));
    at = end;
  }
  return out + file.text.slice(at);
}

/** The vendor plan for a loaded program, or `undefined` when the graph imports no package and
 * holds no CommonJS file: then nothing is bundled and no adapter loads. CommonJS project files
 * are routed only under `--node` (`node`; plan-notes 315): without it they stay in the graph and
 * the gate answers their `require`, `module.exports` and `exports` with `STA1110`. Packages are
 * bundled either way. */
export function planVendor(
  program: ts.Program,
  entryFile: ts.SourceFile,
  node: boolean,
): VendorPlan | undefined {
  const checker = program.getTypeChecker();
  const resolveDir = dirname(entryFile.fileName);
  const modulePath = `${resolveDir}/${VENDOR_MODULE_NAME}`;
  const project = program.getSourceFiles().filter((file) => isProjectFile(program, file));
  const commonJs = new Set(node ? project.filter((file) => isCommonJsFile(file, checker)) : []);

  const sites: Site[] = [];
  const requests: Request[] = [];
  const seen = new Set<string>();
  const want = (request: Request): void => {
    const id = requestId(request);
    if (!seen.has(id)) {
      seen.add(id);
      requests.push(request);
    }
  };

  // A CommonJS entry is all bundle: the entry becomes one side-effect import of it.
  const entryIsCommonJs = commonJs.has(entryFile);
  if (entryIsCommonJs) {
    want({
      source: relativeSpecifier(resolveDir, entryFile.fileName),
      kind: 'side-effect',
      name: '',
    });
  }

  for (const file of project) {
    if (commonJs.has(file)) continue;
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const literal = statement.moduleSpecifier;
      if (literal === undefined || !ts.isStringLiteral(literal)) continue;
      // An import attribute (`with { type: 'json' }`) has no spelling in the generated entry
      // yet; the declaration stays as written and the gate answers it.
      if (statement.attributes !== undefined) continue;
      const source = vendorSource(literal, checker, commonJs, resolveDir);
      if (source === undefined) continue;
      const site = ts.isImportDeclaration(statement)
        ? importSite(file, statement, source)
        : exportSite(file, statement, source);
      if (site === undefined) continue;
      sites.push(site);
      for (const binding of site.bindings) want(binding.request);
    }
  }

  if (requests.length === 0) return undefined;

  const names = assignNames(requests);
  const lines = requests.map((request) => entryLine(request, names.get(requestId(request))));
  const rewrites = new Map<string, string>();
  const byFile = new Map<ts.SourceFile, Site[]>();
  for (const site of sites) {
    const list = byFile.get(site.file) ?? [];
    list.push(site);
    byFile.set(site.file, list);
  }
  for (const [file, fileSites] of byFile) {
    rewrites.set(file.fileName, rewriteFile(file, fileSites, names, modulePath));
  }
  if (entryIsCommonJs) {
    rewrites.set(
      entryFile.fileName,
      `import ${JSON.stringify(relativeSpecifier(resolveDir, modulePath))};\n`,
    );
  }
  return {
    entry: { code: `${lines.join('\n')}\n`, resolveDir },
    modulePath,
    rewrites,
  };
}

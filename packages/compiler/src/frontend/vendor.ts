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
  /** Project files whose package imports now name the vendor module: path → rewritten text.
   * `bundle` is the vendor bundle's code: an `export * from 'p'` re-exports the names the bundle
   * exports for it, so without the bundle such a declaration stays as written (the gate refuses
   * it). Every other rewrite is the same either way. */
  rewrites(bundle: string | undefined): ReadonlyMap<string, string>;
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

/** A read of one of Node's CommonJS bindings that no program declaration binds: unresolved (a
 * `.ts` file), or bound by the checker itself (a `.js` file, where TypeScript models CommonJS and
 * declares `require` nowhere, and `module`/`exports` by the assignments that use them). A user's
 * own `function require` is a binding like any other, and a NAME — a property's (`o.require`,
 * `{ exports: 1 }`, `{ exports: e } = o`), a member's or a label's — reads no binding at all. */
export function isFreeCommonJsName(
  node: ts.Identifier,
  name: string,
  checker: ts.TypeChecker,
): boolean {
  // Every `name` slot is a NAME site — a property's, a member's, a declaration's — except a
  // shorthand `{ exports }`, which reads the binding it spells.
  const parent = node.parent;
  if (
    ('name' in parent && parent.name === node && !ts.isShorthandPropertyAssignment(parent)) ||
    ('label' in parent && parent.label === node) ||
    (ts.isQualifiedName(parent) && parent.right === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node)
  ) {
    return false;
  }
  return isFreeGlobal(node, name, checker);
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
export function isProjectFile(program: ts.Program, file: ts.SourceFile): boolean {
  return (
    !file.isDeclarationFile &&
    !program.isSourceFileDefaultLibrary(file) &&
    !isStdSourceFile(file.fileName) &&
    !file.fileName.includes('/node_modules/')
  );
}

type RequestKind = 'side-effect' | 'named' | 'default' | 'namespace' | 'star';

/** One thing the vendor entry must export (or import, for a side effect). `source` is the
 * specifier as the vendor entry spells it: the package, or a CommonJS file relative to the
 * entry's directory. */
interface Request {
  readonly source: string;
  readonly kind: RequestKind;
  /** The exported name asked for; `named` only. */
  readonly name: string;
  /** The import attributes as the entry spells them (` with { type: "json" }`), or `''`. The
   * same specifier under other attributes is another module (ECMA-262 §16.2.1.3), so they are
   * part of the request's identity. */
  readonly attributes: string;
}

function requestId(request: Request): string {
  return `${request.kind}\0${request.source}\0${request.name}\0${request.attributes}`;
}

/** A declaration's import attributes spelled for the entry, `''` without any, or `undefined` when
 * they cannot be: the deprecated `assert` form, or a value that is not a string literal (an early
 * error the checker reports anyway). */
function attributesText(
  statement: ts.ImportDeclaration | ts.ExportDeclaration,
): string | undefined {
  const attributes = statement.attributes;
  if (attributes === undefined) return '';
  if (attributes.token !== ts.SyntaxKind.WithKeyword) return undefined;
  const pairs: string[] = [];
  for (const element of attributes.elements) {
    if (!ts.isStringLiteral(element.value)) return undefined;
    pairs.push(`${spellName(element.name.text)}: ${JSON.stringify(element.value.text)}`);
  }
  return pairs.length === 0 ? '' : ` with { ${pairs.join(', ')} }`;
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
  /** `export * from 'p'` only: names the file exports itself, or through another `export *`, which
   * the star re-export must not (an own export shadows it; two stars make a name ambiguous,
   * ECMA-262 §16.2.1.6.3 GetExportedNames/ResolveExport). */
  readonly shadowed?: ReadonlySet<string>;
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

export function relativeSpecifier(fromDir: string, to: string): string {
  const rel = relative(fromDir, to).replace(/\\/g, '/');
  return rel.startsWith('../') ? rel : `./${rel}`;
}

function importSite(
  file: ts.SourceFile,
  statement: ts.ImportDeclaration,
  source: string,
  attributes: string,
): Site | undefined {
  const clause = statement.importClause;
  if (clause === undefined) {
    return {
      file,
      statement,
      kind: 'import',
      source,
      bindings: [{ request: { source, kind: 'side-effect', name: '', attributes }, as: '' }],
      typeOnly: [],
    };
  }
  if (clause.isTypeOnly) return undefined;
  const bindings: Binding[] = [];
  const typeOnly: string[] = [];
  if (clause.name !== undefined) {
    bindings.push({
      request: { source, kind: 'default', name: '', attributes },
      as: clause.name.text,
    });
  }
  const named = clause.namedBindings;
  if (named !== undefined && ts.isNamespaceImport(named)) {
    bindings.push({
      request: { source, kind: 'namespace', name: '', attributes },
      as: named.name.text,
    });
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
            ? { source, kind: 'default', name: '', attributes }
            : { source, kind: 'named', name: imported, attributes },
        as: element.name.text,
      });
    }
  }
  if (bindings.length === 0) {
    // `import { type A } from 'p'` alone binds no value and runs the module: a side effect.
    bindings.push({ request: { source, kind: 'side-effect', name: '', attributes }, as: '' });
  }
  return { file, statement, kind: 'import', source, bindings, typeOnly };
}

/** The names a star re-export in `file` must leave alone: the file's own exports, and every name
 * another `export *` of the file (a project module the checker can see) also offers. */
function shadowedNames(
  file: ts.SourceFile,
  star: ts.ExportDeclaration,
  checker: ts.TypeChecker,
): Set<string> {
  const names = new Set<string>();
  const own = checker.getSymbolAtLocation(file)?.exports;
  own?.forEach((_symbol, name) => {
    if (name !== ts.InternalSymbolName.ExportStar) names.add(String(name));
  });
  for (const statement of file.statements) {
    if (
      statement === star ||
      !ts.isExportDeclaration(statement) ||
      statement.exportClause !== undefined ||
      statement.moduleSpecifier === undefined
    ) {
      continue;
    }
    const target = checker.getSymbolAtLocation(statement.moduleSpecifier);
    if (target === undefined) continue;
    for (const symbol of checker.getExportsOfModule(target)) names.add(symbol.name);
  }
  return names;
}

function exportSite(
  file: ts.SourceFile,
  statement: ts.ExportDeclaration,
  source: string,
  attributes: string,
  checker: ts.TypeChecker,
): Site | undefined {
  if (statement.isTypeOnly) return undefined;
  const clause = statement.exportClause;
  // `export * from 'p'` needs every name `p` exports, which only the bundle knows: the entry
  // re-exports `p` whole and the rewrite reads the names back from the bundle.
  if (clause === undefined) {
    return {
      file,
      statement,
      kind: 'export',
      source,
      bindings: [{ request: { source, kind: 'star', name: '', attributes }, as: '' }],
      typeOnly: [],
      shadowed: shadowedNames(file, statement, checker),
    };
  }
  if (ts.isNamespaceExport(clause)) {
    return {
      file,
      statement,
      kind: 'export',
      source,
      bindings: [
        {
          request: { source, kind: 'namespace', name: '', attributes },
          as: moduleNameText(clause.name),
        },
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
          ? { source, kind: 'default', name: '', attributes }
          : { source, kind: 'named', name: imported, attributes },
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
  // With a star in the entry, the bundle's plain export names must be exactly the stars' names,
  // so every named request is mangled too (`export { a } from 'q'` would shadow a star's `a`).
  const star = requests.some((request) => request.kind === 'star');
  const owners = new Map<string, Set<string>>();
  for (const request of requests) {
    if (request.kind !== 'named') continue;
    const sources = owners.get(request.name) ?? new Set<string>();
    sources.add(request.source + request.attributes);
    owners.set(request.name, sources);
  }
  const names = new Map<string, string>();
  const taken = new Set<string>();
  const mangled: Request[] = [];
  for (const request of requests) {
    if (request.kind === 'side-effect' || request.kind === 'star') continue;
    const plain =
      !star &&
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
  const from = JSON.stringify(request.source) + request.attributes;
  switch (request.kind) {
    case 'side-effect':
      return `import ${from};`;
    case 'default':
      return `export { default as ${exportName ?? ''} } from ${from};`;
    case 'namespace':
      return `export * as ${exportName ?? ''} from ${from};`;
    case 'star':
      return `export * from ${from};`;
    case 'named':
      return exportName === request.name
        ? `export { ${exportName} } from ${from};`
        : `export { ${spellName(request.name)} as ${exportName ?? ''} } from ${from};`;
  }
}

/** The replacement for one declaration. */
function rewriteSite(
  site: Site,
  names: ReadonlyMap<string, string>,
  vendorSpec: string,
  starNames: readonly string[],
): string {
  const from = JSON.stringify(vendorSpec);
  if (site.shadowed !== undefined) {
    const shadowed = site.shadowed;
    const list = starNames.filter((name) => !shadowed.has(name)).map(spellName);
    return `export { ${list.join(', ')} } from ${from};`;
  }
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
  starNames: readonly string[],
): string {
  const vendorSpec = relativeSpecifier(dirname(file.fileName), modulePath);
  let out = '';
  let at = 0;
  for (const site of [...sites].sort((a, b) => a.statement.pos - b.statement.pos)) {
    const start = site.statement.getStart(file);
    const end = site.statement.getEnd();
    out +=
      file.text.slice(at, start) +
      sameLines(file.text.slice(start, end), rewriteSite(site, names, vendorSpec, starNames));
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
      attributes: '',
    });
  }

  for (const file of project) {
    if (commonJs.has(file)) continue;
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const literal = statement.moduleSpecifier;
      if (literal === undefined || !ts.isStringLiteral(literal)) continue;
      // Import attributes (`with { type: 'json' }`) travel to the entry, where the bundler reads
      // them; the rewritten import of the vendor module drops them, because that module is JS.
      const attributes = attributesText(statement);
      if (attributes === undefined) continue;
      const source = vendorSource(literal, checker, commonJs, resolveDir);
      if (source === undefined) continue;
      const site = ts.isImportDeclaration(statement)
        ? importSite(file, statement, source, attributes)
        : exportSite(file, statement, source, attributes, checker);
      if (site === undefined) continue;
      sites.push(site);
      for (const binding of site.bindings) want(binding.request);
    }
  }

  if (requests.length === 0) return undefined;

  const names = assignNames(requests);
  const lines = requests.map((request) => entryLine(request, names.get(requestId(request))));
  const assigned = new Set(names.values());
  const rewrites = (bundle: string | undefined): ReadonlyMap<string, string> => {
    const starNames = bundle === undefined ? undefined : bundleExportNames(bundle);
    // One star source can be read back from the bundle; two cannot, because the bundle does not
    // say which star a name came from. Such declarations stay as written and the gate refuses
    // them, as it does before there is a bundle.
    const stars = new Set(
      requests.filter((r) => r.kind === 'star').map((r) => r.source + r.attributes),
    );
    const starsKnown = starNames !== undefined && stars.size <= 1;
    const theirs = starsKnown ? starNames.filter((name) => !assigned.has(name)) : [];
    const out = new Map<string, string>();
    const byFile = new Map<ts.SourceFile, Site[]>();
    for (const site of sites) {
      if (site.shadowed !== undefined && !starsKnown) continue;
      const list = byFile.get(site.file) ?? [];
      list.push(site);
      byFile.set(site.file, list);
    }
    for (const [file, fileSites] of byFile) {
      out.set(file.fileName, rewriteFile(file, fileSites, names, modulePath, theirs));
    }
    if (entryIsCommonJs) {
      out.set(
        entryFile.fileName,
        `import ${JSON.stringify(relativeSpecifier(resolveDir, modulePath))};\n`,
      );
    }
    return out;
  };
  return {
    entry: { code: `${lines.join('\n')}\n`, resolveDir },
    modulePath,
    rewrites,
  };
}

/** The names an ES-module bundle exports, from its own export declarations, or `undefined` when
 * one of them is an `export * from` (an external's names, which nothing here can list). */
export function bundleExportNames(code: string): string[] | undefined {
  const file = ts.createSourceFile(
    'bundle.js',
    code,
    ts.ScriptTarget.ESNext,
    false,
    ts.ScriptKind.JS,
  );
  const names: string[] = [];
  for (const statement of file.statements) {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause === undefined) return undefined;
      if (ts.isNamespaceExport(clause)) names.push(moduleNameText(clause.name));
      else for (const element of clause.elements) names.push(moduleNameText(element.name));
    } else if (ts.isExportAssignment(statement)) {
      names.push('default');
    } else if (
      ts.canHaveModifiers(statement) &&
      (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      const isDefault = (ts.getModifiers(statement) ?? []).some(
        (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
      );
      if (isDefault) names.push('default');
      else if (ts.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) names.push(decl.name.text);
        }
      } else if (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
        statement.name !== undefined
      ) {
        names.push(statement.name.text);
      }
    }
  }
  return names;
}

/* Test impact selection (plan.md §9 Task 6.17, plan-notes 293): the map's schema, the diff's
 * classification and the selection itself.
 *
 * Pure on purpose: git, the file system and the recorders live in packages/tests/impact/, so the
 * whole decision is unit-testable on a synthetic map and a synthetic diff
 * (packages/tests/unit/impact.test.ts). The question this module answers is never "how few tests
 * can run" but "which tests could a full run fail": every rule below that cannot prove a change
 * neutral selects more, never less.
 *
 * The map records, per harness and per test, which functions ran (line spans, so a diff can be
 * matched against them), which files were loaded, which non-code files were read, and which
 * runtime sources the test's binaries linked. A changed line then selects:
 *
 * - inside a function: the tests that executed a function containing it;
 * - at module scope, in a function that ran at load, or in a removed top-level name: every test
 *   that loaded the file;
 * - in an import: nobody, when the imported file was already loaded by each test that loads the
 *   importer (otherwise those tests);
 * - in the runtime: the tests whose binary linked an archive member depending on it.
 *
 * A type-only edit is dropped before any of that: both sides are compared after
 * `module.stripTypeScriptTypes`, token by token.
 */
import { stripTypeScriptTypes } from 'node:module';
import { posix } from 'node:path';
import * as ts from 'typescript';

export const MAP_SCHEMA = 1;

/** Every harness the map knows, in the order `test:impact` runs them. */
export const HARNESSES = [
  'unit',
  'subset',
  'golden',
  'asan',
  'runtime',
  'leak',
  'ffi',
  'builtins',
  'node-coverage',
] as const;
export type HarnessName = (typeof HARNESSES)[number];

/** Harnesses that are one test: the whole suite is the key (`test:leak` has no finer unit). */
export const SINGLE_KEY_HARNESSES: ReadonlySet<HarnessName> = new Set([
  'runtime',
  'leak',
  'ffi',
  'builtins',
  'node-coverage',
]);

export function isHarnessName(value: string): value is HarnessName {
  return (HARNESSES as readonly string[]).includes(value);
}

/** `[firstLine, lastLine]`, 1-indexed and inclusive, computed from V8's offsets on the file text
 * as it was at record time (the map's commit). */
export type Span = readonly [number, number];

export interface FileRecord {
  /** Every function V8 reported for this file in this harness, sorted; tests index into it. */
  readonly fns: readonly Span[];
  /** Indices into `fns` of the functions that ran while the file loaded. */
  readonly loadTime: readonly number[];
}

export interface TestRecord {
  /** Per file: base64 bitset over `files[path].fns` of the functions this test executed. */
  readonly fns: Readonly<Record<string, string>>;
  /** Files whose module body ran for this test (per-process harnesses); `npm:<name>` for
   * packages. In-process harnesses load once, so their files live in `HarnessRecord.loaded`. */
  readonly loaded?: readonly string[];
  /** Repo files (and `dir/` listings) the test read as data through `node:fs`. */
  readonly reads?: readonly string[];
  /** Repo-relative runtime sources and headers its binaries linked, or `*` for "all of it". */
  readonly native?: readonly string[];
}

export interface HarnessRecord {
  readonly files: Readonly<Record<string, FileRecord>>;
  /** Files loaded by the harness process itself: a module-scope change there reaches every test. */
  readonly loaded: readonly string[];
  /** Data files the harness read outside any test: a change there reaches every test. */
  readonly reads: readonly string[];
  readonly tests: Readonly<Record<string, TestRecord>>;
}

export interface ImpactMap {
  readonly schema: number;
  readonly commit: string;
  /** Recorded on a tree with uncommitted tracked changes: its lines may not match `commit`. */
  readonly dirty: boolean;
  readonly node: string;
  readonly platform: string;
  readonly recordedAt: string;
  readonly harnesses: Readonly<Partial<Record<HarnessName, HarnessRecord>>>;
}

/* ------------------------------------------------------------------------------------------ */
/* Map validation                                                                             */
/* ------------------------------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${where}: expected a string array`);
  }
  return value as string[];
}

function optionalStrings(value: unknown, where: string): readonly string[] | undefined {
  return value === undefined ? undefined : stringArray(value, where);
}

function parseSpan(value: unknown, where: string): Span {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !Number.isInteger(value[0]) ||
    !Number.isInteger(value[1])
  ) {
    throw new Error(`${where}: expected a [first, last] line span`);
  }
  return [value[0] as number, value[1] as number];
}

function parseFileRecord(value: unknown, where: string): FileRecord {
  if (!isRecord(value) || !Array.isArray(value['fns']) || !Array.isArray(value['loadTime'])) {
    throw new Error(`${where}: malformed file record`);
  }
  const fns = value['fns'].map((span, index) => parseSpan(span, `${where}.fns[${String(index)}]`));
  const loadTime = value['loadTime'].map((index: unknown) => {
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= fns.length) {
      throw new Error(`${where}: loadTime index out of range`);
    }
    return index;
  });
  return { fns, loadTime };
}

function parseTestRecord(value: unknown, where: string): TestRecord {
  if (!isRecord(value) || !isRecord(value['fns'])) {
    throw new Error(`${where}: malformed test record`);
  }
  const fns: Record<string, string> = {};
  for (const [path, bits] of Object.entries(value['fns'])) {
    if (typeof bits !== 'string') throw new Error(`${where}.fns: bitset is not a string`);
    fns[path] = bits;
  }
  const loaded = optionalStrings(value['loaded'], `${where}.loaded`);
  const reads = optionalStrings(value['reads'], `${where}.reads`);
  const native = optionalStrings(value['native'], `${where}.native`);
  return {
    fns,
    ...(loaded === undefined ? {} : { loaded }),
    ...(reads === undefined ? {} : { reads }),
    ...(native === undefined ? {} : { native }),
  };
}

function parseHarness(value: unknown, where: string): HarnessRecord {
  if (!isRecord(value) || !isRecord(value['files']) || !isRecord(value['tests'])) {
    throw new Error(`${where}: malformed harness record`);
  }
  const files: Record<string, FileRecord> = {};
  for (const [path, file] of Object.entries(value['files'])) {
    files[path] = parseFileRecord(file, `${where}.files[${path}]`);
  }
  const tests: Record<string, TestRecord> = {};
  for (const [key, test] of Object.entries(value['tests'])) {
    tests[key] = parseTestRecord(test, `${where}.tests[${key}]`);
  }
  return {
    files,
    loaded: stringArray(value['loaded'], `${where}.loaded`),
    reads: stringArray(value['reads'] ?? [], `${where}.reads`),
    tests,
  };
}

/** Validate a parsed `impact-map.json`. Throws naming the first malformed field. A schema other
 * than `MAP_SCHEMA` is returned as-is (header only) so the caller can report it as a fallback
 * reason rather than a crash. */
export function parseMap(value: unknown): ImpactMap {
  if (!isRecord(value)) throw new Error('impact map: not an object');
  const { schema, commit, node, platform, recordedAt, dirty } = value;
  if (typeof schema !== 'number') throw new Error('impact map: no schema');
  if (typeof commit !== 'string' || typeof node !== 'string' || typeof platform !== 'string') {
    throw new Error('impact map: missing commit, node or platform');
  }
  const header = {
    schema,
    commit,
    node,
    platform,
    dirty: dirty === true,
    recordedAt: typeof recordedAt === 'string' ? recordedAt : '',
  };
  if (schema !== MAP_SCHEMA) return { ...header, harnesses: {} };
  if (!isRecord(value['harnesses'])) throw new Error('impact map: no harnesses');
  const harnesses: Partial<Record<HarnessName, HarnessRecord>> = {};
  for (const [name, record] of Object.entries(value['harnesses'])) {
    if (!isHarnessName(name)) throw new Error(`impact map: unknown harness "${name}"`);
    harnesses[name] = parseHarness(record, `harnesses.${name}`);
  }
  return { ...header, harnesses };
}

/** What the map must agree with before it is trusted. */
export interface MapContext {
  readonly node: string;
  readonly platform: string;
  /** `git merge-base --is-ancestor <map.commit> HEAD` (false when the commit is unknown). */
  readonly commitIsAncestor: boolean;
}

/** The reason the map cannot be trusted, or `undefined` when it can. Every reason is printed and
 * turns the run into the full run — never a silent narrowing. */
export function mapFallbackReason(map: ImpactMap, context: MapContext): string | undefined {
  if (map.schema !== MAP_SCHEMA) {
    return `map schema ${String(map.schema)} is not ${String(MAP_SCHEMA)}`;
  }
  if (map.node !== context.node) {
    return `map was recorded on Node ${map.node}, this is ${context.node}`;
  }
  if (map.platform !== context.platform) {
    return `map was recorded on ${map.platform}, this is ${context.platform}`;
  }
  if (map.dirty) {
    return `map was recorded on a dirty tree (its lines need not match ${map.commit.slice(0, 12)})`;
  }
  if (!context.commitIsAncestor) {
    return `map commit ${map.commit.slice(0, 12)} is not an ancestor of HEAD`;
  }
  return undefined;
}

/* ------------------------------------------------------------------------------------------ */
/* Bitsets                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export function encodeBits(indices: Iterable<number>, size: number): string {
  const bytes = new Uint8Array(Math.ceil(size / 8));
  for (const index of indices) {
    const at = index >> 3;
    bytes[at] = (bytes[at] ?? 0) | (1 << (index & 7));
  }
  return Buffer.from(bytes).toString('base64');
}

export function decodeBits(bits: string): Set<number> {
  const bytes = Buffer.from(bits, 'base64');
  const out = new Set<number>();
  for (let at = 0; at < bytes.length; at += 1) {
    const byte = bytes[at] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((byte & (1 << bit)) !== 0) out.add(at * 8 + bit);
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/* Diff input                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/** One `@@ -oldStart,oldCount +newStart,newCount @@` of a `-U0` diff. A zero count means a pure
 * insertion (or deletion) AFTER line `start` of that side. */
export interface Hunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
}

export interface FileChange {
  readonly path: string;
  readonly status: 'added' | 'deleted' | 'modified';
  /** The file at the map commit (TypeScript/JavaScript files only). */
  readonly oldText?: string;
  /** The file in the working tree (TypeScript/JavaScript files only). */
  readonly newText?: string;
  readonly hunks: readonly Hunk[];
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Hunks per path from `git -c core.quotePath=false diff --no-renames -U0`. Paths come from the
 * `---`/`+++` lines (the `+++` side, or `---` for a deletion); a binary or mode-only change has
 * no hunks and so no entry — the caller's name-status list still carries it. */
export function parseUnifiedDiff(patch: string): Map<string, Hunk[]> {
  const out = new Map<string, Hunk[]>();
  let oldPath: string | undefined;
  let current: Hunk[] | undefined;
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      oldPath = undefined;
      current = undefined;
    } else if (line.startsWith('--- ')) {
      const path = line.slice(4);
      oldPath = path.startsWith('a/') ? path.slice(2) : undefined;
    } else if (line.startsWith('+++ ')) {
      const path = line.slice(4);
      const name = path.startsWith('b/') ? path.slice(2) : oldPath;
      if (name !== undefined) {
        current = out.get(name) ?? [];
        out.set(name, current);
      }
    } else if (current !== undefined) {
      const match = HUNK.exec(line);
      if (match !== null) {
        current.push({
          oldStart: Number(match[1]),
          oldCount: match[2] === undefined ? 1 : Number(match[2]),
          newStart: Number(match[3]),
          newCount: match[4] === undefined ? 1 : Number(match[4]),
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ */
/* Path classes                                                                               */
/* ------------------------------------------------------------------------------------------ */

const SCRIPT_EXTENSIONS = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];

export function isScriptPath(path: string): boolean {
  return !isDeclarationPath(path) && SCRIPT_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function isDeclarationPath(path: string): boolean {
  return /\.d\.[cm]?ts$/.test(path);
}

export type PathClass =
  | { readonly kind: 'everything' }
  | { readonly kind: 'noop' }
  | { readonly kind: 'script' }
  | { readonly kind: 'data' }
  | { readonly kind: 'harness'; readonly harness: HarnessName }
  | { readonly kind: 'golden-fixture'; readonly key: string }
  | { readonly kind: 'subset-fixture'; readonly key: string }
  | { readonly kind: 'runtime'; readonly area: 'source' | 'header' | 'tests' };

const NOOP_BASENAMES = new Set([
  '.gitignore',
  '.oxlintrc.json',
  '.oxfmtrc.json',
  '.jscpd.json',
  '.jscpd-baseline.json',
  'LICENSE',
  'moon.yml',
]);

const EVERYTHING_EXACT = new Set([
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.node-version',
  'mise.toml',
  'packages/runtime/justfile',
]);

/** Which rule a changed path falls under. Order matters: fixtures before extensions, runtime
 * before "unknown". Anything this does not recognize is `everything` — an unknown file is a
 * reason to run all, never a reason to run none. */
export function classifyPath(path: string): PathClass {
  const base = posix.basename(path);
  if (
    path.endsWith('.md') ||
    path.startsWith('docs/') ||
    path.startsWith('site/') ||
    path.startsWith('.moon/') ||
    path.endsWith('.svg') ||
    path.endsWith('.d2') ||
    NOOP_BASENAMES.has(base)
  ) {
    return { kind: 'noop' };
  }
  const golden = /^packages\/tests\/golden\/(ts|js)\/([^/]+)/.exec(path);
  if (golden !== null) {
    return { kind: 'golden-fixture', key: `${golden[1] ?? ''}/${golden[2] ?? ''}` };
  }
  const subset = /^packages\/tests\/subset\/([^/]+)$/.exec(path);
  if (subset !== null && subset[1] !== undefined && subset[1].startsWith('subset_')) {
    return { kind: 'subset-fixture', key: subset[1] };
  }
  if (subset !== null && isDeclarationPath(path)) {
    // A `helper_*.d.ts` is an ambient extern surface any decision fixture may declare against.
    return { kind: 'harness', harness: 'subset' };
  }
  if (EVERYTHING_EXACT.has(path)) return { kind: 'everything' };
  if (path.startsWith('packages/runtime/')) {
    const rest = path.slice('packages/runtime/'.length);
    if (rest.startsWith('tests/')) return { kind: 'runtime', area: 'tests' };
    if (/^(src|include|vendor)\/.*\.(c|h|zig)$/.test(rest)) {
      return { kind: 'runtime', area: rest.startsWith('include/') ? 'header' : 'source' };
    }
    return { kind: 'everything' };
  }
  if (
    base === 'package.json' ||
    /^tsconfig.*\.json$/.test(base) ||
    path.startsWith('.github/') ||
    path.startsWith('scripts/') ||
    isDeclarationPath(path)
  ) {
    return { kind: 'everything' };
  }
  // Loaded through vite's config bundler, not as a module V8 attributes to its own URL.
  if (path === 'packages/tests/vitest.config.ts') return { kind: 'harness', harness: 'unit' };
  // `test:asan`'s own driver: its stage-3 restriction is decided here, not by coverage.
  if (path === 'packages/tests/golden/asan-gate.ts') return { kind: 'harness', harness: 'asan' };
  if (isScriptPath(path)) return { kind: 'script' };
  // Generated config schemas (`packages/compiler/schema/*.json`, Task 6.18) are checked by their
  // drift test, which reads them: the read rule selects it, and anything else reading one.
  if (
    path.startsWith('packages/tests/') ||
    path.startsWith('examples/') ||
    /^packages\/[^/]+\/schema\/[^/]+\.json$/.test(path)
  ) {
    return { kind: 'data' };
  }
  return { kind: 'everything' };
}

/* ------------------------------------------------------------------------------------------ */
/* TypeScript line analysis                                                                   */
/* ------------------------------------------------------------------------------------------ */

/** What a source line is, on one side of the diff:
 * - `function`: strictly inside a function-like body, or anywhere in a function declaration —
 *   it runs only when that function is called;
 * - `member`: a class member's own lines (method header, field) — adding one can override an
 *   inherited member, so on the NEW side it counts as module scope;
 * - `import`: an import or a re-export;
 * - `module`: any other statement line — it runs when the module loads;
 * - `trivia`: blank, comment-only between statements, or erased by type stripping. */
export type LineKind = 'trivia' | 'function' | 'member' | 'import' | 'module';

export interface SourceAnalysis {
  /** Index = 1-based line; index 0 unused. */
  readonly kinds: readonly LineKind[];
  readonly sourceFile: ts.SourceFile;
  /** Leaf tokens (text + 1-based line span), comments and whitespace excluded. */
  readonly tokens: readonly {
    readonly text: string;
    readonly first: number;
    readonly last: number;
  }[];
  /** Top-level declared and exported names: removing one can break a module-scope reference. */
  readonly names: ReadonlySet<string>;
}

type FunctionWithBody = ts.FunctionLikeDeclaration & { readonly body: ts.ConciseBody };

function functionWithBody(node: ts.Node): FunctionWithBody | undefined {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node)) &&
    node.body !== undefined
  ) {
    return node as FunctionWithBody;
  }
  return undefined;
}

function isStatic(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword)
  );
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function bindingNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) bindingNames(element.name, into);
  }
}

function topLevelNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    const exported = isExported(statement) ? 'export ' : '';
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      names.add(statement.name.text);
      if (exported !== '') names.add(`export ${statement.name.text}`);
    } else if (ts.isVariableStatement(statement)) {
      const declared = new Set<string>();
      for (const declaration of statement.declarationList.declarations) {
        bindingNames(declaration.name, declared);
      }
      for (const name of declared) {
        names.add(name);
        if (exported !== '') names.add(`export ${name}`);
      }
    } else if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          names.add(`export ${element.name.text}`);
        }
      }
    } else if (ts.isExportAssignment(statement)) {
      names.add('export default');
    }
    if (
      ts.canHaveModifiers(statement) &&
      (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      names.add('export default');
    }
  }
  return names;
}

/** Analyse one side of a TypeScript/JavaScript file AFTER type stripping (offsets — and so lines
 * — are the original's). Returns `undefined` when the text cannot be stripped (a syntax error,
 * or syntax that is not erasable), which callers treat as a module-scope change. */
export function analyseSource(path: string, text: string): SourceAnalysis | undefined {
  let stripped: string;
  try {
    stripped = /\.[cm]?ts$/.test(path) ? stripTypeScriptTypes(text) : text;
  } catch {
    return undefined;
  }
  const sourceFile = ts.createSourceFile(
    path,
    stripped,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const lineCount = sourceFile.getLineStarts().length;
  const kinds: LineKind[] = Array.from({ length: lineCount + 2 }, (): LineKind => 'trivia');
  const lineOf = (position: number): number =>
    sourceFile.getLineAndCharacterOfPosition(position).line + 1;
  const mark = (from: number, to: number, kind: LineKind, skip?: ReadonlySet<number>): void => {
    for (let line = from; line <= to; line += 1) {
      if (skip === undefined || !skip.has(line)) kinds[line] = kind;
    }
  };

  const markBody = (fn: FunctionWithBody): void => {
    const body = fn.body;
    const first = lineOf(body.getStart(sourceFile));
    const last = lineOf(body.getEnd());
    if (ts.isBlock(body)) {
      mark(first + 1, last - 1, 'function');
    } else if (first > lineOf(fn.getStart(sourceFile))) {
      mark(first, last - 1, 'function');
    } else {
      mark(first + 1, last - 1, 'function');
    }
  };

  const visit = (node: ts.Node): void => {
    const fn = functionWithBody(node);
    if (fn !== undefined) {
      markBody(fn);
      return;
    }
    if (ts.isClassLike(node)) {
      markClass(node);
      return;
    }
    ts.forEachChild(node, visit);
  };

  const markClass = (node: ts.ClassLikeDeclaration): void => {
    // The header (through `{`) and the closing line stay module scope: `extends` is evaluated
    // when the class is, and a one-line class must not let a member mark hide its header.
    const header = new Set<number>();
    for (
      let line = lineOf(node.getStart(sourceFile));
      line <= lineOf(node.members.pos);
      line += 1
    ) {
      header.add(line);
    }
    header.add(lineOf(node.getEnd()));
    for (const member of node.members) {
      const first = lineOf(member.getStart(sourceFile));
      const last = lineOf(member.getEnd());
      const fn = functionWithBody(member);
      if (fn !== undefined) {
        mark(first, last, 'member', header);
        markBody(fn);
      } else if (ts.isClassStaticBlockDeclaration(member) || isStatic(member)) {
        // Runs while the class is evaluated, i.e. at load: keeps the enclosing statement's kind.
        ts.forEachChild(member, visit);
      } else {
        mark(first, last, 'member', header);
        ts.forEachChild(member, visit);
      }
    }
  };

  for (const statement of sourceFile.statements) {
    const first = lineOf(statement.getStart(sourceFile));
    const last = lineOf(statement.getEnd());
    if (
      ts.isImportDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement) ||
      (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined)
    ) {
      mark(first, last, 'import');
    } else if (ts.isFunctionDeclaration(statement)) {
      mark(first, last, 'function');
    } else {
      mark(first, last, 'module');
      if (ts.isClassDeclaration(statement)) {
        markClass(statement);
      } else {
        ts.forEachChild(statement, visit);
      }
    }
  }

  const tokens: { text: string; first: number; last: number }[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isJSDoc(node)) return;
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      if (node.kind !== ts.SyntaxKind.EndOfFileToken) {
        tokens.push({
          text: node.getText(sourceFile),
          first: lineOf(node.getStart(sourceFile)),
          last: lineOf(node.getEnd()),
        });
      }
      return;
    }
    for (const child of children) collect(child);
  };
  collect(sourceFile);

  return { kinds, sourceFile, tokens, names: topLevelNames(sourceFile) };
}

function tokensIn(analysis: SourceAnalysis, first: number, last: number): string[] {
  return analysis.tokens
    .filter((token) => token.last >= first && token.first <= last)
    .map((token) => token.text);
}

/** A hunk whose two sides have the same tokens after type stripping changes nothing that runs:
 * a type, a comment, whitespace or formatting. Tokens are taken whole from the parsed file, so a
 * hunk inside a template literal still compares the literal's full text. */
export function hunkIsNeutral(
  oldSide: SourceAnalysis,
  newSide: SourceAnalysis,
  hunk: Hunk,
): boolean {
  const before = tokensIn(oldSide, hunk.oldStart, hunk.oldStart + hunk.oldCount - 1);
  const after = tokensIn(newSide, hunk.newStart, hunk.newStart + hunk.newCount - 1);
  if (hunk.oldCount === 0) return after.length === 0;
  if (hunk.newCount === 0) return before.length === 0;
  return before.length === after.length && before.every((text, index) => text === after[index]);
}

/** The import or re-export statement on a line, with its specifier and whether it binds names. */
function importAt(
  analysis: SourceAnalysis,
  line: number,
): { readonly specifier: string | undefined; readonly sideEffectOnly: boolean } | undefined {
  for (const statement of analysis.sourceFile.statements) {
    const first =
      analysis.sourceFile.getLineAndCharacterOfPosition(statement.getStart(analysis.sourceFile))
        .line + 1;
    const last = analysis.sourceFile.getLineAndCharacterOfPosition(statement.getEnd()).line + 1;
    if (line < first || line > last) continue;
    if (ts.isImportDeclaration(statement)) {
      return {
        specifier: ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined,
        sideEffectOnly: statement.importClause === undefined,
      };
    }
    if (ts.isExportDeclaration(statement)) {
      const spec = statement.moduleSpecifier;
      return {
        specifier: spec !== undefined && ts.isStringLiteral(spec) ? spec.text : undefined,
        sideEffectOnly: false,
      };
    }
    return { specifier: undefined, sideEffectOnly: true };
  }
  return undefined;
}

/** What an import specifier names, as the map spells loaded files. */
export function importTarget(
  fromPath: string,
  specifier: string,
): { readonly kind: 'builtin' } | { readonly kind: 'loaded'; readonly id: string } | undefined {
  if (specifier.startsWith('node:')) return { kind: 'builtin' };
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const resolved = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
    return resolved.startsWith('../') ? undefined : { kind: 'loaded', id: resolved };
  }
  const bare = /^(@[^/]+\/[^/]+|[^@./][^/]*)/.exec(specifier);
  return bare?.[1] === undefined ? undefined : { kind: 'loaded', id: `npm:${bare[1]}` };
}

/* ------------------------------------------------------------------------------------------ */
/* Selection                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export interface HarnessSelection {
  readonly harness: HarnessName;
  /** Every current test runs (a whole-harness trigger, or the fallback). */
  readonly all: boolean;
  /** Selected current keys, sorted; with `all`, every current key. */
  readonly keys: readonly string[];
  /** Current keys the map has never seen: they always run and are included in `keys`. */
  readonly fresh: readonly string[];
  readonly total: number;
  /** Why, most frequent first: `path:line → rule`, with how many tests that reason selected. */
  readonly reasons: readonly { readonly text: string; readonly count: number }[];
  /** Some selected test links the runtime archive (or may: an unrecorded test). */
  readonly native: boolean;
}

export interface Selection {
  /** Set when the map could not be used: everything runs, and this says why. */
  readonly fallback: string | undefined;
  readonly harnesses: readonly HarnessSelection[];
}

export interface SelectInput {
  readonly map: ImpactMap;
  readonly changes: readonly FileChange[];
  /** The tests that exist now, per harness (subset fixture names, `ts/name.ts`, unit paths). */
  readonly current: Readonly<Record<HarnessName, readonly string[]>>;
}

interface TestIndex {
  readonly key: string;
  readonly record: TestRecord;
  readonly loaded: ReadonlySet<string>;
  readonly reads: ReadonlySet<string>;
  readonly native: ReadonlySet<string>;
}

class HarnessIndex {
  readonly loaded: ReadonlySet<string>;
  readonly reads: ReadonlySet<string>;
  readonly tests: readonly TestIndex[];
  readonly name: HarnessName;
  readonly record: HarnessRecord;
  private readonly decoded = new Map<string, Map<string, Set<number>>>();

  constructor(name: HarnessName, record: HarnessRecord) {
    this.name = name;
    this.record = record;
    this.loaded = new Set(record.loaded);
    this.reads = new Set(record.reads);
    this.tests = Object.entries(record.tests).map(([key, test]) => ({
      key,
      record: test,
      loaded: new Set(test.loaded ?? []),
      reads: new Set(test.reads ?? []),
      native: new Set(test.native ?? []),
    }));
  }

  /** Did `test` load `id`, either itself or through the harness process? */
  loads(test: TestIndex, id: string): boolean {
    return this.loaded.has(id) || test.loaded.has(id);
  }

  /** Tests that executed any of the functions `indices` of `path`. */
  executing(path: string, indices: readonly number[]): TestIndex[] {
    if (indices.length === 0) return [];
    let perTest = this.decoded.get(path);
    if (perTest === undefined) {
      perTest = new Map();
      for (const test of this.tests) {
        const bits = test.record.fns[path];
        if (bits !== undefined) perTest.set(test.key, decodeBits(bits));
      }
      this.decoded.set(path, perTest);
    }
    const hit: TestIndex[] = [];
    for (const test of this.tests) {
      const bits = perTest.get(test.key);
      if (bits !== undefined && indices.some((index) => bits.has(index))) hit.push(test);
    }
    return hit;
  }
}

class Accumulator {
  readonly all = new Map<HarnessName, string>();
  readonly keys = new Map<HarnessName, Set<string>>();
  readonly reasons = new Map<HarnessName, Map<string, number>>();

  selectAll(harness: HarnessName, reason: string): void {
    if (!this.all.has(harness)) this.all.set(harness, reason);
    this.count(harness, reason, 1);
  }

  select(harness: HarnessName, keys: readonly string[], reason: string): void {
    if (keys.length === 0) return;
    const into = this.keys.get(harness) ?? new Set<string>();
    this.keys.set(harness, into);
    for (const key of keys) into.add(key);
    this.count(harness, reason, keys.length);
  }

  everything(reason: string): void {
    for (const harness of HARNESSES) this.selectAll(harness, reason);
  }

  private count(harness: HarnessName, reason: string, by: number): void {
    const into = this.reasons.get(harness) ?? new Map<string, number>();
    this.reasons.set(harness, into);
    into.set(reason, (into.get(reason) ?? 0) + by);
  }
}

/** The selection a run without a usable map makes: everything, with the reason. */
export function fullSelection(
  current: Readonly<Record<HarnessName, readonly string[]>>,
  reason: string,
): Selection {
  return {
    fallback: reason,
    harnesses: HARNESSES.map((harness) => ({
      harness,
      all: true,
      keys: [...current[harness]].sort(),
      fresh: [],
      total: current[harness].length,
      reasons: [{ text: reason, count: current[harness].length }],
      native: true,
    })),
  };
}

/** Every rule, applied to one map and one diff. */
export function select(input: SelectInput): Selection {
  const acc = new Accumulator();
  const indexes = HARNESSES.flatMap((name) => {
    const record = input.map.harnesses[name];
    return record === undefined ? [] : [new HarnessIndex(name, record)];
  });
  for (const harness of HARNESSES) {
    if (input.map.harnesses[harness] === undefined && input.current[harness].length > 0) {
      acc.selectAll(harness, `the map has no ${harness} record`);
    }
  }
  const nativePaths = new Set<string>();
  for (const index of indexes) {
    for (const test of index.tests) for (const path of test.native) nativePaths.add(path);
  }

  for (const change of input.changes) {
    applyReads(acc, indexes, change);
    const cls = classifyPath(change.path);
    switch (cls.kind) {
      case 'everything':
        acc.everything(`${change.path} → whole-run trigger`);
        break;
      case 'noop':
      case 'data':
        break;
      case 'harness':
        acc.selectAll(cls.harness, `${change.path} → harness trigger`);
        if (isScriptPath(change.path)) applyScript(acc, indexes, change);
        break;
      case 'golden-fixture':
        acc.select('golden', [cls.key], `${change.path} → fixture`);
        acc.select('asan', [cls.key], `${change.path} → fixture`);
        if (isScriptPath(change.path)) applyScript(acc, indexes, change);
        break;
      case 'subset-fixture':
        acc.select('subset', [cls.key], `${change.path} → fixture`);
        break;
      case 'runtime':
        applyRuntime(acc, indexes, change.path, cls.area, nativePaths);
        break;
      case 'script':
        applyScript(acc, indexes, change);
        break;
      default: {
        const exhaustive: never = cls;
        throw new Error(`unhandled path class ${String(exhaustive)}`);
      }
    }
  }

  const harnesses = HARNESSES.map((harness): HarnessSelection => {
    const current = input.current[harness];
    const record = input.map.harnesses[harness];
    const fresh = current.filter((key) => record?.tests[key] === undefined);
    const all = acc.all.has(harness);
    const chosen = acc.keys.get(harness) ?? new Set<string>();
    const keys = all
      ? [...current]
      : current.filter((key) => chosen.has(key) || fresh.includes(key));
    keys.sort();
    const reasons = [...(acc.reasons.get(harness) ?? new Map<string, number>())]
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
    if (fresh.length > 0) reasons.push({ text: 'not in the map (new test)', count: fresh.length });
    const native =
      harness === 'runtime' ||
      fresh.length > 0 ||
      keys.some((key) => (record?.tests[key]?.native?.length ?? 0) > 0);
    return {
      harness,
      all,
      keys,
      fresh,
      total: current.length,
      reasons,
      native: keys.length > 0 && native,
    };
  });
  return { fallback: undefined, harnesses };
}

function applyReads(acc: Accumulator, indexes: readonly HarnessIndex[], change: FileChange): void {
  const listing = `${posix.dirname(change.path)}/`;
  const listingChanged = change.status !== 'modified';
  for (const index of indexes) {
    if (index.reads.has(change.path) || (listingChanged && index.reads.has(listing))) {
      acc.selectAll(index.name, `${change.path} → read by the ${index.name} harness`);
      continue;
    }
    const keys = index.tests
      .filter((test) => test.reads.has(change.path) || (listingChanged && test.reads.has(listing)))
      .map((test) => test.key);
    acc.select(index.name, keys, `${change.path} → read as data`);
  }
}

function applyRuntime(
  acc: Accumulator,
  indexes: readonly HarnessIndex[],
  path: string,
  area: 'source' | 'header' | 'tests',
  nativePaths: ReadonlySet<string>,
): void {
  acc.selectAll('runtime', `${path} → runtime corpus`);
  if (area === 'tests') return;
  // A public header reaches every generated program's own C, whatever members it links; a path
  // no member's `.d` names (a new file, a Zig-only input) cannot be traced — all native tests.
  const broad = area === 'header' || !nativePaths.has(path);
  for (const index of indexes) {
    const keys = index.tests
      .filter((test) =>
        broad ? test.native.size > 0 : test.native.has('*') || test.native.has(path),
      )
      .map((test) => test.key);
    acc.select(index.name, keys, `${path} → linked by the test's binary`);
  }
}

/** Every test of `index` that loaded `path`: the module-scope rule. */
function moduleRule(acc: Accumulator, index: HarnessIndex, path: string, why: string): void {
  if (index.loaded.has(path)) {
    acc.selectAll(index.name, `${path} → ${why} (loaded by the harness)`);
    return;
  }
  const keys = index.tests.filter((test) => test.loaded.has(path)).map((test) => test.key);
  acc.select(index.name, keys, `${path} → ${why}`);
}

function applyScript(acc: Accumulator, indexes: readonly HarnessIndex[], change: FileChange): void {
  const path = change.path;
  if (change.status === 'added') return; // neutral until something imports it (import rule)
  if (change.status === 'deleted' || change.oldText === undefined || change.newText === undefined) {
    for (const index of indexes) moduleRule(acc, index, path, 'file deleted');
    return;
  }
  const before = analyseSource(path, change.oldText);
  const after = analyseSource(path, change.newText);
  if (before === undefined || after === undefined) {
    for (const index of indexes) moduleRule(acc, index, path, 'cannot be type-stripped');
    return;
  }
  const removed = [...before.names].filter((name) => !after.names.has(name));
  if (removed.length > 0) {
    for (const index of indexes) {
      moduleRule(acc, index, path, `top-level name removed (${removed.slice(0, 3).join(', ')})`);
    }
  }
  for (const hunk of change.hunks) {
    if (hunkIsNeutral(before, after, hunk)) continue;
    for (const index of indexes) applyHunk(acc, index, path, before, after, hunk);
  }
}

function spanIndices(file: FileRecord | undefined, contains: (span: Span) => boolean): number[] {
  if (file === undefined) return [];
  const out: number[] = [];
  file.fns.forEach((span, index) => {
    if (contains(span)) out.push(index);
  });
  return out;
}

function applyHunk(
  acc: Accumulator,
  index: HarnessIndex,
  path: string,
  before: SourceAnalysis,
  after: SourceAnalysis,
  hunk: Hunk,
): void {
  const file = index.record.files[path];
  const loadTime = new Set(file?.loadTime ?? []);
  const functionRule = (indices: readonly number[], where: string): void => {
    if (indices.some((at) => loadTime.has(at))) {
      moduleRule(acc, index, path, `${where} ran at load`);
    }
    const keys = index.executing(path, indices).map((test) => test.key);
    acc.select(index.name, keys, `${path}:${where} → function executed`);
  };

  // OLD side: what the changed lines were.
  if (hunk.oldCount === 0) {
    // A pure insertion after line X runs wherever a function spanning X..X+1 runs.
    const at = hunk.oldStart;
    functionRule(
      spanIndices(file, ([first, last]) => first <= at && last >= at + 1),
      `${String(at)}+`,
    );
  }
  for (let line = hunk.oldStart; line < hunk.oldStart + hunk.oldCount; line += 1) {
    const kind = before.kinds[line] ?? 'module';
    const where = String(line);
    switch (kind) {
      case 'trivia':
        break;
      case 'function':
      case 'member': {
        const indices = spanIndices(file, ([first, last]) => first <= line && last >= line);
        if (indices.length === 0) {
          // A line of a function V8 never reported cannot be traced: assume it ran at load.
          if (file !== undefined)
            moduleRule(acc, index, path, `${where} in an unrecorded function`);
        } else {
          functionRule(indices, where);
        }
        break;
      }
      case 'import':
        importRule(acc, index, path, before, line, where);
        break;
      case 'module':
        moduleRule(acc, index, path, `${where} module scope`);
        break;
      default: {
        const exhaustive: never = kind;
        throw new Error(`unhandled line kind ${String(exhaustive)}`);
      }
    }
  }
  // NEW side: new function bodies are neutral until a changed caller reaches them.
  for (let line = hunk.newStart; line < hunk.newStart + hunk.newCount; line += 1) {
    const kind = after.kinds[line] ?? 'module';
    const where = `${String(line)}(new)`;
    switch (kind) {
      case 'trivia':
      case 'function':
        break;
      case 'member':
        moduleRule(acc, index, path, `${where} class member`);
        break;
      case 'import':
        importRule(acc, index, path, after, line, where);
        break;
      case 'module':
        moduleRule(acc, index, path, `${where} module scope`);
        break;
      default: {
        const exhaustive: never = kind;
        throw new Error(`unhandled line kind ${String(exhaustive)}`);
      }
    }
  }
}

function importRule(
  acc: Accumulator,
  index: HarnessIndex,
  path: string,
  side: SourceAnalysis,
  line: number,
  where: string,
): void {
  const statement = importAt(side, line);
  const target =
    statement?.specifier === undefined ? undefined : importTarget(path, statement.specifier);
  if (statement === undefined || statement.sideEffectOnly || target === undefined) {
    moduleRule(acc, index, path, `${where} import with load-time effect`);
    return;
  }
  if (target.kind === 'builtin') return;
  // Neutral for a test that already loads the target; a test that loads the importer but not the
  // target now runs the target's module body for the first time.
  if (index.loaded.has(path) && !index.loaded.has(target.id)) {
    acc.selectAll(index.name, `${path}:${where} → imports ${target.id}, new to the harness`);
    return;
  }
  const keys = index.tests
    .filter((test) => index.loads(test, path) && !index.loads(test, target.id))
    .map((test) => test.key);
  acc.select(index.name, keys, `${path}:${where} → imports ${target.id}, new to the test`);
}

/** The human summary: one line per harness, then its top reasons. */
export function formatSelection(selection: Selection, topReasons = 5): string {
  const lines: string[] = [];
  if (selection.fallback !== undefined) {
    lines.push(`impact: FULL RUN — ${selection.fallback}`);
  }
  for (const harness of selection.harnesses) {
    const label = harness.all
      ? 'all'
      : `${String(harness.keys.length)} of ${String(harness.total)}`;
    lines.push(
      `impact: ${harness.harness}: ${label} selected${harness.keys.length === 0 ? ' — nothing to run' : ''}`,
    );
    if (selection.fallback !== undefined) continue;
    for (const reason of harness.reasons.slice(0, topReasons)) {
      lines.push(`  ${reason.text} (${String(reason.count)})`);
    }
    if (harness.reasons.length > topReasons) {
      lines.push(`  … ${String(harness.reasons.length - topReasons)} more reasons`);
    }
  }
  return `${lines.join('\n')}\n`;
}

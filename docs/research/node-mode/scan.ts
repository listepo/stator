// T11.0 corpus scanner: which parts of the Node platform do real npm CLIs and libraries use?
// Usage: node docs/research/node-mode/scan.ts > docs/research/node-mode/scan.json
//        node docs/research/node-mode/scan.ts --md > docs/research/node-mode/scan.md
// Parses every .js/.cjs/.mjs file of each corpus package with the `typescript` API (no type
// check) and counts, per package: built-in module specifiers (require / import / import()),
// the members used off each built-in binding, Node globals and their members, and computed
// `require(expr)` sites. Member tracking is lexical and scope-naive: a binding named by
// `const fs = require('fs')` / `fs = require('fs')` / `import * as fs` / `import fs` is followed by name through the
// whole file, so shadowed names over-count. The counts are for sizing, not for proofs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import ts from 'typescript';

type Counts = Record<string, number>;
type PackageScan = {
  name: string;
  version: string;
  files: number;
  bytes: number;
  modules: Record<string, { sites: number; members: Counts }>;
  globals: Record<string, { uses: number; members: Counts }>;
  computedRequire: number;
};

const STORE = new URL('../../../node_modules/.pnpm/', import.meta.url).pathname;
// [store directory prefix, package name, sub-paths to scan (empty = whole package)]
const CORPUS: readonly (readonly [string, string, readonly string[]])[] = [
  ['typescript@', 'typescript', ['lib/_tsc.js']],
  ['vitest@', 'vitest', ['dist']],
  ['vite@', 'vite', ['dist']],
  ['c8@', 'c8', []],
  ['execa@', 'execa', []],
  ['ws@', 'ws', []],
  ['dotenv@', 'dotenv', ['dist']],
  ['memfs@4.78', 'memfs', ['lib']],
  ['tinypool@', 'tinypool', ['dist']],
  ['yargs@', 'yargs', []],
  ['test-exclude@', 'test-exclude', []],
  ['rolldown@', 'rolldown', ['dist']],
];
const GLOBALS = new Set([
  'process',
  'Buffer',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'queueMicrotask',
  'structuredClone',
  'TextEncoder',
  'TextDecoder',
  'URL',
  'URLSearchParams',
  'AbortController',
  'AbortSignal',
  'fetch',
  'performance',
  'WebAssembly',
  'EventTarget',
  'Event',
  'MessageChannel',
  'Blob',
  'crypto',
  'atob',
  'btoa',
]);
const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, '')));

function bump(c: Counts, k: string): void {
  c[k] = (Object.hasOwn(c, k) ? (c[k] ?? 0) : 0) + 1;
}

function builtinName(spec: string): string | undefined {
  const bare = spec.replace(/^node:/, '');
  return BUILTINS.has(bare) || spec.startsWith('node:') ? bare : undefined;
}

function walkFiles(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walkFiles(p, out);
    } else if (/\.(c|m)?js$/.test(e.name)) {
      out.push(p);
    }
  }
}

function stringArg(call: ts.CallExpression): string | undefined {
  const a = call.arguments[0];
  return a !== undefined && ts.isStringLiteralLike(a) ? a.text : undefined;
}

function scanFile(text: string, scan: PackageScan): void {
  const sf = ts.createSourceFile('f.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const binding = new Map<string, string>(); // local name → built-in module
  const mod = (name: string) => (scan.modules[name] ??= { sites: 0, members: {} });

  function bindPattern(name: ts.BindingName, m: string): void {
    if (ts.isIdentifier(name)) binding.set(name.text, m);
    else if (ts.isObjectBindingPattern(name)) {
      for (const el of name.elements) {
        const key = el.propertyName ?? el.name;
        if (ts.isIdentifier(key)) bump(mod(m).members, key.text);
      }
    }
  }

  function visit(n: ts.Node): void {
    if (ts.isCallExpression(n)) {
      const isRequire = ts.isIdentifier(n.expression) && n.expression.text === 'require';
      const isImport = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      if (isRequire || isImport) {
        const spec = stringArg(n);
        const m = spec === undefined ? undefined : builtinName(spec);
        if (spec === undefined && isRequire) scan.computedRequire++;
        if (m !== undefined) {
          mod(m).sites++;
          const p = n.parent;
          if (ts.isVariableDeclaration(p)) bindPattern(p.name, m);
          else if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            if (ts.isIdentifier(p.left)) binding.set(p.left.text, m);
          } else if (ts.isPropertyAccessExpression(p)) bump(mod(m).members, p.name.text);
        }
      }
    } else if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const m = builtinName(n.moduleSpecifier.text);
      const clause = n.importClause;
      if (m !== undefined) {
        mod(m).sites++;
        if (clause?.name !== undefined) binding.set(clause.name.text, m);
        const nb = clause?.namedBindings;
        if (nb !== undefined && ts.isNamespaceImport(nb)) binding.set(nb.name.text, m);
        if (nb !== undefined && ts.isNamedImports(nb)) {
          for (const el of nb.elements) bump(mod(m).members, (el.propertyName ?? el.name).text);
        }
      }
    } else if (
      ts.isExportDeclaration(n) &&
      n.moduleSpecifier !== undefined &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      const m = builtinName(n.moduleSpecifier.text);
      if (m !== undefined) mod(m).sites++;
    } else if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
      const m = binding.get(n.expression.text);
      if (m !== undefined) bump(mod(m).members, n.name.text);
    } else if (ts.isIdentifier(n) && GLOBALS.has(n.text)) {
      const p = n.parent;
      const isName =
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isVariableDeclaration(p) && p.name === n) ||
        ts.isParameter(p) ||
        ts.isFunctionDeclaration(p) ||
        ts.isBindingElement(p) ||
        ts.isImportSpecifier(p) ||
        ts.isMethodDeclaration(p);
      if (!isName) {
        const g = (scan.globals[n.text] ??= { uses: 0, members: {} });
        g.uses++;
        if (ts.isPropertyAccessExpression(p) && p.expression === n) bump(g.members, p.name.text);
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
}

const result: PackageScan[] = [];
const storeDirs = readdirSync(STORE);
for (const [prefix, name, subs] of CORPUS) {
  const dir = storeDirs.find((d) => d.startsWith(prefix));
  if (dir === undefined) throw new Error(`corpus package not installed: ${prefix}`);
  const root = join(STORE, dir, 'node_modules', name);
  const pkg: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const version =
    typeof pkg === 'object' && pkg !== null && 'version' in pkg && typeof pkg.version === 'string'
      ? pkg.version
      : '?';
  const files: string[] = [];
  for (const sub of subs.length === 0 ? [''] : subs) {
    const p = join(root, sub);
    if (statSync(p).isDirectory()) walkFiles(p, files);
    else files.push(p);
  }
  const scan: PackageScan = {
    name,
    version,
    files: files.length,
    bytes: 0,
    modules: {},
    globals: {},
    computedRequire: 0,
  };
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    scan.bytes += Buffer.byteLength(text);
    scanFile(text, scan);
  }
  result.push(scan);
}
function top(c: Counts, n: number): string {
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
}

function markdown(): string {
  const mods = new Map<string, { pkgs: string[]; sites: number; members: Counts }>();
  const globs = new Map<string, { pkgs: string[]; uses: number; members: Counts }>();
  for (const p of result) {
    for (const [m, v] of Object.entries(p.modules)) {
      const a = mods.get(m) ?? { pkgs: [], sites: 0, members: {} };
      a.pkgs.push(p.name);
      a.sites += v.sites;
      for (const [k, c] of Object.entries(v.members))
        a.members[k] = (Object.hasOwn(a.members, k) ? (a.members[k] ?? 0) : 0) + c;
      mods.set(m, a);
    }
    for (const [g, v] of Object.entries(p.globals)) {
      const a = globs.get(g) ?? { pkgs: [], uses: 0, members: {} };
      a.pkgs.push(p.name);
      a.uses += v.uses;
      for (const [k, c] of Object.entries(v.members))
        a.members[k] = (Object.hasOwn(a.members, k) ? (a.members[k] ?? 0) : 0) + c;
      globs.set(g, a);
    }
  }
  const lines = [
    `# Corpus scan (${process.version})`,
    '',
    'Generated by `scan.ts --md`; raw counts in `scan.json`. Member counts are lexical (see scan.ts).',
    '',
    '| Package | Version | Files | Bytes | Built-ins | Computed `require` |',
    '| --- | --- | --- | --- | --- | --- |',
    ...result.map(
      (p) =>
        `| ${p.name} | ${p.version} | ${p.files} | ${p.bytes} | ${Object.keys(p.modules).length} | ${p.computedRequire} |`,
    ),
    '',
    `## Built-in modules (${mods.size}), by number of packages using them`,
    '',
    '| Module | Packages | Sites | Top members |',
    '| --- | --- | --- | --- |',
    ...[...mods.entries()]
      .sort((a, b) => b[1].pkgs.length - a[1].pkgs.length || b[1].sites - a[1].sites)
      .map(([m, a]) => `| ${m} | ${a.pkgs.length} | ${a.sites} | ${top(a.members, 12)} |`),
    '',
    '## Node globals',
    '',
    '| Global | Packages | Uses | Top members |',
    '| --- | --- | --- | --- |',
    ...[...globs.entries()]
      .sort((a, b) => b[1].pkgs.length - a[1].pkgs.length || b[1].uses - a[1].uses)
      .map(([g, a]) => `| ${g} | ${a.pkgs.length} | ${a.uses} | ${top(a.members, 12)} |`),
    '',
  ];
  return lines.join('\n');
}

process.stdout.write(
  process.argv.includes('--md')
    ? markdown()
    : `${JSON.stringify({ node: process.version, corpus: result }, null, 1)}\n`,
);

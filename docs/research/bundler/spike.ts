// T12.0 spike: bundle `js`-mode fixtures with Vite, compile the bundle with Stator, compare with Node.
// Usage: node docs/research/bundler/spike.ts --vite <dir> [--out <dir>] [--runs <n>]
//   --vite  a directory whose node_modules/vite is the Vite to measure. Vite is NOT a repo
//           dependency (T12.2 adds it), so install it outside the workspace, e.g.
//           `mkdir /some/dir && cd /some/dir && pnpm add vite@8.3.1`.
//   --out   scratch output (default `.spike/bundler`, never committed).
//   --runs  timed runs per binary; the median is reported (default 5).
// Prints one JSON report on stdout. Every case writes its inputs to `<out>/<case>/src`, so a
// failing case can be rerun by hand. Not part of `ci`: research only (docs/BUNDLER.md).
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { SourceMap, builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'packages/compiler/src/cli/main.ts');
const GOLDEN = join(ROOT, 'packages/tests/golden');

type Args = { vite: string; out: string; runs: number };

function parseArgs(argv: readonly string[]): Args {
  let vite: string | undefined;
  let out = join(ROOT, '.spike/bundler');
  let runs = 5;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) break;
    if (flag === '--vite') vite = resolve(value);
    else if (flag === '--out') out = resolve(value);
    else if (flag === '--runs') runs = Number.parseInt(value, 10);
    else continue;
    i += 1;
  }
  if (vite === undefined) throw new Error('--vite <dir> is required (see the header)');
  return { vite, out, runs };
}

type ViteBuild = (config: object) => Promise<unknown>;

type Vite = { build: ViteBuild; esmExternalRequire: (config: object) => object; version: string };

async function loadVite(dir: string): Promise<Vite> {
  const pkgDir = join(dir, 'node_modules/vite');
  const pkg: unknown = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const mod: unknown = await import(pathToFileURL(join(pkgDir, 'dist/node/index.js')).href);
  if (typeof mod !== 'object' || mod === null || !('build' in mod))
    throw new Error('no vite.build');
  const build = mod.build;
  if (typeof build !== 'function') throw new Error('vite.build is not a function');
  // Rolldown's builtin plugin, re-exported by Vite 8: static require('<external>') -> import.
  const plugin = 'esmExternalRequirePlugin' in mod ? mod.esmExternalRequirePlugin : undefined;
  if (typeof plugin !== 'function') throw new Error('vite.esmExternalRequirePlugin missing');
  const version =
    typeof pkg === 'object' && pkg !== null && 'version' in pkg && typeof pkg.version === 'string'
      ? pkg.version
      : 'unknown';
  return {
    build: (config) => Promise.resolve(build(config)),
    esmExternalRequire: (config) => {
      const made: unknown = plugin(config);
      if (typeof made !== 'object' || made === null) throw new Error('plugin is not an object');
      return made;
    },
    version,
  };
}

type Bundler = 'ssr' | 'lib';
/** `contract` is the output contract BUNDLER.md §2 proposes; `vite` keeps Vite's own output
 * defaults (Vite 8 sets Rolldown's `topLevelVar: true`, turning top-level let/const into var). */
type Output = 'contract' | 'vite';

/** One ESM chunk, dynamic import() inlined, no minification, a source map, `std/*` external
 * (node built-ins are external in an SSR build). */
function viteConfig(
  srcDir: string,
  entry: string,
  outDir: string,
  kind: Bundler,
  flavor: Output = 'contract',
  plugins: readonly object[] = [],
): object {
  const output = {
    format: 'es',
    codeSplitting: false,
    entryFileNames: 'bundle.js',
    ...(flavor === 'contract' ? { topLevelVar: false } : {}),
  };
  const common = {
    configFile: false,
    root: srcDir,
    logLevel: 'silent',
    mode: 'production',
    plugins,
  };
  const build = {
    outDir,
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    target: 'esnext',
    copyPublicDir: false,
    rolldownOptions: { external: [/^std\//], output },
  };
  if (kind === 'ssr') {
    return {
      ...common,
      ssr: { noExternal: true, target: 'node' },
      build: { ...build, ssr: entry },
    };
  }
  return { ...common, build: { ...build, lib: { entry, formats: ['es'], fileName: 'bundle' } } };
}

type Run = { status: number | null; stdout: string; stderr: string; ms: number };

function run(cmd: string, args: readonly string[], cwd: string): Run {
  const t0 = performance.now();
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
  const ms = performance.now() - t0;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, ms };
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? Number.NaN;
}

type Explain = { verdict: string; code?: string; diagnostics?: readonly Diag[] };
type Diag = { file: string; line: number; column: number; code: string; message: string };

function explain(entry: string): Explain {
  const r = run(process.execPath, [CLI, 'explain', entry, '--mode=js', '--json'], ROOT);
  const parsed: unknown = JSON.parse(r.stdout);
  if (typeof parsed !== 'object' || parsed === null || !('verdict' in parsed)) {
    throw new Error(`explain ${entry}: ${r.stdout}${r.stderr}`);
  }
  // explain's JSON is docs/MODES.md §6; the spike reads only the documented fields.
  return parsed as Explain;
}

type Measured = {
  verdict: string;
  code?: string;
  diagnostics?: number;
  built: boolean;
  buildMs?: number;
  binaryBytes?: number;
  runMedianMs?: number;
  matchesNode?: boolean;
  firstDiagnostic?: string;
  exit?: number | null;
  stdout?: string;
};

function measure(entry: string, bin: string, expected: string | undefined, runs: number): Measured {
  const ex = explain(entry);
  const base: Measured = { verdict: ex.verdict, built: false };
  if (ex.code !== undefined) base.code = ex.code;
  if (ex.diagnostics !== undefined) {
    base.diagnostics = ex.diagnostics.length;
    const d = ex.diagnostics[0];
    if (d !== undefined) base.firstDiagnostic = `${d.code} ${d.message}`;
  }
  const b = run(process.execPath, [CLI, 'build', entry, '-o', bin, '--mode=js'], ROOT);
  if (b.status !== 0) return base;
  const times: number[] = [];
  let last: Run = { status: null, stdout: '', stderr: '', ms: 0 };
  for (let i = 0; i < runs; i += 1) {
    last = run(bin, [], dirname(bin));
    times.push(last.ms);
  }
  const stdout = last.stdout;
  const m: Measured = {
    ...base,
    exit: last.status,
    built: true,
    buildMs: Math.round(b.ms),
    binaryBytes: statSync(bin).size,
    runMedianMs: Math.round(median(times) * 10) / 10,
  };
  if (expected !== undefined) m.matchesNode = stdout === expected;
  if (stdout !== expected) m.stdout = stdout;
  return m;
}

function write(dir: string, files: Readonly<Record<string, string>>): void {
  for (const [name, text] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
}

/** Inputs no golden fixture covers: generated, so the repo carries no extra `.js` (§0.10). */
const GENERATED: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // Q4: CommonJS from node_modules — `exports.x`, `module.exports =` replacement, nested require.
  cjs: {
    'main.js': [
      "import { greet, count } from 'cjs-named';",
      "import square from 'cjs-replace';",
      "console.log(greet('stator'), count);",
      'console.log(square(7));',
      '',
    ].join('\n'),
    'node_modules/cjs-named/package.json': '{ "name": "cjs-named", "main": "index.js" }\n',
    'node_modules/cjs-named/index.js': [
      "const helper = require('./helper.js');",
      'exports.greet = (name) => helper.prefix + name;',
      'exports.count = 3;',
      '',
    ].join('\n'),
    'node_modules/cjs-named/helper.js': "module.exports = { prefix: 'hi ' };\n",
    'node_modules/cjs-replace/package.json': '{ "name": "cjs-replace", "main": "index.js" }\n',
    'node_modules/cjs-replace/index.js': 'module.exports = function square(n) { return n * n; };\n',
  },
  // Q4 edges: a built-in required from CJS, computed require, __filename/__dirname.
  cjs_edges: {
    'main.js':
      "import { base, dir, load } from 'edge';\nconsole.log(base, dir, load('five.js'));\n",
    'node_modules/edge/package.json': '{ "name": "edge", "main": "index.js" }\n',
    'node_modules/edge/index.js': [
      "const path = require('path');",
      'exports.base = path.basename(__filename);',
      'exports.dir = typeof __dirname;',
      "exports.load = (n) => require('./' + n);",
      '',
    ].join('\n'),
    'node_modules/edge/five.js': 'module.exports = 5;\n',
  },
  // Q1 option B's cost: all package bodies run at the FIRST package import, so a project module
  // imported between two packages moves (Node order: pkg-a, a, pkg-b, main).
  order: {
    'main.js':
      "import 'pkg-a';\nimport './a.js';\nimport { v } from 'pkg-b';\nconsole.log('main', v);\n",
    'a.js': "console.log('a');\n",
    'node_modules/pkg-a/package.json':
      '{ "name": "pkg-a", "type": "module", "main": "index.js" }\n',
    'node_modules/pkg-a/index.js': "console.log('pkg-a');\n",
    'node_modules/pkg-b/package.json':
      '{ "name": "pkg-b", "type": "module", "main": "index.js" }\n',
    'node_modules/pkg-b/index.js': "console.log('pkg-b');\nexport const v = 1;\n",
  },
  // Q4: a CommonJS PROJECT entry (the `_tsc.js` shape): routed to the bundler whole.
  cjs_entry: {
    'main.cjs': [
      "const path = require('path');",
      "const { two } = require('./lib.cjs');",
      "console.log(path.basename('/a/b.txt'), two);",
      '',
    ].join('\n'),
    'lib.cjs': 'exports.two = 2;\n',
  },
  // Q3: node built-ins and std/* must stay external.
  externals: {
    'main.js': [
      "import { basename } from 'node:path';",
      "import { join } from 'path';",
      "console.log(basename('/a/b.txt'), join('a', 'b'));",
      '',
    ].join('\n'),
  },
  std: {
    'main.js': "import { getenv } from 'std/env';\nconsole.log(typeof getenv);\n",
  },
  // Q1, mixed graph: typed project .ts over an untyped ESM package from node_modules.
  typed_app: {
    'main.ts': [
      "import { pad } from 'leftpad-esm';",
      "import { fib } from './kernel.ts';",
      'const n: number = 30;',
      'const r: number = fib(n);',
      'console.log(pad(`${r}`, 10));',
      '',
    ].join('\n'),
    'kernel.ts': [
      'export function fib(value: number): number {',
      '  return value < 2 ? value : fib(value - 1) + fib(value - 2);',
      '}',
      '',
    ].join('\n'),
    'node_modules/leftpad-esm/package.json':
      '{ "name": "leftpad-esm", "type": "module", "main": "index.js" }\n',
    'node_modules/leftpad-esm/index.js': [
      'export function pad(s, n) {',
      '  let out = s;',
      "  while (out.length < n) out = ' ' + out;",
      '  return out;',
      '}',
      'export function unused(s) { return s + s; }',
      '',
    ].join('\n'),
  },
  // T12.2 preview: import one function from a module that exports forty.
  treeshake: {
    'main.js': "import { f0 } from './big.js';\nconsole.log(f0(1));\n",
    'big.js': Array.from(
      { length: 40 },
      (_, i) =>
        `export function f${i}(x) {\n  const parts = [];\n  for (let k = 0; k < ${i + 3}; k += 1) parts.push('' + (x + k * ${i}));\n  return parts.join('-');\n}\n`,
    ).join(''),
  },
  // Q1: a .ts annotation over a JS value that lies. Unbundled, Stator checks it at the boundary
  // (STA2001); bundled, the annotation is gone, so nothing checks it — as in Node.
  boundary: {
    'main.ts':
      "import { wrap } from './wrap.js';\nconst factor: number = wrap('\"s\"');\nconsole.log(factor);\n",
    'wrap.js': 'export function wrap(x) {\n  return JSON.parse(x);\n}\n',
  },
  // The same lie with an inferred `string` return: tsc reports TS2322 on main.ts, Stator neither
  // reports it nor checks the boundary (found by this spike; see BUNDLER.md §1).
  boundary_inferred: {
    'main.ts':
      "import { wrap } from './wrap.js';\nconst factor: number = wrap(10);\nconsole.log(factor);\n",
    'wrap.js': 'export function wrap(x) {\n  return `${x}`;\n}\n',
  },
  // Q6: a not-yet construct inside a dependency, at a known line of the original file.
  diag: {
    'main.js': "import { make } from './dep.js';\nconsole.log(make());\n",
    'dep.js': [
      '// line 1',
      'export function make() {',
      '  const target = {};',
      '  return new Proxy(target, {});',
      '}',
      '',
    ].join('\n'),
  },
};

type Case = { name: string; entry: string; fromGolden?: string };

const CASES: readonly Case[] = [
  { name: 'modules', entry: 'main.js', fromGolden: 'js/modules' },
  { name: 'mixed_graph', entry: 'main.ts', fromGolden: 'js/mixed_graph' },
  { name: 'dynamic_import', entry: 'main.js', fromGolden: 'js/dynamic_import' },
  { name: 'exitcheck', entry: 'main.ts', fromGolden: 'ts/exitcheck' },
  { name: 'nbody', entry: 'nbody.ts' },
  { name: 'fib', entry: 'fib.ts' },
  { name: 'cjs', entry: 'main.js' },
  { name: 'cjs_edges', entry: 'main.js' },
  { name: 'cjs_entry', entry: 'main.cjs' },
  { name: 'order', entry: 'main.js' },
  { name: 'externals', entry: 'main.js' },
  { name: 'std', entry: 'main.js' },
  { name: 'typed_app', entry: 'main.ts' },
  { name: 'boundary', entry: 'main.ts' },
  { name: 'boundary_inferred', entry: 'main.ts' },
  { name: 'treeshake', entry: 'main.js' },
  { name: 'diag', entry: 'main.js' },
];

function prepare(c: Case, srcDir: string): void {
  rmSync(srcDir, { recursive: true, force: true });
  mkdirSync(srcDir, { recursive: true });
  if (c.fromGolden !== undefined) cpSync(join(GOLDEN, c.fromGolden), srcDir, { recursive: true });
  else if (c.name === 'nbody' || c.name === 'fib') {
    cpSync(join(ROOT, `packages/tests/bench/programs/${c.name}.ts`), join(srcDir, c.entry));
  } else {
    const files = GENERATED[c.name];
    if (files === undefined) throw new Error(`no inputs for ${c.name}`);
    write(srcDir, files);
  }
}

/** Q6: map every diagnostic in the bundle back through the bundle's source map. */
function mapBack(bundleDir: string, ex: Explain): string[] {
  const payload: unknown = JSON.parse(readFileSync(join(bundleDir, 'bundle.js.map'), 'utf8'));
  if (typeof payload !== 'object' || payload === null) return [];
  // node:module's SourceMap takes the raw v3 payload (Node docs: module.SourceMap).
  const map = new SourceMap(payload as ConstructorParameters<typeof SourceMap>[0]);
  return (ex.diagnostics ?? []).map((d) => {
    // `SourceOrigin | {}` in @types/node; the docs also allow undefined when nothing maps.
    const origin: unknown = map.findOrigin(d.line, d.column);
    const at = `${d.code} bundle.js:${d.line}:${d.column}`;
    if (typeof origin !== 'object' || origin === null || !('fileName' in origin)) {
      return `${at} -> (no mapping)`;
    }
    const line = 'lineNumber' in origin ? String(origin.lineNumber) : '?';
    const column = 'columnNumber' in origin ? String(origin.columnNumber) : '?';
    return `${at} -> ${String(origin.fileName)}:${line}:${column}`;
  });
}

/** Q4: what a `vite-stator` transform hook would do — give each CJS module its own
 * `__filename`/`__dirname`, which Rolldown leaves free (they then fail even on Node). */
const cjsGlobals = {
  name: 'spike-cjs-globals',
  transform(code: string, id: string): { code: string; map: null } | null {
    if (!/\b__(?:file|dir)name\b/.test(code)) return null;
    const head = `var __filename = ${JSON.stringify(id)}, __dirname = ${JSON.stringify(dirname(id))};`;
    return { code: `${head}\n${code}`, map: null };
  },
};

function firstLine(text: string): string {
  return text.split('\n').find((l) => /^(?:\w*Error\b|PANIC)/.test(l)) ?? text.split('\n')[0] ?? '';
}

const BUILTINS = new Set(builtinModules);

/** A bare specifier the bundler must resolve: not relative, not `node:`/built-in, not `std/`. */
function isPackage(spec: string): boolean {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return false;
  return !spec.startsWith('std/') && !BUILTINS.has(spec);
}

/** The vendor's export name for `name` from `spec`: the name itself while no other package
 * claims it (Stator does not lower `export { x as y }` yet — STA1214), mangled otherwise. */
function exportName(owners: Map<string, string>, spec: string, name: string): string {
  const owner = owners.get(name);
  if (name !== 'default' && (owner === undefined || owner === spec)) {
    owners.set(name, spec);
    return name;
  }
  return `${spec.replace(/[^A-Za-z0-9]/g, '_')}$${name}`;
}

/** Q1 option B ("bundle the dependencies, not the project"): every project file keeps its own
 * module; the package imports of all of them become ONE generated vendor entry, bundled once,
 * and each project import is rewritten to a named import from it. Returns the rewritten entry,
 * or undefined when the project imports no package (then nothing is bundled at all). */
async function depsOnly(
  build: ViteBuild,
  srcDir: string,
  entry: string,
  outDir: string,
): Promise<{ entry: string; vendorBytes: number; vendorLines: number } | undefined> {
  const app = join(outDir, 'app');
  rmSync(app, { recursive: true, force: true });
  const exports: string[] = [];
  const owners = new Map<string, string>();
  const mangle = (spec: string, name: string): string => exportName(owners, spec, name);
  const reexport = (spec: string, name: string): string => {
    const out = mangle(spec, name);
    return out === name ? name : `${name} as ${out}`;
  };
  const rewritten = new Map<string, string>();
  const project = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter(
    (f) => !f.startsWith('node_modules') && /\.(?:ts|js)$/.test(f) && !f.endsWith('.d.ts'),
  );
  for (const rel of project) {
    const text = readFileSync(join(srcDir, rel), 'utf8');
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.ESNext, true);
    let out = '';
    let at = 0;
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const spec = st.moduleSpecifier.text;
      if (!isPackage(spec)) continue;
      const clause = st.importClause;
      const local: string[] = [];
      if (clause === undefined) exports.push(`import '${spec}';`);
      else {
        if (clause.name !== undefined) {
          exports.push(`export { default as ${mangle(spec, 'default')} } from '${spec}';`);
          local.push(`${mangle(spec, 'default')} as ${clause.name.text}`);
        }
        const nb = clause.namedBindings;
        if (nb !== undefined && ts.isNamespaceImport(nb)) {
          exports.push(`export * as ${mangle(spec, 'ns')} from '${spec}';`);
          local.push(`${mangle(spec, 'ns')} as ${nb.name.text}`);
        } else if (nb !== undefined) {
          for (const el of nb.elements) {
            const imported = (el.propertyName ?? el.name).text;
            exports.push(`export { ${reexport(spec, imported)} } from '${spec}';`);
            const name = mangle(spec, imported);
            local.push(name === el.name.text ? name : `${name} as ${el.name.text}`);
          }
        }
      }
      const depth = rel.split('/').length - 1;
      const vendorSpec = `${depth === 0 ? './' : '../'.repeat(depth)}__vendor.js`;
      const replacement =
        local.length === 0
          ? `import '${vendorSpec}';`
          : `import { ${local.join(', ')} } from '${vendorSpec}';`;
      out += text.slice(at, st.getStart()) + replacement;
      at = st.getEnd();
    }
    rewritten.set(rel, out + text.slice(at));
  }
  if (exports.length === 0) return undefined;
  const vendorEntry = join(srcDir, '__vendor_entry.js');
  writeFileSync(vendorEntry, `${[...new Set(exports)].join('\n')}\n`);
  const vendorOut = join(outDir, 'vendor-out');
  await build(viteConfig(srcDir, vendorEntry, vendorOut, 'ssr'));
  rmSync(vendorEntry);
  for (const [rel, text] of rewritten) write(app, { [rel]: text });
  const vendor = readFileSync(join(vendorOut, 'bundle.js'), 'utf8');
  writeFileSync(join(app, '__vendor.js'), vendor);
  const appEntry = join(app, relative(srcDir, entry));
  return { entry: appEntry, vendorBytes: vendor.length, vendorLines: vendor.split('\n').length };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const t0 = performance.now();
  const { build, esmExternalRequire, version } = await loadVite(args.vite);
  const viteLoadMs = Math.round(performance.now() - t0);
  const report: Record<string, unknown> = { vite: version, node: process.version, viteLoadMs };
  for (const c of CASES) {
    const dir = join(args.out, c.name);
    const srcDir = join(dir, 'src');
    prepare(c, srcDir);
    const entry = join(srcDir, c.entry);
    const node = run(process.execPath, [entry], srcDir);
    const expected = node.status === 0 ? node.stdout : undefined;
    const row: Record<string, unknown> = { nodeStatus: node.status };
    row.none = measure(entry, join(dir, 'bin-none'), expected, args.runs);
    const outDir = join(dir, 'vite');
    const tBundle = performance.now();
    try {
      await build(viteConfig(srcDir, entry, outDir, 'ssr'));
    } catch (e) {
      row.viteError = e instanceof Error ? e.message : String(e);
      report[c.name] = row;
      continue;
    }
    row.bundleMs = Math.round(performance.now() - tBundle);
    const bundle = join(outDir, 'bundle.js');
    row.bundleBytes = statSync(bundle).size;
    row.mapPresent = existsSync(`${bundle}.map`);
    row.vite = measure(bundle, join(dir, 'bin-vite'), expected, args.runs);
    row.bundleHead = readFileSync(bundle, 'utf8').split('\n').slice(0, 3).join('\n');
    const onNode = run(process.execPath, [bundle], srcDir);
    row.nodeOnBundle =
      onNode.status === 0
        ? onNode.stdout === expected
        : `exit ${onNode.status}: ${firstLine(onNode.stderr)}`;
    const defaultOut = join(dir, 'vite-default');
    await build(viteConfig(srcDir, entry, defaultOut, 'ssr', 'vite'));
    row.viteDefault = measure(
      join(defaultOut, 'bundle.js'),
      join(dir, 'bin-vite-default'),
      expected,
      args.runs,
    );
    if (c.name === 'diag' || c.name === 'cjs') row.mapped = mapBack(outDir, explain(bundle));
    const deps = await depsOnly(build, srcDir, entry, dir);
    if (deps === undefined) row.depsOnly = 'no package imports: nothing to bundle, same as none';
    else {
      const m = measure(deps.entry, join(dir, 'bin-deps'), expected, args.runs);
      row.depsOnly = { ...m, vendorBytes: deps.vendorBytes, vendorLines: deps.vendorLines };
    }
    if (c.name === 'cjs_edges' || c.name === 'cjs_entry') {
      const pluginOut = join(dir, 'vite-plugin');
      const external = [/^node:/, ...builtinModules];
      const plugins = [cjsGlobals, esmExternalRequire({ external })];
      await build(viteConfig(srcDir, entry, pluginOut, 'ssr', 'contract', plugins));
      const pluginBundle = join(pluginOut, 'bundle.js');
      const r = run(process.execPath, [pluginBundle], srcDir);
      row.nodeOnPluginBundle =
        r.status === 0 ? r.stdout : `exit ${r.status}: ${firstLine(r.stderr)}`;
      row.pluginBundle = readFileSync(pluginBundle, 'utf8');
      row.pluginExplain = (explain(pluginBundle).diagnostics ?? []).map(
        (d) => `${d.line}:${d.column} ${d.code} ${d.message}`,
      );
    }
    if (c.name === 'externals') {
      const libOut = join(dir, 'vite-lib');
      await build(viteConfig(srcDir, entry, libOut, 'lib'));
      row.libModeBundle = readFileSync(join(libOut, 'bundle.js'), 'utf8');
    }
    report[c.name] = row;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();

/* The bundler API (plan.md §11d T12.1, docs/BUNDLER.md §4–§7): the vendor entry, the rewrite of
 * package imports, adapter loading and its two failure codes, and diagnostics mapped through the
 * bundle's source map. Every adapter here is a stub: the compiler imports no bundler. */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, test } from 'vitest';
import {
  type BundleResult,
  type BundlerAdapter,
  compile,
  type VendorEntry,
  vendorEntry,
} from '../../compiler/src/api.ts';
import { createProgram } from '../../compiler/src/frontend/program.ts';
import { NATIVE_ONLY } from './helpers.ts';
import {
  bundleExportNames,
  isCommonJsFile,
  planVendor,
  sameLines,
  VENDOR_MODULE_NAME,
} from '../../compiler/src/frontend/vendor.ts';

const CLI = fileURLToPath(new URL('../../compiler/src/cli/main.ts', import.meta.url));

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A project on disk: `files` maps relative paths to text. The root is the real path, because
 * the program names files by it (macOS's tmpdir is a symlink). */
function project(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stator-bundler-')));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(value: number): string {
  let rest = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = rest & 31;
    rest >>>= 5;
    if (rest > 0) digit |= 32;
    out += B64[digit] ?? '';
  } while (rest > 0);
  return out;
}

/** A map from bundle line i to `source` line `lines[i]` (1-indexed), column 1; `undefined`
 * leaves the bundle line unmapped, the way a bundler's runtime helper is. */
function lineMap(source: string, lines: readonly (number | undefined)[]): BundleResult['map'] {
  let previous = 1;
  const mappings = lines.map((line) => {
    if (line === undefined) return '';
    const segment = `AA${vlq(line - previous)}A`;
    previous = line;
    return segment;
  });
  return { version: 3, sources: [source], names: [], mappings: mappings.join(';') };
}

const LEFTPAD = [
  'export function pad(s, n) {',
  '  let out = s;',
  "  while (out.length < n) out = ' ' + out;",
  '  return out;',
  '}',
  'export const P = new Proxy({}, {});',
  '',
].join('\n');

/** An adapter that "bundles" by serving the leftpad file as is, mapped line for line, plus
 * `helper` lines with no mapping. Counts its calls. */
function stubAdapter(helper: readonly string[] = []): BundlerAdapter & { calls: VendorEntry[] } {
  const calls: VendorEntry[] = [];
  return {
    name: 'stub',
    calls,
    bundle(entry: VendorEntry): Promise<BundleResult> {
      calls.push(entry);
      const file = join(entry.resolveDir, 'node_modules/leftpad/index.js');
      const lines = readFileSync(file, 'utf8').split('\n');
      const code = [...lines, ...helper].join('\n');
      const map = lineMap('node_modules/leftpad/index.js', [
        ...lines.map((_, index) => index + 1),
        ...helper.map(() => undefined),
      ]);
      return Promise.resolve({ code, map, inputs: [file] });
    },
  };
}

function leftpadProject(main: string): string {
  return project({
    'package.json': '{"type":"module"}',
    'node_modules/leftpad/package.json': '{"name":"leftpad","type":"module","main":"index.js"}',
    'node_modules/leftpad/index.js': LEFTPAD,
    'main.js': main,
  });
}

test('the vendor entry: named, default, namespace and side-effect imports; mangled on collision', () => {
  const root = project({
    'main.js': [
      "import { pad, shared } from 'leftpad';",
      "import fmt from 'fmt';",
      "import * as util from '@scope/util';",
      "import 'polyfill';",
      "import { shared as other, 'a-b' as ab } from 'fmt';",
      "export { pad as leftPad } from 'leftpad';",
      "import { readFileSync } from 'node:fs';",
      "import { join } from 'path';",
      "import { x } from './local.js';",
      'console.log(pad, shared, fmt, util, other, ab, readFileSync, join, x);',
      '',
    ].join('\n'),
    'local.js': 'export const x = 1;\n',
  });
  assert.deepEqual(vendorEntry(join(root, 'main.js'), 'js'), {
    code: [
      'export { pad } from "leftpad";',
      'export { shared as leftpad$shared } from "leftpad";',
      'export { default as fmt$default } from "fmt";',
      'export * as _scope_util$ns from "@scope/util";',
      'import "polyfill";',
      'export { shared as fmt$shared } from "fmt";',
      'export { "a-b" as fmt$a_b } from "fmt";',
      '',
    ].join('\n'),
    resolveDir: root,
  });
});

test('no package import and no CommonJS file: no vendor entry; ts mode never has one', () => {
  const root = project({
    'main.js': "import { x } from './a.js';\nconsole.log(x);\n",
    'a.js': 'export const x = 1;\n',
  });
  assert.equal(vendorEntry(join(root, 'main.js'), 'js'), undefined);
  const ts = project({ 'main.ts': "import { pad } from 'leftpad';\nconsole.log(pad);\n" });
  assert.equal(vendorEntry(join(ts, 'main.ts'), 'ts'), undefined);
});

test('the rewrite keeps every line and splits type-only names onto the original module', () => {
  const source = [
    'import {',
    '  pad,',
    '  type Options,',
    "} from 'leftpad';",
    "import def, * as ns from 'fmt';",
    'console.log(pad, def, ns);',
    '',
  ].join('\n');
  const root = project({ 'main.ts': source });
  const { program } = createProgram(join(root, 'main.ts'), 'js');
  const entry = program.getSourceFile(join(root, 'main.ts'));
  assert.ok(entry !== undefined);
  const plan = planVendor(program, entry, false);
  assert.ok(plan !== undefined);
  assert.equal(plan.modulePath, `${root}/${VENDOR_MODULE_NAME}`);
  const rewritten = plan.rewrites(undefined).get(entry.fileName) ?? '';
  assert.equal(rewritten.split('\n').length, source.split('\n').length);
  const lines = rewritten.split('\n').map((line) => line.trimEnd());
  assert.equal(
    lines[0],
    `import { pad } from "./${VENDOR_MODULE_NAME}"; import type { Options } from "leftpad";`,
  );
  assert.deepEqual(lines.slice(1, 4), ['', '', '']);
  assert.match(lines[4] ?? '', /fmt\$default as def/);
  assert.match(lines[4] ?? '', /fmt\$ns as ns/);
  assert.equal(lines[5], 'console.log(pad, def, ns);');
});

/** The plan for `main.js` in a fresh project of `files`. */
function planFor(files: Record<string, string>): {
  plan: NonNullable<ReturnType<typeof planVendor>>;
  root: string;
} {
  const root = project(files);
  const { program } = createProgram(join(root, 'main.js'), 'js');
  const entry = program.getSourceFile(join(root, 'main.js'));
  assert.ok(entry !== undefined);
  const plan = planVendor(program, entry, false);
  assert.ok(plan !== undefined);
  return { plan, root };
}

test('export * from a package: the entry re-exports it whole; every named request is mangled', () => {
  const { plan, root } = planFor({
    'main.js':
      "import { pad } from 'leftpad';\nimport { a } from './more.js';\nconsole.log(pad, a);\n",
    'more.js': "export * from 'star';\nexport const own = 1;\n",
  });
  assert.equal(
    plan.entry.code,
    ['export * from "star";', 'export { pad as leftpad$pad } from "leftpad";', ''].join('\n'),
  );
  // The star re-exports the bundle's plain names: not the mangled ones, not the file's own `own`.
  const bundle = 'const a = 1, own = 2, pad = 3;\nexport { a, own, pad as leftpad$pad };\n';
  const more = plan.rewrites(bundle).get(join(root, 'more.js')) ?? '';
  assert.equal(more.split('\n')[0]?.trimEnd(), `export { a } from "./${VENDOR_MODULE_NAME}";`);
  // Without the bundle, the declaration stays as written and the gate refuses it.
  assert.equal(plan.rewrites(undefined).get(join(root, 'more.js')), undefined);
});

test('export * from two packages: the bundle cannot say which star a name came from', () => {
  const { plan, root } = planFor({
    'main.js': "export * from 'one';\nexport * from 'two';\n",
  });
  assert.equal(plan.entry.code, 'export * from "one";\nexport * from "two";\n');
  assert.equal(plan.rewrites('export const a = 1;\n').get(join(root, 'main.js')), undefined);
});

test('a bundle that re-exports an external whole has no name list', () => {
  assert.deepEqual(bundleExportNames('export const a = 1;\nexport { a as b };\n'), ['a', 'b']);
  assert.deepEqual(bundleExportNames('export default 1;\nexport function f() {}\n'), [
    'default',
    'f',
  ]);
  assert.equal(bundleExportNames('export * from "node:fs";\n'), undefined);
});

test('import attributes travel to the entry; the rewritten import drops them', () => {
  const { plan, root } = planFor({
    'main.js': [
      "import data from 'conf/data.json' with { type: 'json' };",
      "import same from 'conf/data.json';",
      "import old from 'conf/old.json' assert { type: 'json' };",
      'console.log(data, same, old);',
      '',
    ].join('\n'),
  });
  assert.equal(
    plan.entry.code,
    [
      'export { default as conf_data_json$default } from "conf/data.json" with { type: "json" };',
      'export { default as conf_data_json$default$2 } from "conf/data.json";',
      '',
    ].join('\n'),
  );
  const lines = (plan.rewrites(undefined).get(join(root, 'main.js')) ?? '').split('\n');
  assert.equal(
    lines[0]?.trimEnd(),
    `import { conf_data_json$default as data } from "./${VENDOR_MODULE_NAME}";`,
  );
  // The deprecated `assert` form is not rewritten: the gate answers it.
  assert.equal(lines[2], "import old from 'conf/old.json' assert { type: 'json' };");
});

test('sameLines pads a shorter replacement and keeps the original line breaks', () => {
  assert.equal(
    sameLines('import {\n  a,\n} from "p";', 'import { a } from "v";'),
    'import { a } from "v";\n    \n           ',
  );
  assert.equal(sameLines('import a from "p";', 'x;'), `x;${' '.repeat(16)}`);
});

test('CommonJS routing: .cjs always, "type": "commonjs", and a .js that reads require', () => {
  const root = project({
    'a.cjs': 'module.exports = 1;\n',
    'b.js': "const fs = require('fs');\nconsole.log(fs);\n",
    'c.js': 'console.log(1);\n',
    'd.js': 'export const d = 1;\nconst x = require;\n',
    'cjs/package.json': '{"type":"commonjs"}',
    'cjs/e.js': 'console.log(2);\n',
    'esm/package.json': '{"type":"module"}',
    'esm/f.js': "const fs = require('fs');\n",
    'g.js': "function require(x) { return x; }\nrequire('y');\n",
    'h.js': 'module.exports = 1;\n',
    'i.js': 'exports.a = 1;\n',
    'j.js': 'function f(exports) {\n  exports.a = 1;\n}\nf({});\n',
  });
  const verdict = (name: string): boolean => {
    const { program } = createProgram(join(root, name), 'js');
    const file = program.getSourceFile(join(root, name));
    assert.ok(file !== undefined, name);
    return isCommonJsFile(file, program.getTypeChecker());
  };
  assert.equal(verdict('a.cjs'), true);
  assert.equal(verdict('b.js'), true);
  assert.equal(verdict('c.js'), false, 'a plain script stays out of the bundler');
  assert.equal(verdict('d.js'), false, 'ES-module syntax decides');
  assert.equal(verdict('cjs/e.js'), true);
  assert.equal(verdict('esm/f.js'), false);
  assert.equal(verdict('g.js'), false, 'a declared require is not Node’s');
  // The checker declares `module` and `exports` by these very assignments; they are still Node's.
  assert.equal(verdict('h.js'), true, 'module.exports alone makes CommonJS');
  assert.equal(verdict('i.js'), true, 'exports.x alone makes CommonJS');
  assert.equal(verdict('j.js'), false, 'a parameter named exports is not Node’s');
});

test('a CommonJS entry is all bundle: the vendor entry imports it for its effects', () => {
  const root = project({
    'main.cjs': "const x = require('./x.cjs');\nconsole.log(x);\n",
    'x.cjs': 'module.exports = 1;\n',
  });
  assert.deepEqual(vendorEntry(join(root, 'main.cjs'), 'js', true), {
    code: 'import "./main.cjs";\n',
    resolveDir: root,
  });
  // Without --node a CommonJS project file is not routed: the gate answers it (plan-notes 315).
  assert.equal(vendorEntry(join(root, 'main.cjs'), 'js'), undefined);
});

test('--node gates CommonJS routing of project files: STA1110 without it (plan-notes 315)', async () => {
  const root = project({ 'main.cjs': 'exports.n = 1;\nconsole.log(exports.n);\n' });
  const entry = join(root, 'main.cjs');
  const bundle: BundleResult = {
    code: 'console.log(1);\n',
    map: lineMap('main.cjs', [2]),
    inputs: [],
  };
  const routed = await compile({ entry, mode: 'js', node: true, bundle });
  assert.equal(routed.ok, true, routed.stderr);
  const refused = await compile({ entry, mode: 'js', bundle });
  assert.equal(refused.ok, false);
  assert.deepEqual(
    refused.diagnostics.map((d) => [d.code, d.line, d.message]),
    [
      [
        'STA1110',
        1,
        'CommonJS exports is not supported — without --node, Stator uses ES modules only',
      ],
      [
        'STA1110',
        2,
        'CommonJS exports is not supported — without --node, Stator uses ES modules only',
      ],
    ],
  );
});

test('compile: the bundle joins the program and #line names the package file', async () => {
  const root = leftpadProject("import { pad } from 'leftpad';\nconsole.log(pad('x', 3));\n");
  writeFileSync(
    join(root, 'node_modules/leftpad/index.js'),
    LEFTPAD.replace(/^export const P.*$/m, ''),
  );
  const adapter = stubAdapter();
  const result = await compile({ entry: join(root, 'main.js'), mode: 'js', bundler: adapter });
  assert.equal(result.ok, true, result.stderr);
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(adapter.calls[0], {
    code: 'export { pad } from "leftpad";\n',
    resolveDir: root,
  });
  assert.match(result.c ?? '', new RegExp(`#line 3 "${root}/node_modules/leftpad/index.js"`));
  assert.match(result.c ?? '', new RegExp(`#line 2 "${root}/main.js"`));
});

test('compile: a diagnostic in the bundle reports the original file and line', async () => {
  const root = leftpadProject("import { pad } from 'leftpad';\nconsole.log(pad('x', 3));\n");
  const result = await compile({
    entry: join(root, 'main.js'),
    mode: 'js',
    bundler: stubAdapter(),
  });
  assert.equal(result.ok, false);
  const [diagnostic] = result.diagnostics;
  assert.ok(diagnostic !== undefined, result.stderr);
  assert.equal(diagnostic.code, 'STA1214');
  assert.equal(diagnostic.file, `${root}/node_modules/leftpad/index.js`);
  assert.equal(diagnostic.line, 6);
  assert.match(result.stderr, /node_modules\/leftpad\/index\.js:6:1 STA1214/);
});

test('compile: a diagnostic in a runtime helper says it has no source mapping', async () => {
  const root = leftpadProject("import { pad } from 'leftpad';\nconsole.log(pad('x', 3));\n");
  writeFileSync(
    join(root, 'node_modules/leftpad/index.js'),
    LEFTPAD.replace(/^export const P.*$/m, ''),
  );
  const adapter = stubAdapter(['export const helper = new Proxy({}, {});']);
  const result = await compile({ entry: join(root, 'main.js'), mode: 'js', bundler: adapter });
  const [diagnostic] = result.diagnostics;
  assert.ok(diagnostic !== undefined, result.stderr);
  assert.equal(diagnostic.file, '<package bundle>');
  assert.equal(diagnostic.line, LEFTPAD.split('\n').length + 1);
  assert.match(diagnostic.message, /\(bundler runtime helper, no source mapping\)$/);
});

/** A leftpad whose `pad` trips the checker twice: a relational `<` across types and `++` on an
 * object. Both are plain JavaScript (Node compares as strings and answers `NaN`), and
 * neither is an error a package's user could fix. */
const ODD_LEFTPAD = [
  'export function pad(s, n) {',
  '  console.log([1] < {});',
  '  let o = { n: 1 };',
  '  o++;',
  '  console.log(o);',
  "  return s + '!';",
  '}',
  '',
].join('\n');

test(
  'a checker error in the vendor module does not fail the build; the binary prints what Node prints',
  NATIVE_ONLY,
  async () => {
    const main = "import { pad } from 'leftpad';\nconsole.log(pad('x', 3));\n";
    const root = leftpadProject(main);
    writeFileSync(join(root, 'node_modules/leftpad/index.js'), ODD_LEFTPAD);
    const out = join(root, 'app');
    const result = await compile({
      entry: join(root, 'main.js'),
      mode: 'js',
      bundler: stubAdapter(),
      out,
    });
    assert.equal(result.ok, true, result.stderr);
    assert.deepEqual(result.diagnostics, []);
    const node = spawnSync(process.execPath, [join(root, 'main.js')], { encoding: 'utf8' });
    assert.equal(node.stdout, 'true\nNaN\nx!\n');
    const binary = spawnSync(out, { encoding: 'utf8' });
    assert.equal(binary.stdout, node.stdout, binary.stderr);
  },
);

test('the same checker error in a project file is still STA0012', async () => {
  const root = leftpadProject(
    "import { pad } from 'leftpad';\nconsole.log(pad('x', 3), [1] < {});\n",
  );
  writeFileSync(join(root, 'node_modules/leftpad/index.js'), ODD_LEFTPAD);
  const result = await compile({
    entry: join(root, 'main.js'),
    mode: 'js',
    bundler: stubAdapter(),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.file, d.line]),
    [['STA0012', `${root}/main.js`, 2]],
  );
});

test('a vendor read in the temporal dead zone stays reported: Node throws there', async () => {
  const root = leftpadProject("import { pad } from 'leftpad';\nconsole.log(pad('x', 3));\n");
  writeFileSync(
    join(root, 'node_modules/leftpad/index.js'),
    'export function pad(s, n) {\n  const w = n + late;\n  const late = 0;\n  return s.padStart(w);\n}\n',
  );
  const result = await compile({
    entry: join(root, 'main.js'),
    mode: 'js',
    bundler: stubAdapter(),
  });
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.file, d.line]),
    [['STA0012', `${root}/node_modules/leftpad/index.js`, 2]],
  );
});

test('compile: a ready bundle needs no adapter', async () => {
  const root = leftpadProject("import { pad } from 'leftpad';\nconsole.log(pad('x', 3));\n");
  const code = 'export function pad(s, n) { return s; }\n';
  const bundle: BundleResult = {
    code,
    map: lineMap('node_modules/leftpad/index.js', [1]),
    inputs: [],
  };
  const result = await compile({ entry: join(root, 'main.js'), mode: 'js', bundle });
  assert.equal(result.ok, true, result.stderr);
});

/** Rolldown 1.2.12's shape for a CommonJS package that requires a built-in and reads its own
 * location, minus the interop helpers T12.3 compiles: `__require` is `createRequire(import.meta.url)`
 * and `__filename`/`__dirname` are left free (docs/BUNDLER.md §4). */
const EDGE_BUNDLE = [
  'import { createRequire } from "node:module";',
  'const __require = createRequire(import.meta.url);',
  'const path = __require("path");',
  'export const base = path.basename(__filename);',
  'export const dir = path.basename(__dirname);',
  'export function load(n) { try { return __require("./" + n); } catch (e) { return e.code; } }',
  'export const helper = path.basename(__filename);',
  '',
].join('\n');

test('--node: the vendor module requires a built-in and reads its location at run time', async () => {
  const main =
    "import { base, dir, load, helper } from 'edge';\nconsole.log(base, dir, load('five.js'), helper);\n";
  const root = project({
    'package.json': '{"type":"module"}',
    'node_modules/edge/package.json': '{"name":"edge","main":"index.js"}',
    'node_modules/edge/index.js': 'module.exports = {};\n',
    'main.js': main,
  });
  const out = join(root, 'app');
  const bundle: BundleResult = {
    code: EDGE_BUNDLE,
    // Lines 1-6 come from the package; line 7 stands for a bundler helper, which has no mapping.
    map: lineMap('node_modules/edge/index.js', [1, 1, 1, 2, 3, 4]),
    inputs: [],
  };
  const result = await compile({
    entry: join(root, 'main.js'),
    mode: 'js',
    bundle,
    node: true,
    out,
  });
  assert.equal(result.ok, true, result.stderr);
  const run = spawnSync(out, [], { encoding: 'utf8' });
  // `__filename` is the binary's directory joined with the file the read was written in; a read
  // with no mapping is the vendor module's own, beside the entry.
  assert.equal(run.stdout, 'index.js edge MODULE_NOT_FOUND __stator_vendor__.js\n', run.stderr);
});

test('STA0014: an adapter package that is not installed; a module path that does not exist', async () => {
  const root = leftpadProject("import { pad } from 'leftpad';\nconsole.log(pad('x', 3));\n");
  // The default, `vite-stator`, is a workspace package since T12.2 (unit/vite-stator.test.ts).
  const absent = await compile({
    entry: join(root, 'main.js'),
    mode: 'js',
    bundler: 'stator-adapter-not-installed',
  });
  assert.equal(absent.error?.code, 'STA0014');
  assert.match(
    absent.error?.message ?? '',
    /bundler adapter 'stator-adapter-not-installed' could not be loaded — install stator-adapter-not-installed/,
  );
  const missing = await compile({
    entry: join(root, 'main.js'),
    mode: 'js',
    bundler: join(root, 'nope.ts'),
  });
  assert.equal(missing.error?.code, 'STA0014');
  writeFileSync(join(root, 'empty.ts'), 'export const x = 1;\n');
  const empty = await compile({
    entry: join(root, 'main.js'),
    mode: 'js',
    bundler: join(root, 'empty.ts'),
  });
  assert.equal(empty.error?.code, 'STA0014');
  assert.match(empty.error?.message ?? '', /exports no adapter/);
});

test('an adapter module loads by path; none keeps today’s refusal', async () => {
  const root = leftpadProject("import { pad } from 'leftpad';\nconsole.log(pad('x', 3));\n");
  writeFileSync(
    join(root, 'node_modules/leftpad/index.js'),
    LEFTPAD.replace(/^export const P.*$/m, ''),
  );
  writeFileSync(
    join(root, 'adapter.ts'),
    [
      "import { readFileSync } from 'node:fs';",
      'export default {',
      "  name: 'file',",
      '  bundle(entry: { resolveDir: string }) {',
      "    const code = readFileSync(entry.resolveDir + '/node_modules/leftpad/index.js', 'utf8');",
      "    return Promise.resolve({ code, map: { version: 3, sources: [], mappings: '' }, inputs: [] });",
      '  },',
      '};',
      '',
    ].join('\n'),
  );
  const loaded = await compile({
    entry: join(root, 'main.js'),
    mode: 'js',
    bundler: join(root, 'adapter.ts'),
  });
  assert.equal(loaded.ok, true, loaded.stderr);
  const none = await compile({ entry: join(root, 'main.js'), mode: 'js', bundler: 'none' });
  assert.equal(none.ok, false);
  assert.equal(none.diagnostics[0]?.code, 'STA1214');
});

test('STA0015: bundle() rejects, or answers no valid bundle', async () => {
  const root = leftpadProject("import { pad } from 'leftpad';\nconsole.log(pad('x', 3));\n");
  const rejecting: BundlerAdapter = {
    name: 'broken',
    bundle: () => Promise.reject(new Error('Could not resolve "leftpad"')),
  };
  const rejected = await compile({ entry: join(root, 'main.js'), mode: 'js', bundler: rejecting });
  assert.deepEqual(rejected.error, {
    code: 'STA0015',
    message: 'the bundle step failed: Could not resolve "leftpad"',
  });
  const mapless = {
    name: 'mapless',
    bundle: () => Promise.resolve({ code: '', inputs: [] }),
  };
  const result = await compile({
    entry: join(root, 'main.js'),
    mode: 'js',
    bundler: mapless as unknown as BundlerAdapter,
  });
  assert.equal(result.error?.code, 'STA0015');
  assert.match(result.error?.message ?? '', /no version-3 source map/);
});

test('a graph with nothing to bundle never calls the adapter', async () => {
  const root = project({ 'main.js': "console.log('plain');\n" });
  const adapter = stubAdapter();
  const result = await compile({ entry: join(root, 'main.js'), mode: 'js', bundler: adapter });
  assert.equal(result.ok, true, result.stderr);
  assert.equal(adapter.calls.length, 0);
});

test('a parse-phase error is the answer before the bundle step (plan.md §9 Task 6.29)', async () => {
  const cases = [
    [
      "import { pad, shared as pad } from 'leftpad';\nconsole.log(pad);\n",
      /Duplicate identifier 'pad'/,
    ],
    ["import { pad as eval } from 'leftpad';\nconsole.log(eval);\n", /STA3005/],
  ] as const;
  for (const [main, expected] of cases) {
    const root = leftpadProject(main);
    const adapter = stubAdapter();
    const result = await compile({ entry: join(root, 'main.js'), mode: 'js', bundler: adapter });
    assert.equal(result.ok, false);
    assert.equal(
      adapter.calls.length,
      0,
      'the adapter must not run on a graph that does not parse',
    );
    assert.match(result.stderr, expected);
    assert.doesNotMatch(result.stderr, /STA0015|Cannot find module/);
  }
});

test('the pinned typescript still keeps the binder diagnostics where parsePhaseKeys reads them', () => {
  // A duplicate import binding is a BINDER error, not a parser one: without the binder's list
  // the parse phase loses it and a bundle step would run first (plan.md §9 Task 6.29).
  const root = project({ 'main.js': "import { a, b as a } from './dep.js';\n", 'dep.js': '' });
  const loaded = createProgram(join(root, 'main.js'), 'js');
  assert.ok(loaded.parseDiagnostics.some((d) => /Duplicate identifier 'a'/.test(d.message)));
});

test('STA3004: the default of a syntax-free ES module, in every import and re-export shape', async () => {
  const shapes = [
    "import d from './empty.js';\n",
    "import { default as d } from './empty.js';\nconsole.log(d);\n",
    "export { default } from './empty.js';\n",
  ];
  for (const main of shapes) {
    const root = project({
      'package.json': '{"type":"module"}',
      'empty.js': 'globalThis.loaded = true;\n',
      'main.js': main,
    });
    const result = await compile({ entry: join(root, 'main.js'), mode: 'js', bundler: 'none' });
    assert.match(result.stderr, /STA3004 .*empty\.js has no default export/, main);
  }
  // Without "type": "module" Node loads the same file as CommonJS, whose default is
  // module.exports: not a link error, so not this refusal.
  const commonJs = project({ 'empty.js': ';\n', 'main.js': "import d from './empty.js';\n" });
  const result = await compile({ entry: join(commonJs, 'main.js'), mode: 'js', bundler: 'none' });
  assert.doesNotMatch(result.stderr, /STA3004/);
});

test('ts mode refuses a bundler: STA0004 from the API and the CLI', async () => {
  const root = project({ 'main.ts': "console.log('x');\n" });
  const api = await compile({ entry: join(root, 'main.ts'), mode: 'ts', bundler: 'none' });
  assert.equal(api.error?.code, 'STA0004');
  const cli = spawnSync(
    process.execPath,
    [CLI, 'explain', join(root, 'main.ts'), '--bundler=none', '--no-config'],
    {
      encoding: 'utf8',
    },
  );
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /STA0004 --bundler requires --mode=js/);
});

test('the program cache keys on the overlay: a changed bundle misses, the same one hits', () => {
  const root = project({ 'main.js': "console.log('x');\n" });
  const entry = join(root, 'main.js');
  const vendor = join(root, VENDOR_MODULE_NAME);
  const first = createProgram(entry, 'js', undefined, {
    files: new Map([[vendor, 'export const a = 1;\n']]),
    key: 'a',
  });
  const again = createProgram(entry, 'js', undefined, {
    files: new Map([[vendor, 'export const a = 1;\n']]),
    key: 'a',
  });
  const changed = createProgram(entry, 'js', undefined, {
    files: new Map([[vendor, 'export const a = 2;\n']]),
    key: 'b',
  });
  assert.equal(again.program, first.program);
  assert.notEqual(changed.program, first.program);
  assert.notEqual(createProgram(entry, 'js').program, first.program);
});

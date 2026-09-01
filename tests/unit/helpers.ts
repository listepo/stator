import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { gateProgram } from '../../src/frontend/gate.ts';
import type {
  Assignment,
  BinaryOp,
  Block,
  BooleanLiteral,
  CallExpr,
  ConsoleLogCall,
  Declaration,
  Expression,
  ExpressionStatement,
  FunctionDeclaration,
  FunctionExpr,
  Identifier,
  IfStatement,
  Module,
  NumberLiteral,
  Parameter,
  ReturnStatement,
  Span,
  Statement,
  StringLiteral,
  ThrowStatement,
  TryStatement,
  WhileStatement,
} from '../../src/hir/nodes.ts';
import type { HType } from '../../src/hir/types.ts';
import { H_BOOLEAN, H_NUMBER, H_STRING, H_UNDEFINED } from '../../src/hir/types.ts';
import { lowerSourceFile } from '../../src/lower/index.ts';
import type { Diagnostic } from '../../src/support/diagnostics.ts';

/** Create a TypeScript compiler program from source code.
 * Returns both the program and resolved source file.
 * `fileName`'s extension matters to the gate (`.js` is rejected outright in ts mode), which is
 * the only reason a caller would ever override the default. */
export function createProgram(
  source: string,
  fileName = '/test.ts',
): {
  program: ts.Program;
  sourceFile: ts.SourceFile;
} {
  const isJs = fileName.endsWith('.js');
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    verbatimModuleSyntax: true,
    isolatedModules: true,
    skipLibCheck: true,
    // `lib` takes FILE names, not the tsconfig shorthand -- `'es2024'` resolves to nothing and
    // silently builds a program with NO standard library, in which `number[]` is an error type and
    // `checker.isArrayType` answers false for every array. Mirrors src/frontend/program.ts.
    lib: ['lib.es2025.d.ts'],
    // Mirrors src/frontend/program.ts: without these, ts.createProgram silently drops a `.js`
    // root file instead of building it, and every js-mode test here would be exercising nothing.
    allowJs: isJs,
    checkJs: isJs,
  };

  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const defaultHost = ts.createCompilerHost(compilerOptions);

  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile: (name, languageVersion, onError, shouldCreateNewSourceFile) => {
      if (name === fileName) {
        return sourceFile;
      }
      return defaultHost.getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile);
    },
  };

  // Stator's globals are a root file rather than a lib, exactly as in src/frontend/program.ts: a
  // helper that builds a different program from the compiler is testing a different compiler.
  const globals = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'src',
    'frontend',
    'lib',
    'stator.globals.d.ts',
  );
  const program = ts.createProgram([fileName, globals], compilerOptions, host);
  const resolvedSourceFile = program.getSourceFile(fileName);

  if (!resolvedSourceFile) {
    throw new Error('SourceFile should be created');
  }

  return { program, sourceFile: resolvedSourceFile };
}

/** Lower TypeScript source code to HIR.
 * Wraps createProgram + lowerSourceFile in a single call. `fileName` is how a caller asks for a
 * `.js` file: the extension is what turns on allowJs/checkJs, so JSDoc types only exist under it. */
export function lowerSource(
  code: string,
  fileName = '/test.ts',
): {
  module: Module;
  diagnostics: readonly Diagnostic[];
} {
  const { program, sourceFile } = createProgram(code, fileName);
  const checker = program.getTypeChecker();
  const result = lowerSourceFile(sourceFile, checker);

  if (!result.module) {
    throw new Error('lowerSourceFile should produce a module');
  }

  return { module: result.module, diagnostics: result.diagnostics };
}

/** The diagnostic codes the gate reports for `source`. `mode` picks the file extension too: a `.js`
 * name is what makes the gate treat the file as JavaScript, so the two travel together. */
export function gateCodes(source: string, mode: 'ts' | 'js' = 'ts'): string[] {
  const { program } = createProgram(source, mode === 'js' ? '/test.js' : '/test.ts');
  return gateProgram(program, mode).map((d) => d.code);
}

/** The statements `code` lowers to, asserting the lowering itself was clean — a diagnostic here is
 * a compiler bug, and letting it through would test the shape of a half-built module. */
export function loweredStatements(code: string): readonly Statement[] {
  const { module, diagnostics } = lowerSource(code);
  assert.deepEqual(
    diagnostics.map((d) => d.code),
    [],
    'lowering should be clean',
  );
  return module.statements;
}

/** Every node below `root`, flattened, so a test can ask what a program CONTAINS rather than
 * navigating to the one expression it means. The walk is structural and shallow-typed on purpose:
 * it recurses into every object-valued property, so a node kind added later is covered without this
 * helper being edited — which is what makes "no such node anywhere" a claim worth asserting.
 *
 * `type` and `span` are skipped: an HType is a tree of objects too, and walking it would report
 * types as if they were nodes. */
export function hirNodes(root: unknown): { kind: string }[] {
  const found: { kind: string }[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (typeof value !== 'object' || value === null) {
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record['kind'] === 'string') {
      found.push(record as { kind: string });
    }
    for (const key of Object.keys(record)) {
      if (key !== 'type' && key !== 'span') {
        visit(record[key]);
      }
    }
  };
  visit(root);
  return found;
}

/** Create a source span with the given line number. */
export function span(line: number): Span {
  return { start: 0, length: 0, line };
}

/** Create an empty module or module with statements. */
export function makeModule(statements: readonly Statement[] = []): Module {
  return {
    kind: 'module',
    type: H_NUMBER,
    span: span(1),
    fileName: '/test.ts',
    statements,
  };
}

/** Create a number literal. */
export function num(value: number, line = 1): NumberLiteral {
  return {
    kind: 'number-literal',
    type: H_NUMBER,
    span: span(line),
    value,
  };
}

/** Create a string literal. */
export function str(value: string, line = 1): StringLiteral {
  return {
    kind: 'string-literal',
    type: H_STRING,
    span: span(line),
    value,
  };
}

/** Create a boolean literal. */
export function bool(value: boolean, line = 1): BooleanLiteral {
  return {
    kind: 'boolean-literal',
    type: H_BOOLEAN,
    span: span(line),
    value,
  };
}

/** Create an identifier. */
export function id(name: string, type: HType = H_NUMBER, line = 1): Identifier {
  return {
    kind: 'identifier',
    type,
    span: span(line),
    name,
  };
}

/** Create a binary operation. */
export function binary(
  operator: '+' | '-' | '*' | '/' | '%' | '<' | '>' | '<=' | '>=' | '===' | '!==',
  left: Expression,
  right: Expression,
  type: HType = H_NUMBER,
  line = 1,
): BinaryOp {
  return {
    kind: 'binary-op',
    type,
    span: span(line),
    operator,
    left,
    right,
  };
}

/** Create a console.log call. */
export function consoleLog(
  args: readonly Expression[],
  type: HType = H_NUMBER,
  line = 1,
): ConsoleLogCall {
  return {
    kind: 'console-log',
    type,
    span: span(line),
    method: 'log',
    args,
  };
}

/** Create a declaration (let or const). */
export function decl(
  name: string,
  value: Expression,
  kind: 'let' | 'const' = 'let',
  type: HType = H_NUMBER,
  line = 1,
): Declaration {
  return {
    kind: 'declaration',
    type,
    span: span(line),
    name,
    declKind: kind,
    value,
  };
}

/** Create an assignment. */
export function assign(
  target: string,
  value: Expression,
  type: HType = H_NUMBER,
  line = 1,
): Assignment {
  return {
    kind: 'assignment',
    type,
    span: span(line),
    target,
    value,
  };
}

/** Create an expression statement. */
export function exprStmt(
  expression: Expression,
  type: HType = H_NUMBER,
  line = 1,
): ExpressionStatement {
  return {
    kind: 'expression-statement',
    type,
    span: span(line),
    expression,
  };
}

/** Create a block. */
export function block(
  statements: readonly Statement[] = [],
  type: HType = H_NUMBER,
  line = 1,
): Block {
  return {
    kind: 'block',
    type,
    span: span(line),
    statements,
  };
}

/** Create an if statement. */
export function ifStmt(
  condition: Expression,
  consequent: Block,
  alternate: Block | undefined = undefined,
  type: HType = H_NUMBER,
  line = 1,
): IfStatement {
  if (alternate !== undefined) {
    return {
      kind: 'if-statement',
      type,
      span: span(line),
      condition,
      consequent,
      alternate,
    };
  }
  return {
    kind: 'if-statement',
    type,
    span: span(line),
    condition,
    consequent,
  };
}

/** Create a while statement. */
export function whileStmt(
  condition: Expression,
  body: Block,
  type: HType = H_NUMBER,
  line = 1,
): WhileStatement {
  return {
    kind: 'while-statement',
    type,
    span: span(line),
    condition,
    body,
  };
}

/** Create a function expression. `params` are names; every parameter is typed `type`. */
export function fn(
  params: readonly string[],
  body: Block,
  name?: string,
  type: HType = H_NUMBER,
  line = 1,
): FunctionExpr {
  const parameters: Parameter[] = params.map((p) => ({ name: p, type, span: span(line) }));
  // Captures default to none: a hand-built function in a unit test is the non-capturing case
  // unless a test says otherwise, which keeps rung 4a's static-closure path the default here too.
  // `typed`: the helper takes the function's HType, so a hand-built function's signature is
  // asserted outright rather than worked out from a body.
  const capture = {
    envVars: [],
    captures: [],
    needsEnv: false,
    isAsync: false,
    provenance: 'typed',
  } as const;
  return name === undefined
    ? { kind: 'function', type, span: span(line), params: parameters, body, ...capture }
    : { kind: 'function', type, span: span(line), name, params: parameters, body, ...capture };
}

/** Create a function declaration. */
export function fnDecl(
  name: string,
  params: readonly string[],
  body: Block,
  type: HType = H_NUMBER,
  line = 1,
): FunctionDeclaration {
  return {
    kind: 'function-declaration',
    type,
    span: span(line),
    name,
    fn: fn(params, body, name, type, line),
  };
}

/** Create a return statement. */
export function ret(value?: Expression, type: HType = H_NUMBER, line = 1): ReturnStatement {
  return value === undefined
    ? { kind: 'return-statement', type, span: span(line) }
    : { kind: 'return-statement', type, span: span(line), value };
}

/** Create a throw statement. */
export function throwStmt(value: Expression, line = 1): ThrowStatement {
  return { kind: 'throw-statement', type: H_UNDEFINED, span: span(line), value };
}

/** Create a try statement. At least one of catchBlock/finallyBlock must be given, mirroring the
 * HIR invariant the verifier enforces (STA4057). */
export function tryStmt(
  tryBlock: Block,
  parts: { catchBinding?: string; catchBlock?: Block; finallyBlock?: Block },
  line = 1,
): TryStatement {
  return {
    kind: 'try-statement',
    type: H_UNDEFINED,
    span: span(line),
    tryBlock,
    ...(parts.catchBinding !== undefined && { catchBinding: parts.catchBinding }),
    ...(parts.catchBlock !== undefined && { catchBlock: parts.catchBlock }),
    ...(parts.finallyBlock !== undefined && { finallyBlock: parts.finallyBlock }),
  };
}

/** Create a call expression. */
export function call(
  callee: Expression,
  args: readonly Expression[] = [],
  type: HType = H_NUMBER,
  line = 1,
): CallExpr {
  return { kind: 'call', type, span: span(line), callee, args };
}

/** A `node:test` option object that skips a test which compiles and runs a native binary.
 *
 * Producing one needs `runtime/build/libjsrt.a` and clang, a toolchain the runtime's Makefile does
 * not target on Windows. Every OTHER unit test is portable TypeScript, so gating these few HERE is
 * what lets `pnpm run test` run on all six CI platforms instead of only the Unix four — a skipped
 * proof is visible in the runner's output, a whole unrun file is not. */
export const NATIVE_ONLY =
  process.platform === 'win32' ? { skip: 'no native toolchain on Windows' } : {};

/** Compile `source` in ts mode, run the binary, and hand back both streams separately.
 *
 * The determinism carve-out's proofs (plan §7 Task 4.2) all need this and nothing else needs it:
 * `Math.random`, `console.time`/`timeEnd`/`trace` and `Date.now` cannot be proved by a golden
 * diff, so each one compiles a small program and asserts a PROPERTY of what it printed. The
 * streams stay separate because which stream a line lands on is part of what `console.trace`
 * promises. `prefix` only names the scratch directory, so a failing run says which proof it was.
 *
 * `tz` pins the RUN's zone (never the build's, which reads no clock and no tzdb). Local-time
 * behaviour is the other thing a golden diff cannot prove: the golden runner pins `TZ=UTC` on both
 * sides precisely so a tzdata skew between libc and Node's ICU cannot masquerade as a semantics
 * bug, which leaves every DST question to a proof that names its own zone here.
 */
export function compileAndRunStreams(
  source: string,
  prefix: string,
  tz?: string,
): { stdout: string; stderr: string } {
  const cli = fileURLToPath(new URL('../../src/cli/main.ts', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), `stator-${prefix}-`));
  try {
    const entry = join(dir, 'main.ts');
    const out = join(dir, 'main');
    writeFileSync(entry, source);
    const build = spawnSync(process.execPath, [cli, 'build', entry, '-o', out, '--mode=ts'], {
      encoding: 'utf8',
    });
    assert.equal(build.status, 0, `build failed:\n${build.stdout}${build.stderr}`);
    const run = spawnSync(out, [], {
      encoding: 'utf8',
      ...(tz !== undefined && { env: { ...process.env, TZ: tz } }),
    });
    assert.equal(run.status, 0, `run failed:\n${run.stdout}${run.stderr}`);
    return { stdout: run.stdout, stderr: run.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** `compileAndRunStreams`, reduced to stdout's non-empty lines — what a proof that does not care
 * about the stream split wants. */
export function compileAndRunLines(source: string, prefix: string, tz?: string): string[] {
  return compileAndRunStreams(source, prefix, tz)
    .stdout.split('\n')
    .filter((line) => line !== '');
}

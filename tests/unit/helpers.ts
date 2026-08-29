import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
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
  WhileStatement,
} from '../../src/hir/nodes.ts';
import type { HType } from '../../src/hir/types.ts';
import { H_BOOLEAN, H_NUMBER, H_STRING } from '../../src/hir/types.ts';
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
    lib: ['lib.es2023.d.ts'],
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
 * Wraps createProgram + lowerSourceFile in a single call. */
export function lowerSource(code: string): {
  module: Module;
  diagnostics: readonly Diagnostic[];
} {
  const { program, sourceFile } = createProgram(code);
  const checker = program.getTypeChecker();
  const result = lowerSourceFile(sourceFile, checker);

  if (!result.module) {
    throw new Error('lowerSourceFile should produce a module');
  }

  return { module: result.module, diagnostics: result.diagnostics };
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
  const capture = { envVars: [], captures: [], needsEnv: false } as const;
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

/** Create a call expression. */
export function call(
  callee: Expression,
  args: readonly Expression[] = [],
  type: HType = H_NUMBER,
  line = 1,
): CallExpr {
  return { kind: 'call', type, span: span(line), callee, args };
}

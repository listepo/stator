import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import type { Diagnostic } from '../support/diagnostics.ts';
import { diagnosticFromFile, renderDiagnostic } from '../support/diagnostics.ts';

type Mode = 'ts' | 'js';

/** Build a ts.Program from an entry file, using Stator-owned compilerOptions.
 * Stator owns strict family + noEmit; user's tsconfig.json is ignored for these.
 * Returns the program and any diagnostics emitted during program construction.
 */
export function createProgram(
  entryFile: string,
  mode: Mode,
): { program: ts.Program; diagnostics: Diagnostic[] } {
  // Stator owns these options — strict family on, noEmit true
  const compilerOptions: ts.CompilerOptions = {
    // Strict mode (Stator's policy)
    strict: true,
    // js mode's whole contract is that untyped code is never rejected -- an unannotated parameter
    // is not an error there, it is the request for a dynamic value. `strict` would turn it into a
    // hard error before the gate ever runs, so js mode opts back out; ts mode keeps it, and the
    // gate reports implicit any as STA1001 with a mode-aware message instead of tsc's.
    noImplicitAny: mode === 'ts',
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    // Same contract, one rung further along: in js mode `noImplicitOverride` would demand a JSDoc
    // `@override` tag on every overriding method, which rejects ordinary JavaScript for having no
    // annotation. ts mode keeps it -- there the modifier is real syntax, and an accidental override
    // is exactly the mistake a vtable makes silent.
    noImplicitOverride: mode === 'ts',
    noFallthroughCasesInSwitch: true,
    // Deliberately NOT noUnusedLocals/noUnusedParameters. Those are style checks: they change
    // nothing about what a type means, so nothing downstream depends on them, and switching them
    // on would make Stator reject correct programs -- `function f(a, b) { return a; }` is valid
    // TypeScript. The locked tsconfig in plan §4 that carries them governs Stator's own source,
    // not the source Stator compiles; the two are different policies (notes #47).
    isolatedModules: true,
    verbatimModuleSyntax: true,
    erasableSyntaxOnly: true,
    allowImportingTsExtensions: true,
    rewriteRelativeImportExtensions: true,

    // Module system (ESM only)
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,

    // Target and libs. `lib` takes FILE names, not the tsconfig shorthand: "es2023" resolves to
    // nothing and silently leaves the program without Array, Object, or any other global type.
    target: ts.ScriptTarget.ES2023,
    lib: ['lib.es2023.d.ts'],

    // No emit — we generate our own C
    noEmit: true,

    // For js mode, allow untyped JS
    allowJs: mode === 'js',
    checkJs: mode === 'js',

    // Utility options
    sourceMap: true,
    skipLibCheck: true,
  };

  // Stator's globals are a root file, not a `lib`: they describe what `libjsrt.a` provides, and a
  // compiled program has neither Node's globals nor the DOM's.
  const globals = join(dirname(fileURLToPath(import.meta.url)), 'lib', 'stator.globals.d.ts');
  const program = ts.createProgram([globals, entryFile], compilerOptions);
  const diagnostics: Diagnostic[] = [];

  // Surface TypeScript's own diagnostics as Stator diagnostics
  const tsDiagnostics = ts.getPreEmitDiagnostics(program);
  for (const diag of tsDiagnostics) {
    const file = diag.file;
    if (file === undefined) {
      // File-less diagnostic (e.g., "tsconfig.json not found")
      diagnostics.push(
        diagnosticFromFile(
          '<unknown>',
          1,
          1,
          'STA0012',
          'error',
          mode,
          ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
        ),
      );
    } else {
      // Diagnostic has a location
      const { line, character } = file.getLineAndCharacterOfPosition(diag.start ?? 0);
      diagnostics.push(
        diagnosticFromFile(
          file.fileName,
          line + 1,
          character + 1,
          'STA0012',
          'error',
          mode,
          ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
          {
            start: diag.start ?? 0,
            length: (diag.length ?? 0) > 0 ? (diag.length ?? 0) : 1,
          },
        ),
      );
    }
  }

  return { program, diagnostics };
}

/** Format and print diagnostics for user output. */
export function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diag of diagnostics) {
    process.stderr.write(`${renderDiagnostic(diag)}\n`);
  }
}

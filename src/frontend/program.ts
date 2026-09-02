import { dirname, join, resolve } from 'node:path';
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
    // Same contract again, for two checks that reject VALID JavaScript rather than untyped
    // JavaScript. Deliberate switch fallthrough is a JS idiom, and `catch (e) { e.name }` reads a
    // property off a value the language hands you untyped; in js mode the catch variable is a
    // dynamic value like any other and the read is settled at run time. ts mode keeps both -- there
    // a fallthrough is almost always a missing `break`, and an `unknown` catch is the boundary rule
    // of §0.2. Found by the Test262 harness, which is ordinary ES5 and used both (plan-notes 175).
    noFallthroughCasesInSwitch: mode === 'ts',
    useUnknownInCatchVariables: mode === 'ts',
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

    // Module system (ESM only, plan §1). NOT NodeNext: NodeNext classifies a file by the nearest
    // package.json's "type" field and calls it CommonJS by default, so a bare directory of .ts
    // files could not use `import` at all. Stator compiles ESM regardless of packaging metadata --
    // Force makes every file a module, Bundler resolves relative specifiers without consulting
    // package.json, and the gate holds Node's own rule that a relative specifier names its file
    // extension (STA1113), which Bundler alone would not enforce.
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    moduleDetection: ts.ModuleDetectionKind.Force,

    // Target and libs. `lib` takes FILE names, not the tsconfig shorthand: "es2025" resolves to
    // nothing and silently leaves the program without Array, Object, or any other global type.
    //
    // The lib describes the JAVASCRIPT the differential ground truth implements -- the pinned Node
    // in `.node-version` -- and NOT the subset Stator has landed. Those are different jobs: the
    // gate is what states the subset, and its answer for a member the compiler does not do yet is
    // `STA1214`, which names the delivering phase. Under too low a lib the same program gets a type
    // error telling the user to change a `lib` option they do not own (plan-notes 99).
    target: ts.ScriptTarget.ES2025,
    lib: ['lib.es2025.d.ts'],

    // No emit — we generate our own C
    noEmit: true,

    // `allowJs` is on in BOTH modes so a `.js` file actually enters the program. ts mode still
    // rejects every one at the gate (`STA1002`); without this, tsc DROPS the file and answers
    // `STA0012` "enable the 'allowJs' option", which is the wrong code and the wrong hint — the
    // user does not want a compiler flag, they want `--mode=js` (plan.md §8 step 2). `checkJs`
    // stays js-mode-only: ts mode must not type-check a file it is about to refuse.
    allowJs: true,
    checkJs: mode === 'js',

    // Utility options
    sourceMap: true,
    skipLibCheck: true,
  };

  // Stator's globals are a root file, not a `lib`: they describe what `libjsrt.a` provides, and a
  // compiled program has neither Node's globals nor the DOM's.
  const globals = join(dirname(fileURLToPath(import.meta.url)), 'lib', 'stator.globals.d.ts');
  // The entry is made absolute BEFORE the program sees it: with a relative root, the file's
  // `fileName` stays relative while `ts.resolveModuleName` answers with absolute paths, so every
  // import edge silently fails the `getSourceFile` lookup and the module graph loses its
  // dependencies -- legal multi-file source then dies as STA4035 in the lowering. Forward slashes
  // because that is the separator TypeScript normalizes every fileName to.
  const program = ts.createProgram(
    [globals, resolve(entryFile).replace(/\\/g, '/')],
    compilerOptions,
  );
  const diagnostics: Diagnostic[] = [];

  // Surface TypeScript's own diagnostics as Stator diagnostics
  const tsDiagnostics = ts.getPreEmitDiagnostics(program);
  for (const diag of tsDiagnostics) {
    // js mode: untyped code is dynamic, not rejected (plan.md §1.2, §8 step 4). checkJs still
    // infers what it can; these codes are checker refusals for operations the dynamic runtime
    // settles at run time (property reads/writes and calls through an unknown value).
    if (
      mode === 'js' &&
      (diag.code === 2339 || diag.code === 2551 || diag.code === 2353 || diag.code === 2349)
    ) {
      continue;
    }
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

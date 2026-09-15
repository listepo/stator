import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import type { Diagnostic } from '../support/diagnostics.ts';
import { diagnosticFromFile, renderDiagnostic } from '../support/diagnostics.ts';

type Mode = 'ts' | 'js';

function identifierAt(source: ts.SourceFile, position: number): ts.Identifier | undefined {
  let found: ts.Identifier | undefined;
  const visit = (node: ts.Node): void => {
    if (position < node.getStart(source) || position >= node.getEnd()) return;
    if (ts.isIdentifier(node)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The coercing compound operators: `-=`, `*=`, `/=`, `%=`, `**=`. `+=` concatenates rather
 * than coerces, and the logical and nullish forms assign their right side as-is. */
function isCoercingCompound(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.MinusEqualsToken ||
    kind === ts.SyntaxKind.AsteriskEqualsToken ||
    kind === ts.SyntaxKind.SlashEqualsToken ||
    kind === ts.SyntaxKind.PercentEqualsToken ||
    kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken
  );
}

/** The identifier a suppressed 2362/2363 assigns through, or `undefined` when the diagnostic is
 * not on a coercing compound assignment's left. `s *= 2` widens `s` (the number result lands in
 * its slot); `s * 2` widens nothing (a read leaves the binding alone); `o.x *= 2` and
 * `a[i] *= 2` widen nothing (a member is not a binding — the place machinery, not the scope,
 * owns its type). Parentheses and `!` are transparent, as they are everywhere else. */
function compoundAssignTarget(token: ts.Identifier): ts.Identifier | undefined {
  let node: ts.Node = token;
  for (;;) {
    const parent = node.parent;
    if (parent === undefined) {
      return undefined;
    }
    if (ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent)) {
      node = parent;
      continue;
    }
    if (
      ts.isBinaryExpression(parent) &&
      parent.left === node &&
      isCoercingCompound(parent.operatorToken.kind)
    ) {
      let target: ts.Expression = parent.left;
      while (ts.isParenthesizedExpression(target) || ts.isNonNullExpression(target)) {
        target = target.expression;
      }
      return ts.isIdentifier(target) ? target : undefined;
    }
    return undefined;
  }
}

/* The checker refusals js mode drops, because each one refuses an operation the DYNAMIC RUNTIME
 * settles at run time -- not untyped code, which §1.2 already promises never to reject, but valid
 * JavaScript whose answer is a value rather than a type (plan.md §8 steps 2, 2a).
 *
 * Suppressing the CODE and not the OPTION is the whole design. `strictNullChecks: false` (or
 * `noUncheckedIndexedAccess: false`) is program-wide, so in a mixed graph it would strip null
 * safety from the `.ts` half and delete the boundary checks §0.4 requires. Leaving `T | undefined`
 * in the type is the point: the union lowers to the dynamic path and the check still happens, at
 * run time, which is where a dynamic value's check belongs.
 *
 * Nothing in here is a free pass for a REAL refusal — an operation no runtime could settle stays a
 * hard error in both modes, and that is why the list is enumerated rather than ranged. */
const JS_MODE_RUNTIME_CODES: ReadonlySet<number> = new Set([
  // JSDoc's optional-parameter spelling is checker metadata; JavaScript has no corresponding
  // function-signature restriction, so a required parameter may follow it at runtime.
  1016, // A required parameter cannot follow an optional parameter.
  2554, // Expected N arguments, but got M.
  2322, // Type 'X' is not assignable to type 'Y'.
  2345, // Argument of type 'X' is not assignable to parameter of type 'Y'.
  // No overload matches: JavaScript runs the implementation with the runtime value, so in
  // js mode the call dispatches to it dynamically (its signature — a union or `unknown` in
  // practice, hence Unknown — accepts anything the overloads refused; a dynamic argument
  // reaching a checkable parameter takes the existing boundary path). ts mode keeps the
  // refusal (STA0012). Non-overloaded mismatches already run via the 2345 path above.
  2769, // No overload matches this call.
  // Member access and calls through a value the checker could not resolve.
  2339, // Property 'x' does not exist on type 'T'.
  2551, // Property 'x' does not exist on type 'T'. Did you mean 'y'?
  2353, // Object literal may only specify known properties.
  2349, // This expression is not callable.
  // `"" == 0` is not a mistake in JavaScript, it is the coercion table, and running that table is
  // most of what js mode is for. ts mode keeps it: there both operand types are known and disjoint
  // (plan-notes 177).
  2367, // This comparison appears to be unintentional because the types have no overlap.
  2362, // Left-hand side of arithmetic operation must be numeric.
  2363, // Right-hand side of arithmetic operation must be numeric.
  // Same table, spelled for one operand: `1 + undefined` is NaN, not a mistake. Test262 asserts
  // exactly that in `language/expressions/addition/S11.6.1_A3.1_*` (plan-notes 194).
  18050, // The value 'undefined' cannot be used here.
  // `var x = 1; var x = 'a'` is one binding assigned twice -- legal JavaScript, and a redeclaration
  // TypeScript refuses only because it wants one type per name.
  2403, // Subsequent variable declarations must have the same type.
  // A style lint, not a refusal: the comma operator's answer is its right operand either way.
  2695, // Left side of comma operator is unused and has no side effects.
  // A COMMENT cannot refuse a program. JSDoc is checker metadata; the parameter list is the code.
  8024, // JSDoc '@param' tag has name 'X', but there is no parameter with that name.
  8029, // JSDoc '@param' tag has name 'X', ... It would match 'arguments' if it had an array type.
  // Writing through a read-only reference IS the operation `Object.freeze` exists to define, and
  // its answer is a TypeError the runtime now raises as a real Error object -- catchable, with
  // Node's wording and a working `instanceof` (plan.md §8 step 2a(c), plan-notes 195). Before that
  // model existed these two had to stay: a refusal whose runtime answer the runtime could not build
  // is not a refusal js mode may drop.
  // A name nothing declares is not a type error, it is a RUNTIME question, and now that the Error
  // model exists the runtime can answer it: `ReferenceError: x is not defined`, catchable, with
  // Node's wording (plan.md §8 step 2a(c)). This is the largest bucket the sweep left, and it is
  // the one that needed no runtime it did not have -- only somewhere for the answer to come from.
  // 2552 is the same refusal with a spelling suggestion attached.
  2304, // Cannot find name 'X'.
  2552, // Cannot find name 'X'. Did you mean 'Y'?
  2540, // Cannot assign to 'X' because it is a read-only property.
  2704, // The operand of a 'delete' operator cannot be a read-only property.
  // TypeScript refuses `delete` on a REQUIRED property because deleting one would falsify the
  // type; JavaScript's answer is a boolean and a key that is gone. Both codes could only be
  // dropped once the operator existed to answer them (plan.md §8 step 2a(c)): 2704's answer is the
  // frozen-object TypeError `jsrt_delete` raises with Node's wording, and 2790's is the ordinary
  // removal. In `ts` mode 2790 stays a refusal, and that is not an inconsistency -- it is the
  // rule that keeps a fixed shape from being asked to lose a slot it has no encoding for.
  2790, // The operand of a 'delete' operator must be optional.
  // The exactOptionalPropertyTypes family. The option stays ON in both modes -- turning it off is
  // program-wide and would strip the .ts half of a mixed graph of the same guarantee -- but in js
  // mode these three codes refuse ordinary JavaScript: `{ value: undefined }` for a `value?: string`
  // parameter is how Test262's own propertyHelper writes a descriptor, and 2340 of the 7276
  // remaining Test262 failures say it. Unlike 2322/2345 this needs no widening and no coercion,
  // because the disagreement is only over whether `undefined` is a permitted VALUE for an optional
  // property, and `undefined` is a value the runtime already represents in the slot. The absent /
  // present-as-undefined distinction EOPT exists to police survives: the shape model tracks presence,
  // so `{}` and `{ value: undefined }` still differ in `Object.keys` and in `console.log`
  // (tests/golden/js/optional_undefined.js pins exactly that, not just the reads).
  2375, // Type 'X' is not assignable to type 'Y' with 'exactOptionalPropertyTypes: true' (target's properties).
  2379, // Argument of type 'X' is not assignable to parameter of type 'Y' with 'exactOptionalPropertyTypes: true'.
  2412, // Type 'X' is not assignable to type 'Y' with 'exactOptionalPropertyTypes: true' (the target).
  // A computed key of a type that is not string/number/symbol is still a key at run time:
  // Node applies ToPropertyKey coercion (`{ [{}]: 1 }` holds `"[object Object]"`), and the
  // dynamic literal stores through `jsrt_dyn_index_set`, which coerces the same way through
  // `jsrt_to_string` (plan.md §8 step 2a(b)). ts mode keeps the refusal (STA0012).
  2464, // A computed property name must be of type 'string', 'number', 'symbol', or 'any'.
  // Duplicate data-property keys in an object literal are legal JavaScript — last wins — and
  // §1.2 says js mode never rejects untyped code; the diagnostic is tsc's grammar check, not a
  // type error (plan.md §8 step 26). The lowering pushes one entry per written property and the
  // emitter stores in source order into one slot, so the last write wins on its own; the verifier
  // covers the shape by name, not by position. ts mode keeps the refusal (STA0012). Duplicate
  // METHODS, duplicate accessors, and mixed property/accessor duplicates are different checker
  // codes (2300, 1118, 1119) and stay refused in both modes.
  1117, // An object literal cannot have multiple properties with the same name.
  // The possibly-null family: 3855 of Task 6.1's 10,513 Test262 failures, the largest bucket by a
  // factor of three, and every one of them ordinary JavaScript that runs (plan-notes 176, 180).
  // `xs[i].toFixed(2)` is how JavaScript indexes an array; the spec's answer for the miss is a
  // TypeError at run time, which is a fact about the value and not a reason to refuse the program.
  2531, // Object is possibly 'null'.
  2532, // Object is possibly 'undefined'.
  2533, // Object is possibly 'null' or 'undefined'.
  2721, // Cannot invoke an object which is possibly 'null'.
  2722, // Cannot invoke an object which is possibly 'undefined'.
  2723, // Cannot invoke an object which is possibly 'null' or 'undefined'.
  18047, // 'x' is possibly 'null'.
  18048, // 'x' is possibly 'undefined'.
  18049, // 'x' is possibly 'null' or 'undefined'.
  // Definite assignment (slice 2454): an uninitialized annotated binding's runtime value
  // IS `undefined` -- this is not TDZ (true syntactic TDZ is 2448, unmodelled). The binding is
  // widened to Unknown below so no use trusts the annotation; every use then takes the dynamic
  // path (reads, index, calls) or a null-validated static one (array ops via STA2008).
  2454, // Variable 'X' is used before being assigned.
]);

/** Checker refusals Stator answers with exact runtime semantics in BOTH modes, unlike the
 * js-only set above. A `for-in` enumerates keys, and strings and arrays HAVE keys: tsc's 2407
 * is a lint-grade refusal of programs with exact runtime answers (plan.md §8 step 38). The
 * `for-in` desugar reads through the total `forInKeys` entry — objects, arrays and strings
 * enumerate, every other primitive answers an empty list — so no suppressed diagnostic can
 * resurface as a runtime abort, and a statically-unknown receiver is dynamic rather than
 * refused (§1.2). The ts-mode contract tension (tsc rejects what Stator compiles) is recorded
 * in plan-notes 257. */
const BOTH_MODES_RUNTIME_CODES: ReadonlySet<number> = new Set([
  2407, // The right-hand side of a 'for...in' statement must be of type 'any', an object type...
]);

/** Last in-process `createProgram` result for an unchanged entry.
 *
 * Keyed by absolute entry path + mode + entry CONTENT hash. v0 invalidates on bytes, not mtime:
 * test262 stages thousands of tests through a handful of slot-reused temp paths, so (path, mtime)
 * can repeat for different contents on a coarse-tick filesystem and serve a stale program under
 * the wrong test's name (plan-notes 245). A dep edit without an entry touch still does not bust
 * the cache — no runner does that mid-run; a watch daemon with a full dependency set is the
 * follow-up. Custom `host` (memfs tests) always bypasses the cache. */
interface ProgramCacheEntry {
  readonly absEntry: string;
  readonly mode: Mode;
  readonly contentHash: string;
  readonly result: {
    program: ts.Program;
    diagnostics: Diagnostic[];
    runtimeDynamicSymbols: ReadonlySet<ts.Symbol>;
  };
}

let programCache: ProgramCacheEntry | null = null;

/** Drop the cached `ts.Program` (tests that mutate files under a reused entry need this). */
export function clearProgramCache(): void {
  programCache = null;
}

/** Build a ts.Program from an entry file, using Stator-owned compilerOptions.
 * Stator owns strict family + noEmit; user's tsconfig.json is ignored for these.
 * Returns the program and any diagnostics emitted during program construction.
 *
 * `host` is the seam for tests (plan-notes 187): unit suites back programs with a memfs volume
 * through it. Omitted means ts.sys against the real disk — the ONLY mode the shipped compiler
 * runs in, since every production call passes no host.
 *
 * Unchanged re-builds of the same absolute entry+mode reuse the previous `ts.Program` when the
 * entry's bytes are unchanged (see `clearProgramCache`). */
export function createProgram(
  entryFile: string,
  mode: Mode,
  host?: ts.CompilerHost,
): {
  program: ts.Program;
  diagnostics: Diagnostic[];
  runtimeDynamicSymbols: ReadonlySet<ts.Symbol>;
} {
  // Custom hosts (memfs) have no meaningful disk mtime; never cache those.
  if (host === undefined) {
    const absEntry = resolve(entryFile).replace(/\\/g, '/');
    // Hash, not mtime: one small-file read is noise against a ~380 ms frontend, and it closes
    // the stale-hit hole for slot-reused temp paths airtightly instead of by timestamp luck.
    let contentHash: string | undefined;
    try {
      contentHash = createHash('sha256').update(readFileSync(absEntry)).digest('hex');
    } catch {
      contentHash = undefined;
    }
    if (
      contentHash !== undefined &&
      programCache !== null &&
      programCache.absEntry === absEntry &&
      programCache.mode === mode &&
      programCache.contentHash === contentHash
    ) {
      return programCache.result;
    }
    const result = createProgramUncached(entryFile, mode, host);
    if (contentHash !== undefined) {
      programCache = { absEntry, mode, contentHash, result };
    }
    return result;
  }
  return createProgramUncached(entryFile, mode, host);
}

function createProgramUncached(
  entryFile: string,
  mode: Mode,
  host?: ts.CompilerHost,
): {
  program: ts.Program;
  diagnostics: Diagnostic[];
  runtimeDynamicSymbols: ReadonlySet<ts.Symbol>;
} {
  // Stator owns these options — strict family on, noEmit true
  const compilerOptions: ts.CompilerOptions = {
    // Strict mode (Stator's policy)
    strict: true,
    // js mode's whole contract is that untyped code is never rejected -- an unannotated parameter
    // is not an error there, it is the request for a dynamic value. `strict` would turn it into a
    // hard error before the gate ever runs, so js mode opts back out; ts mode keeps it, and the
    // gate reports implicit any as STA1001 with a mode-aware message instead of tsc's.
    noImplicitAny: mode === 'ts',
    // `this` in a plain function is per-function dynamic, not program-wide: in js mode the call
    // site passes its receiver or nothing, and the lowering binds it as an Unknown parameter zero
    // (docs/VALUE.md §4.16 `has_receiver`; a bare call answers `undefined`, which is the honest
    // answer because emitted modules are always strict ESM, never sloppy-global). Flipping the
    // OPTION is correct here, beside `noImplicitAny` above, rather than suppressing code 2683:
    // suppressing the code would silence the checker but leave `this: any` for the gate to
    // reclassify as STA1214, while the option gives the lowering the dynamic type to work with.
    // ts mode keeps it: there an unannotated `this` is a compile error (STA0012).
    noImplicitThis: mode === 'ts',
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
    host,
  );
  const diagnostics: Diagnostic[] = [];
  const runtimeDynamicSymbols = new Set<ts.Symbol>();

  // Surface TypeScript's own diagnostics as Stator diagnostics
  const tsDiagnostics = ts.getPreEmitDiagnostics(program);
  for (const diag of tsDiagnostics) {
    if (
      BOTH_MODES_RUNTIME_CODES.has(diag.code) ||
      (mode === 'js' && JS_MODE_RUNTIME_CODES.has(diag.code))
    ) {
      // An inferred binding that TypeScript says has an incompatible assignment must be dynamic
      // throughout lowering. The diagnostic starts at the assignment target, whose symbol is the
      // one binding the HIR verifier otherwise (correctly) keeps monomorphic. 2403 is the same
      // disagreement spelled as a redeclaration (`var x = 1; var x = 'a'`) rather than as an
      // assignment, and it needs the same widening -- without it the suppression turns a checker
      // refusal into an STA4004 internal error (plan-notes 194).
      if (
        (diag.code === 2322 ||
          diag.code === 2403 ||
          diag.code === 2362 ||
          diag.code === 2363 ||
          diag.code === 2454) &&
        diag.file !== undefined &&
        diag.start !== undefined
      ) {
        const token = identifierAt(diag.file, diag.start);
        // A plain incompatible assignment widens its target; a coercing compound assignment
        // (`s *= 2` — the result is a number whatever `s` held) must widen its target the same
        // way, or the lowering's number-typed value meets a string-typed slot as STA4004
        // (plan.md §8 step 37). A pure binary (`s * 2`) only READS `s`, so only a diagnostic on
        // the compound's left widens; anything else keeps the binding it declared.
        // A 2454 use-before-assignment widens the USED binding itself: the diagnostic sits on a
        // read, and its symbol is the declaration's -- the slot starts as `undefined`
        // (JSRT_FRAME fills every slot with it), so every use must go dynamic rather than trust
        // the annotation (the 2403 rule: the admitted program must still compile).
        const target =
          diag.code === 2322 || diag.code === 2403 || diag.code === 2454
            ? token
            : token === undefined
              ? undefined
              : compoundAssignTarget(token);
        const symbol =
          target === undefined ? undefined : program.getTypeChecker().getSymbolAtLocation(target);
        if (symbol !== undefined) runtimeDynamicSymbols.add(symbol);
      }
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

  return { program, diagnostics, runtimeDynamicSymbols };
}

/** Format and print diagnostics for user output. */
export function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diag of diagnostics) {
    process.stderr.write(`${renderDiagnostic(diag)}\n`);
  }
}

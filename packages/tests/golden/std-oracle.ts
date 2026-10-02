/* The Node side of every `std/*` golden (plan.md §11c T11.2, docs/STD.md §7).
 *
 * Loaded with `--import` before each fixture's entry (support/fixture-build.ts `runNodeOracle`),
 * this resolve hook gives Node the same `std/<name>` specifiers Stator resolves: a module with a
 * native backing maps to its Node-API twin in `std-oracle/<name>.ts`, which must produce the
 * same values and the same error messages; a module without one (`std/path`, pure TypeScript)
 * maps to the real `packages/std/src/<name>.ts`, so the golden proves Stator compiles that
 * source the way Node runs it. Nothing here is linked into a Stator program. */

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORACLE_DIR = join(HERE, 'std-oracle');
const STD_SOURCE_DIR = join(HERE, '..', '..', 'std', 'src');

registerHooks({
  resolve(specifier, context, nextResolve) {
    const name = /^std\/([a-z]+)$/.exec(specifier)?.[1];
    if (name === undefined) {
      return nextResolve(specifier, context);
    }
    const oracle = join(ORACLE_DIR, `${name}.ts`);
    const file = existsSync(oracle) ? oracle : join(STD_SOURCE_DIR, `${name}.ts`);
    if (!existsSync(file)) {
      return nextResolve(specifier, context);
    }
    return { url: pathToFileURL(file).href, shortCircuit: true };
  },
});

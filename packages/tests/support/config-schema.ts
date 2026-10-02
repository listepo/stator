/* Generates `packages/compiler/schema/stator.config.schema.json` from the TypeBox schema in
 * `packages/compiler/src/cli/config.ts` (plan.md §9 Task 6.18). Run `pnpm run schema:config`
 * after changing a config key; `packages/tests/unit/config.test.ts` fails until the committed
 * file matches. */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { configSchemaDocument } from '../../compiler/src/cli/config.ts';

export const SCHEMA_PATH = fileURLToPath(
  new URL('../../compiler/schema/stator.config.schema.json', import.meta.url),
);

if (import.meta.main) {
  writeFileSync(SCHEMA_PATH, `${JSON.stringify(configSchemaDocument(), null, 2)}\n`);
  // The repository's formatter owns the layout, so `pnpm run lint` accepts the generated file.
  const oxfmt = fileURLToPath(new URL('../../../node_modules/.bin/oxfmt', import.meta.url));
  await execa(oxfmt, [SCHEMA_PATH]);
  process.stdout.write(`wrote ${SCHEMA_PATH}\n`);
}

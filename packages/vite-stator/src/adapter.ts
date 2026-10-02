/* The default bundler adapter (plan.md §11d T12.2, docs/BUNDLER.md §2–§5): one Vite SSR build of
 * the vendor entry the compiler hands over, configured for the output contract — one ESM module,
 * no code splitting, no minification, a source map. `stator build --mode=js` loads it by name
 * (`--bundler=vite`, the default) only when the program imports a package. */

import { isBuiltin } from 'node:module';
import { isAbsolute } from 'node:path';
import { build, esmExternalRequirePlugin, type Plugin, type Rolldown } from 'vite';
import type { BundleOptions, BundleResult, BundlerAdapter, VendorEntry } from 'statorc/api';

/** The vendor entry's module id: a file beside the project entry that exists only in memory, so
 * its relative specifiers (a CommonJS project file) resolve from the project's directory. */
const ENTRY_FILE = '__stator_vendor_entry__.js';

/** Serves the vendor entry's code under its in-memory id. `pre`, so no resolver looks for it on
 * disk first. */
function vendorEntryPlugin(id: string, code: string): Plugin {
  return {
    name: 'stator:vendor-entry',
    enforce: 'pre',
    resolveId: (source) => (source.replace(/\\/g, '/') === id ? id : null),
    load: (loadId) => (loadId === id ? code : null),
  };
}

/** The one module a build answers: an SSR build without code splitting has exactly one chunk. */
function onlyChunk(result: Awaited<ReturnType<typeof build>>): Rolldown.OutputChunk {
  if (!Array.isArray(result) && !('output' in result)) {
    throw new Error('vite started a watcher instead of building');
  }
  const outputs = Array.isArray(result) ? result : [result];
  const chunks = outputs.flatMap((output) =>
    output.output.filter((item): item is Rolldown.OutputChunk => item.type === 'chunk'),
  );
  const [chunk] = chunks;
  if (chunk === undefined || chunks.length !== 1) {
    throw new Error(
      `vite produced ${String(chunks.length)} chunks; the vendor bundle is one module`,
    );
  }
  return chunk;
}

/** `false` for an external built-in; `undefined` leaves every other module to Rolldown. */
function builtinSideEffects(moduleId: string, isExternal: boolean): boolean | undefined {
  return isExternal && isBuiltin(moduleId) ? false : undefined;
}

/** One Vite build of `entry`, docs/BUNDLER.md §2's table row by row. */
export async function bundle(entry: VendorEntry, options: BundleOptions): Promise<BundleResult> {
  const root = entry.resolveDir.replace(/\\/g, '/');
  const id = `${root}/${ENTRY_FILE}`;
  const external = [...options.external];
  const chunk = onlyChunk(
    await build({
      configFile: false,
      envFile: false,
      root,
      logLevel: 'silent',
      publicDir: false,
      // `require` of a built-in becomes an import (§4).
      plugins: [vendorEntryPlugin(id, entry.code), esmExternalRequirePlugin({ external })],
      // Every dependency bundled, built-ins left external. Library mode would stub `node:*`.
      ssr: { noExternal: true, target: 'node' },
      build: {
        ssr: id,
        // Nothing is written. The output sits beside the entry, so the map's sources come out
        // relative to `resolveDir`, which is what the adapter contract promises (§5).
        outDir: root,
        write: false,
        copyPublicDir: false,
        emptyOutDir: false,
        minify: false,
        sourcemap: true,
        target: 'esnext',
        rolldownOptions: {
          // Empty on purpose: Rolldown's `external` answers before any plugin, so `require` of a
          // built-in would stay `__require` through `createRequire`. The require plugin above takes
          // the whole list instead, and leaves every match external for `import` as well.
          external: [],
          // Rolldown's runtime keeps `import "node:module"` once no `__require` is left. A built-in
          // has no import side effect, so an unused one is dropped.
          treeshake: { moduleSideEffects: builtinSideEffects },
          // Vite's build turns `topLevelVar` on, which rewrites every top-level `let`/`const`.
          output: { format: 'es', codeSplitting: false, topLevelVar: false },
        },
      },
    }),
  );
  const map = chunk.map;
  if (map === null) throw new Error('vite produced no source map for the vendor bundle');
  return {
    code: chunk.code,
    map: {
      version: 3,
      sources: map.sources,
      names: map.names,
      mappings: map.mappings,
      ...(map.sourcesContent === undefined ? {} : { sourcesContent: map.sourcesContent }),
    },
    inputs: chunk.moduleIds.filter((moduleId) => isAbsolute(moduleId) && moduleId !== id),
  };
}

/** The adapter `--bundler=vite` loads: this package's default export. */
export const adapter: BundlerAdapter = { name: 'vite', bundle };

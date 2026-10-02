/* The one wrapper over `node:module`'s `SourceMap` (plan.md §11d T12.1 step 5, docs/BUNDLER.md
 * §6). Its stability index is 1.1 (active development), so nothing else in the compiler may name
 * it: a change upstream is a change to this file only. Zero dependencies, so the §0.9 budget
 * holds. */

import { SourceMap } from 'node:module';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The file a bundle position with no mapping reports (docs/BUNDLER.md §6): a helper the bundler
 * wrote, never a file the user could open. */
export const UNMAPPED_FILE = '<package bundle>';

/** What a diagnostic at such a position adds to its message: the gap is Stator's, not the user's. */
export const UNMAPPED_NOTE = ' (bundler runtime helper, no source mapping)';

/** A version-3 source map, the shape every bundler emits. Only the fields the lookup reads are
 * required; the rest pass through. */
export interface SourceMapV3 {
  readonly version: 3;
  readonly sources: readonly string[];
  readonly mappings: string;
  readonly names?: readonly string[];
  readonly sourceRoot?: string;
  readonly sourcesContent?: readonly (string | null)[];
  readonly file?: string;
}

/** Where a bundle position came from: an original file, 1-indexed line and column. */
export interface OriginalPosition {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

/** Bundle position (1-indexed line and column) to its original, or `undefined` when the bundler
 * mapped nothing there: a runtime helper it generated, never a user file. */
export type PositionMapper = (line: number, column: number) => OriginalPosition | undefined;

/** The shape check for a map that crossed an adapter boundary (golden rule 4): an adapter is
 * someone else's code, so its map is `unknown` until this says otherwise. */
export function isSourceMapV3(value: unknown): value is SourceMapV3 {
  if (typeof value !== 'object' || value === null) return false;
  if (!('version' in value) || value.version !== 3) return false;
  if (!('mappings' in value) || typeof value.mappings !== 'string') return false;
  if (!('sources' in value) || !isStringArray(value.sources)) return false;
  if (
    'sourceRoot' in value &&
    value.sourceRoot !== undefined &&
    typeof value.sourceRoot !== 'string'
  ) {
    return false;
  }
  return !('names' in value) || value.names === undefined || isStringArray(value.names);
}

function isStringArray(value: unknown): boolean {
  // `unknown[]`, not the `any[]` `Array.isArray` narrows to: Stator compiles itself in `ts` mode,
  // where an implicit `any` is STA1003 (Task 6.19).
  const items: readonly unknown[] = Array.isArray(value) ? value : [];
  return Array.isArray(value) && items.every((item) => typeof item === 'string');
}

/** A source with no file behind it: Rolldown's `\0rolldown/runtime.js` and its kin. A position
 * there is a helper the bundler wrote, so it maps to nothing a user could open. */
function isVirtualSource(source: string): boolean {
  if (source.startsWith('\0')) return true;
  // A URL scheme other than `file:` (`rolldown:runtime`, `vite/`'s `virtual:`) names no file. A
  // Windows drive letter is one letter, so it never reads as a scheme here.
  return /^[a-z][a-z0-9+.-]+:/i.test(source) && !source.startsWith('file:');
}

/** Builds the lookup. `base` is the directory `sources` are relative to (after `sourceRoot`): the
 * vendor entry's `resolveDir`, per the adapter contract (docs/BUNDLER.md §5). */
export function sourceMapper(map: SourceMapV3, base: string): PositionMapper {
  const sourceMap = new SourceMap({
    file: map.file ?? '',
    version: map.version,
    sources: [...map.sources],
    sourcesContent: (map.sourcesContent ?? []).map((text) => text ?? ''),
    names: [...(map.names ?? [])],
    mappings: map.mappings,
    sourceRoot: map.sourceRoot ?? '',
  });
  const root = map.sourceRoot ?? '';
  return (line, column) => {
    // `findEntry` answers the nearest PRECEDING mapping, even one on an earlier line, so a
    // helper that sits after mapped code would borrow that code's position. Only a mapping on
    // the asked-for line counts.
    const entry = sourceMap.findEntry(line - 1, column - 1);
    if (!('originalSource' in entry) || entry.generatedLine !== line - 1) return undefined;
    const source = entry.originalSource;
    if (isVirtualSource(source)) return undefined;
    const file = source.startsWith('file:')
      ? fileURLToPath(source)
      : isAbsolute(source)
        ? source
        : resolve(base, root, source);
    return {
      file: file.replace(/\\/g, '/'),
      line: entry.originalLine + 1,
      column: entry.originalColumn + 1,
    };
  };
}
